import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { FieldValue } from 'firebase-admin/firestore';
import { db, colecao, exigirPerfil, exigirMesmaContratada } from './admin';
import { registrarLog, resolverAutor } from './logs';
import { lerSolicitante, avisarSolicitante } from './notificacoes';
import { situacaoDoServico } from '../../shared/situacao';
import type { Orcamento, OrcamentoItem } from './types';

function hojeISO(): string {
  return new Date().toISOString().split('T')[0];
}

function agregarPorItem(itens: OrcamentoItem[]): Map<string, number> {
  const mapa = new Map<string, number>();
  for (const item of itens) {
    mapa.set(item.itemContratoId, (mapa.get(item.itemContratoId) ?? 0) + item.quantidade);
  }
  return mapa;
}

/**
 * Cancela um chamado aberto por engano ou que não vai mais acontecer.
 *
 * Vale até a OS ser executada: depois disso o serviço aconteceu e o
 * caminho é encerrar. Se a OS já tinha orçamento aprovado, o saldo
 * reservado no contrato volta pro disponível — é o único ponto, fora a
 * aprovação e a execução, que mexe em saldo, e por isso fica na mesma
 * transação do cancelamento.
 */
export const cancelarChamado = onCall<{ chamadoId: string; motivo?: string }>(async (request) => {
  const ctx = exigirPerfil(request, ['gestor', 'gestor_contratado']);
  const { empresaId, usuarioId } = ctx;
  const { chamadoId } = request.data;
  const motivo = (request.data.motivo ?? '').trim().slice(0, 300);
  if (!chamadoId) {
    throw new HttpsError('invalid-argument', 'Informe o chamado.');
  }

  const chamadoRef = colecao(empresaId, 'chamados').doc(chamadoId);
  const autor = await resolverAutor(request, empresaId);

  await db.runTransaction(async (tx) => {
    const chamadoSnap = await tx.get(chamadoRef);
    if (!chamadoSnap.exists) {
      throw new HttpsError('not-found', 'Chamado não encontrado.');
    }
    const chamado = chamadoSnap.data()!;
    if (['Executado', 'Encerrado', 'Cancelado'].includes(chamado.status)) {
      throw new HttpsError(
        'failed-precondition',
        `O chamado ${chamado.numero} está "${situacaoDoServico({ chamado: { status: chamado.status } }).rotulo.toLowerCase()}" e não pode mais ser cancelado.`
      );
    }
    // A contratada só cancela chamado dos próprios contratos, o mesmo recorte
    // da regra de leitura. Chamado sem OS ainda não é de contratada nenhuma.
    if (ctx.perfil === 'gestor_contratado') {
      const dono = chamado.empresaContratadaId
        ? chamado
        : chamado.ordemServicoId
          ? (await tx.get(colecao(empresaId, 'ordensServico').doc(chamado.ordemServicoId))).data()
          : undefined;
      exigirMesmaContratada(ctx, dono);
    }
    const solicitante = await lerSolicitante(tx, empresaId, chamado);

    let saldoDevolvido = 0;
    if (chamado.ordemServicoId) {
      const osRef = colecao(empresaId, 'ordensServico').doc(chamado.ordemServicoId);
      const osSnap = await tx.get(osRef);
      const os = osSnap.data();
      if (os && os.situacao === 'Aprovada' && os.orcamentoId) {
        const orcamentoRef = colecao(empresaId, 'orcamentos').doc(os.orcamentoId);
        const orcamento = (await tx.get(orcamentoRef)).data() as Orcamento | undefined;
        if (orcamento?.situacao === 'Aprovado') {
          const porItem = agregarPorItem(orcamento.itens);
          const refs = [...porItem.keys()].map((itemId) =>
            colecao(empresaId, 'contratos').doc(os.contratoId).collection('itens').doc(itemId)
          );
          const snaps = await Promise.all(refs.map((ref) => tx.get(ref)));
          // Devolve o que está de fato separado: com um item inconsistente
          // (menos separado que o orçado), o Math.max de antes devolvia ao
          // livre mais do que saía do separado, e a conta do item deixava de
          // fechar.
          snaps.forEach((snap, i) => {
            if (!snap.exists) return;
            const qtd = porItem.get([...porItem.keys()][i])!;
            const dados = snap.data()!;
            const reservada = Number(dados.quantidadeReservada) || 0;
            const devolver = Math.min(reservada, qtd);
            tx.update(refs[i], {
              quantidadeReservada: reservada - devolver,
              quantidadeDisponivel: (Number(dados.quantidadeDisponivel) || 0) + devolver
            });
            saldoDevolvido += devolver;
          });
        }
      }
      if (os && os.situacao !== 'Executada' && os.situacao !== 'Encerrada') {
        tx.update(osRef, { situacao: 'Cancelada' });
      }
    }

    tx.update(chamadoRef, {
      status: 'Cancelado',
      dataFechamento: hojeISO()
    });

    registrarLog(tx, empresaId, autor, {
      alvo: 'chamado',
      operacao: 'transicao',
      descricao: `Cancelou o chamado ${chamado.numero}${motivo ? ` — ${motivo}` : ''}`,
      alvoId: chamadoId,
      alvoRotulo: chamado.numero as string,
      detalhes: {
        status: { de: chamado.status, para: 'Cancelado' },
        motivo: motivo || null,
        osCanceladaJunto: chamado.ordemServicoId ?? null,
        saldoDevolvido
      }
    });

    avisarSolicitante(tx, empresaId, solicitante, usuarioId, { id: chamadoId, numero: chamado.numero as string }, {
      titulo: `Pedido ${chamado.numero} cancelado`,
      texto: motivo ? `O pedido foi cancelado. Motivo: ${motivo}` : 'O pedido foi cancelado. Se o problema continuar, faça um novo pedido.'
    });
  });

  return { ok: true };
});

/**
 * Reabre um chamado encerrado ou cancelado.
 *
 * O chamado volta a "Aberto" e se desliga da OS antiga (que fica como
 * ficou, executada ou cancelada, pra história): uma reabertura é um novo
 * atendimento, que vai gerar uma OS nova.
 */
export const reabrirChamado = onCall<{ chamadoId: string; motivo?: string }>(async (request) => {
  const { empresaId } = exigirPerfil(request, ['gestor']);
  const { chamadoId } = request.data;
  const motivo = (request.data.motivo ?? '').trim().slice(0, 300);
  if (!chamadoId) {
    throw new HttpsError('invalid-argument', 'Informe o chamado.');
  }

  const chamadoRef = colecao(empresaId, 'chamados').doc(chamadoId);
  const autor = await resolverAutor(request, empresaId);

  await db.runTransaction(async (tx) => {
    const chamadoSnap = await tx.get(chamadoRef);
    if (!chamadoSnap.exists) {
      throw new HttpsError('not-found', 'Chamado não encontrado.');
    }
    const chamado = chamadoSnap.data()!;
    if (!['Encerrado', 'Cancelado'].includes(chamado.status)) {
      throw new HttpsError('failed-precondition', `O chamado ${chamado.numero} ainda está em andamento; só reabre depois de encerrado ou cancelado.`);
    }

    tx.update(chamadoRef, {
      status: 'Aberto',
      dataFechamento: FieldValue.delete(),
      ordemServicoId: FieldValue.delete(),
      empresaContratadaId: FieldValue.delete()
    });

    registrarLog(tx, empresaId, autor, {
      alvo: 'chamado',
      operacao: 'transicao',
      descricao: `Reabriu o chamado ${chamado.numero}${motivo ? ` — ${motivo}` : ''}`,
      alvoId: chamadoId,
      alvoRotulo: chamado.numero as string,
      detalhes: {
        status: { de: chamado.status, para: 'Aberto' },
        motivo: motivo || null,
        osAnterior: chamado.ordemServicoId ?? null
      }
    });
  });

  return { ok: true };
});
