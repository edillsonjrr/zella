import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { db, colecao, exigirPerfil, exigirMesmaContratada, exigirTecnicoDesignado } from './admin';
import { registrarLog, resolverAutor } from './logs';
import { notificar, lerSolicitante, avisarSolicitante } from './notificacoes';
import { salvarImagem } from './fotos';
import { registrarExecucaoForaContrato } from './foraContrato';
import { rotuloOS } from '../../shared/historico';
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
  // Itens fora do contrato aprovados (Z3.5): quanto foi usado de cada um.
  // Quem não aparece conta como usado por inteiro. Não mexe em saldo.
  foraContrato?: { id: string; quantidadeExecutada: number }[];
  observacao?: string;
  // Fotos da execução (data URL jpeg/png/webp, até 3, 4 MB cada). Sobem
  // pro Storage antes da transação; o caminho fica em `fotosExecucao`.
  fotos?: string[];
}

const MAX_FOTOS_EXECUCAO = 3;

function unidadesDevolvidas(n: number): string {
  return n === 1 ? '1 unidade voltou' : `${n} unidades voltaram`;
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

  const fotos = request.data?.fotos ?? [];
  if (!Array.isArray(fotos) || fotos.length > MAX_FOTOS_EXECUCAO || fotos.some((f) => typeof f !== 'string')) {
    throw new HttpsError('invalid-argument', `Envie no máximo ${MAX_FOTOS_EXECUCAO} fotos.`);
  }

  const osRef = colecao(empresaId, 'ordensServico').doc(osId);
  const autor = await resolverAutor(request, empresaId);

  // Fotos sobem fora da transação (upload não é transacional). Antes, uma
  // leitura rápida confere permissão e estado pra não subir arquivo à toa;
  // a transação repete a checagem com a versão final do documento.
  const previa = (await osRef.get()).data();
  if (!previa) {
    throw new HttpsError('not-found', 'Ordem de serviço não encontrada.');
  }
  exigirMesmaContratada(ctx, previa as { empresaContratadaId?: string });
  exigirTecnicoDesignado(ctx, previa as { tecnicoId?: string });
  if (previa.situacao !== 'Aprovada') {
    throw new HttpsError('failed-precondition', 'O serviço só pode ser registrado depois que a gestão aprovar o orçamento.');
  }
  const fotosExecucao: string[] = [];
  for (const [i, foto] of fotos.entries()) {
    fotosExecucao.push(await salvarImagem(`empresasClientes/${empresaId}/ordensServico/${osId}/execucao-${i + 1}`, foto));
  }

  await db.runTransaction(async (tx) => {
    const osSnap = await tx.get(osRef);
    if (!osSnap.exists) {
      throw new HttpsError('not-found', 'Ordem de serviço não encontrada.');
    }
    const os = osSnap.data()!;
    exigirMesmaContratada(ctx, os as { empresaContratadaId?: string });
    exigirTecnicoDesignado(ctx, os as { tecnicoId?: string });
    if (os.situacao !== 'Aprovada') {
      throw new HttpsError('failed-precondition', 'O serviço só pode ser registrado depois que a gestão aprovar o orçamento.');
    }

    const chamadoRef = colecao(empresaId, 'chamados').doc(os.chamadoId);
    const chamadoSnap = await tx.get(chamadoRef);
    const solicitante = await lerSolicitante(tx, empresaId, chamadoSnap.data());

    let orcamento: Orcamento | undefined;
    if (os.orcamentoId) {
      const orcamentoSnap = await tx.get(colecao(empresaId, 'orcamentos').doc(os.orcamentoId));
      if (orcamentoSnap.exists) orcamento = orcamentoSnap.data() as Orcamento;
    }
    // Z0.3: OS "Aprovada" sem orçamento aprovado (dado antigo) não registra
    // serviço: não haveria o que tirar do separado, e a OS fecharia sem itens.
    if (orcamento?.situacao !== 'Aprovado') {
      throw new HttpsError(
        'failed-precondition',
        `A ${rotuloOS(os.numero)} não tem orçamento aprovado. Peça à empresa contratada um orçamento e à gestão a aprovação antes de registrar o serviço.`
      );
    }

    const foraContrato = registrarExecucaoForaContrato(orcamento?.itensForaContrato, request.data?.foraContrato);
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
    // disponível. A conta contratada = disponível + reservada + consumida
    // não pode mudar: o que sai da reserva (`liberado`) é exatamente o que
    // entra em consumido e disponível. Se o item tiver menos reservado que o
    // orçado (dado antigo inconsistente), libera só o que existe, em vez de
    // criar saldo do nada como fazia o Math.max de antes.
    let devolvido = 0;
    const resumo: { itemContratoId: string; nome: string; orcado: number; executado: number }[] = [];
    itemSnaps.forEach((snap, i) => {
      if (!snap.exists) return;
      const id = itemIds[i];
      const qtdOrcada = orcado.get(id)!;
      const qtdExecutada = executadoPorItem.get(id)!;
      const d = snap.data()!;
      const reservada = Number(d.quantidadeReservada) || 0;
      const liberado = Math.min(reservada, qtdOrcada);
      const sobra = liberado - qtdExecutada;
      tx.update(itemRefs[i], {
        quantidadeReservada: reservada - liberado,
        quantidadeConsumida: (Number(d.quantidadeConsumida) || 0) + qtdExecutada,
        quantidadeDisponivel: (Number(d.quantidadeDisponivel) || 0) + sobra
      });
      devolvido += Math.max(0, qtdOrcada - qtdExecutada);
      resumo.push({ itemContratoId: id, nome: d.nome as string, orcado: qtdOrcada, executado: qtdExecutada });
    });

    tx.update(osRef, {
      situacao: 'Executada',
      dataExecucao: new Date().toISOString().split('T')[0],
      executadoPor: ctx.usuarioId,
      itensExecutados: resumo,
      ...(foraContrato.length ? { itensForaContratoExecutados: foraContrato } : {}),
      ...(observacao ? { observacaoExecucao: observacao } : {}),
      ...(fotosExecucao.length ? { fotosExecucao } : {})
    });
    tx.update(chamadoRef, { status: 'Executado' });

    registrarLog(tx, empresaId, autor, {
      alvo: 'ordemServico',
      operacao: 'transicao',
      descricao: `Registrou o serviço da ${rotuloOS(os.numero)} como feito${devolvido ? ` (parcial: ${unidadesDevolvidas(devolvido)} ao contrato)` : ''}${observacao ? ` — ${observacao}` : ''}`,
      alvoId: osId,
      alvoRotulo: os.numero as string,
      detalhes: {
        situacao: { de: 'Aprovada', para: 'Executada' },
        chamado: { statusPara: 'Executado' },
        itens: resumo,
        devolvidoAoContrato: devolvido,
        ...(foraContrato.length ? { foraContrato } : {})
      }
    });

    notificar(tx, empresaId, {
      paraPerfil: 'gestor',
      titulo: `Serviço feito na ${rotuloOS(os.numero)}`,
      texto: devolvido
        ? `Feito em parte: ${unidadesDevolvidas(devolvido)} ao saldo livre do contrato. Confira e encerre o chamado.`
        : 'Confira o serviço e encerre o chamado.',
      link: `/ordens-servico?os=${osId}`,
      alvo: { tipo: 'ordemServico', id: osId, numero: os.numero as string }
    });

    const chamado = chamadoSnap.data();
    if (chamado) {
      avisarSolicitante(tx, empresaId, solicitante, ctx.usuarioId, { id: chamadoRef.id, numero: chamado['numero'] as string }, {
        titulo: `Serviço feito no pedido ${chamado['numero']}`,
        texto: `${autor.nome} registrou o serviço como feito. Falta a gestão encerrar o pedido.`
      });
    }
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
  const { empresaId, usuarioId } = exigirPerfil(request, ['gestor']);

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
        `O chamado ${chamado.numero} ainda não teve o serviço registrado como feito. Só dá para encerrar depois disso; se o serviço não vai acontecer, cancele o chamado.`
      );
    }
    const solicitante = await lerSolicitante(tx, empresaId, chamado);

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

    avisarSolicitante(tx, empresaId, solicitante, usuarioId, { id: chamadoId, numero: chamado.numero as string }, {
      titulo: `Pedido ${chamado.numero} concluído`,
      texto: 'A gestão conferiu e encerrou o pedido. Abra para ver o resumo do serviço.'
    });
  });

  return { ok: true };
});
