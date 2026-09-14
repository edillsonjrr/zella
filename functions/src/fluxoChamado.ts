import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { FieldValue } from 'firebase-admin/firestore';
import { db, colecao, exigirPerfil } from './admin';
import { registrarLog, resolverAutor } from './logs';
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
  const { empresaId } = exigirPerfil(request, ['gestor', 'gestor_contratado']);
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
      throw new HttpsError('failed-precondition', `Chamado ${chamado.numero} está ${chamado.status} e não pode ser cancelado.`);
    }

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
          snaps.forEach((snap, i) => {
            if (!snap.exists) return;
            const qtd = porItem.get([...porItem.keys()][i])!;
            const dados = snap.data()!;
            tx.update(refs[i], {
              quantidadeReservada: Math.max(0, (dados.quantidadeReservada as number) - qtd),
              quantidadeDisponivel: (dados.quantidadeDisponivel as number) + qtd
            });
            saldoDevolvido += qtd;
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
      throw new HttpsError('failed-precondition', `Chamado ${chamado.numero} não está encerrado nem cancelado.`);
    }

    tx.update(chamadoRef, {
      status: 'Aberto',
      dataFechamento: FieldValue.delete(),
      ordemServicoId: FieldValue.delete()
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
