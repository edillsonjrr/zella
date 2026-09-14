import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { db, colecao, exigirPerfil, exigirMesmaContratada, exigirTecnicoDesignado } from './admin';
import { registrarLog, resolverAutor } from './logs';
import { notificar } from './notificacoes';
import type { Orcamento, OrcamentoItem } from './types';

function agregarPorItem(itens: OrcamentoItem[]): Map<string, number> {
  const mapa = new Map<string, number>();
  for (const item of itens) {
    mapa.set(item.itemContratoId, (mapa.get(item.itemContratoId) ?? 0) + item.quantidade);
  }
  return mapa;
}

export interface ExecutarOSInput {
  osId: string;
  // Execução parcial: quantidade realmente executada por item. Quem não
  // aparece conta como executado por inteiro. O que sobrar da reserva volta
  // pro disponível do contrato.
  itens?: { itemContratoId: string; quantidadeExecutada: number }[];
  observacao?: string;
}

/**
 * Executa a OS: move o reservado do orçamento aprovado para consumido.
 *
 * Com `itens`, a execução é parcial: consome só o executado e devolve o
 * restante da reserva ao disponível. Sem `itens`, consome tudo o que foi
 * orçado. Técnico só executa OS designada a ele (ou sem técnico).
 */
export const executarOS = onCall<ExecutarOSInput>(async (request) => {
  const ctx = exigirPerfil(request, ['tecnico', 'gestor_contratado']);
  const { empresaId } = ctx;

  const { osId } = request.data ?? {};
  const observacao = (request.data?.observacao ?? '').trim().slice(0, 500);
  const parciais = request.data?.itens;
  if (!osId) {
    throw new HttpsError('invalid-argument', 'Informe a OS.');
  }
  if (parciais !== undefined) {
    if (!Array.isArray(parciais)) {
      throw new HttpsError('invalid-argument', 'Lista de itens inválida.');
    }
    for (const p of parciais) {
      if (typeof p?.itemContratoId !== 'string' || typeof p.quantidadeExecutada !== 'number' || !Number.isFinite(p.quantidadeExecutada) || p.quantidadeExecutada < 0) {
        throw new HttpsError('invalid-argument', 'Quantidade executada precisa ser um número maior ou igual a zero.');
      }
    }
  }

  const osRef = colecao(empresaId, 'ordensServico').doc(osId);
  const autor = await resolverAutor(request, empresaId);

  await db.runTransaction(async (tx) => {
    const osSnap = await tx.get(osRef);
    if (!osSnap.exists) {
      throw new HttpsError('not-found', 'Ordem de serviço não encontrada.');
    }
    const os = osSnap.data()!;
    exigirMesmaContratada(ctx, os as { empresaContratadaId?: string });
    exigirTecnicoDesignado(ctx, os as { tecnicoId?: string });
    if (os.situacao !== 'Aprovada') {
      throw new HttpsError('failed-precondition', 'A OS precisa estar Aprovada para ser executada.');
    }

    const chamadoRef = colecao(empresaId, 'chamados').doc(os.chamadoId);

    let orcamento: Orcamento | undefined;
    if (os.orcamentoId) {
      const orcamentoSnap = await tx.get(colecao(empresaId, 'orcamentos').doc(os.orcamentoId));
      if (orcamentoSnap.exists) orcamento = orcamentoSnap.data() as Orcamento;
    }

    const orcado = orcamento ? agregarPorItem(orcamento.itens) : new Map<string, number>();
    const executadoPorItem = new Map<string, number>(orcado);
    if (parciais) {
      for (const p of parciais) {
        if (!orcado.has(p.itemContratoId)) {
          throw new HttpsError('invalid-argument', `Item ${p.itemContratoId} não está no orçamento desta OS.`);
        }
        if (p.quantidadeExecutada > orcado.get(p.itemContratoId)!) {
          throw new HttpsError('failed-precondition', `Executado acima do orçado para o item ${p.itemContratoId}: máximo ${orcado.get(p.itemContratoId)}.`);
        }
        executadoPorItem.set(p.itemContratoId, p.quantidadeExecutada);
      }
    }

    const itemIds = [...orcado.keys()];
    const itemRefs = itemIds.map((id) => colecao(empresaId, 'contratos').doc(os.contratoId).collection('itens').doc(id));
    const itemSnaps = await Promise.all(itemRefs.map((ref) => tx.get(ref)));

    // Reservado -> consumido pelo executado; a sobra da reserva volta ao
    // disponível. O total reservado+disponível+consumido não muda.
    let devolvido = 0;
    const resumo: { itemContratoId: string; nome: string; orcado: number; executado: number }[] = [];
    itemSnaps.forEach((snap, i) => {
      if (!snap.exists) return;
      const id = itemIds[i];
      const qtdOrcada = orcado.get(id)!;
      const qtdExecutada = executadoPorItem.get(id)!;
      const sobra = qtdOrcada - qtdExecutada;
      const d = snap.data()!;
      tx.update(itemRefs[i], {
        quantidadeReservada: Math.max(0, (d.quantidadeReservada as number) - qtdOrcada),
        quantidadeConsumida: (d.quantidadeConsumida as number) + qtdExecutada,
        quantidadeDisponivel: (d.quantidadeDisponivel as number) + sobra
      });
      devolvido += sobra;
      resumo.push({ itemContratoId: id, nome: d.nome as string, orcado: qtdOrcada, executado: qtdExecutada });
    });

    tx.update(osRef, {
      situacao: 'Executada',
      dataExecucao: new Date().toISOString().split('T')[0],
      executadoPor: ctx.usuarioId,
      itensExecutados: resumo,
      ...(observacao ? { observacaoExecucao: observacao } : {})
    });
    tx.update(chamadoRef, { status: 'Executado' });

    registrarLog(tx, empresaId, autor, {
      alvo: 'ordemServico',
      operacao: 'transicao',
      descricao: `Executou a OS ${os.numero}${devolvido ? ` (parcial: ${devolvido} unidade(s) devolvida(s) ao contrato)` : ''}${observacao ? ` — ${observacao}` : ''}`,
      alvoId: osId,
      alvoRotulo: os.numero as string,
      detalhes: {
        situacao: { de: 'Aprovada', para: 'Executada' },
        chamado: { statusPara: 'Executado' },
        itens: resumo,
        devolvidoAoContrato: devolvido
      }
    });

    notificar(tx, empresaId, {
      paraPerfil: 'gestor',
      titulo: `OS ${os.numero} executada`,
      texto: devolvido
        ? `Execução parcial: ${devolvido} unidade(s) voltaram ao saldo do contrato. O chamado está pronto para encerrar.`
        : 'O chamado está pronto para encerrar.',
      link: '/ordens-servico',
      alvo: { tipo: 'ordemServico', id: osId, numero: os.numero as string }
    });
  });

  return { ok: true };
});

/**
 * Encerra o chamado depois do serviço feito.
 *
 * Só a partir de "Executado": antes disso a OS aprovada ainda tem saldo
 * reservado, e encerrar aqui deixaria essa reserva presa pra sempre (nem
 * consumida, nem devolvida). Quem não vai mais executar cancela o chamado,
 * que é o caminho que devolve a reserva.
 */
export const encerrarChamado = onCall<{ chamadoId: string }>(async (request) => {
  const { empresaId } = exigirPerfil(request, ['gestor']);

  const { chamadoId } = request.data;
  const chamadoRef = colecao(empresaId, 'chamados').doc(chamadoId);
  const autor = await resolverAutor(request, empresaId);

  await db.runTransaction(async (tx) => {
    const chamadoSnap = await tx.get(chamadoRef);
    if (!chamadoSnap.exists) {
      throw new HttpsError('not-found', 'Chamado não encontrado.');
    }
    const chamado = chamadoSnap.data()!;
    if (chamado.status !== 'Executado') {
      throw new HttpsError(
        'failed-precondition',
        `Chamado ${chamado.numero} está ${chamado.status}. Só um chamado Executado pode ser encerrado; se o serviço não vai acontecer, cancele-o.`
      );
    }

    tx.update(chamadoRef, {
      status: 'Encerrado',
      dataFechamento: new Date().toISOString().split('T')[0]
    });

    if (chamado.ordemServicoId) {
      const osRef = colecao(empresaId, 'ordensServico').doc(chamado.ordemServicoId);
      tx.update(osRef, { situacao: 'Encerrada' });
    }

    registrarLog(tx, empresaId, autor, {
      alvo: 'chamado',
      operacao: 'transicao',
      descricao: `Encerrou o chamado ${chamado.numero}`,
      alvoId: chamadoId,
      alvoRotulo: chamado.numero as string,
      detalhes: {
        status: { de: chamado.status, para: 'Encerrado' },
        osEncerradaJunto: chamado.ordemServicoId ?? null
      }
    });
  });

  return { ok: true };
});
