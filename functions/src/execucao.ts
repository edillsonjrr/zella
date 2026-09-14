import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { db, colecao, exigirPerfil, exigirMesmaContratada } from './admin';
import { registrarLog, resolverAutor } from './logs';
import type { Orcamento, OrcamentoItem } from './types';

function agregarPorItem(itens: OrcamentoItem[]): Map<string, number> {
  const mapa = new Map<string, number>();
  for (const item of itens) {
    mapa.set(item.itemContratoId, (mapa.get(item.itemContratoId) ?? 0) + item.quantidade);
  }
  return mapa;
}

export const executarOS = onCall<{ osId: string }>(async (request) => {
  const ctx = exigirPerfil(request, ['tecnico', 'gestor_contratado']);
  const { empresaId } = ctx;

  const { osId } = request.data;
  const osRef = colecao(empresaId, 'ordensServico').doc(osId);
  const autor = await resolverAutor(request, empresaId);

  await db.runTransaction(async (tx) => {
    const osSnap = await tx.get(osRef);
    if (!osSnap.exists) {
      throw new HttpsError('not-found', 'Ordem de serviço não encontrada.');
    }
    const os = osSnap.data()!;
    exigirMesmaContratada(ctx, os as { empresaContratadaId?: string });
    if (os.situacao !== 'Aprovada') {
      throw new HttpsError('failed-precondition', 'A OS precisa estar Aprovada para ser executada.');
    }

    const chamadoRef = colecao(empresaId, 'chamados').doc(os.chamadoId);

    let orcamento: Orcamento | undefined;
    let orcamentoRef: FirebaseFirestore.DocumentReference | undefined;
    if (os.orcamentoId) {
      orcamentoRef = colecao(empresaId, 'orcamentos').doc(os.orcamentoId);
      const orcamentoSnap = await tx.get(orcamentoRef);
      if (orcamentoSnap.exists) {
        orcamento = orcamentoSnap.data() as Orcamento;
      }
    }

    let itemRefs: FirebaseFirestore.DocumentReference[] = [];
    let itemSnaps: FirebaseFirestore.DocumentSnapshot[] = [];
    let porItem = new Map<string, number>();

    if (orcamento) {
      porItem = agregarPorItem(orcamento.itens);
      itemRefs = [...porItem.keys()].map((itemId) =>
        colecao(empresaId, 'contratos').doc(os.contratoId).collection('itens').doc(itemId)
      );
      itemSnaps = await Promise.all(itemRefs.map((ref) => tx.get(ref)));
    }

    // Move reservado -> consumido (o saldo já foi validado na aprovação;
    // aqui só transfere entre os dois "baldes", disponível não muda).
    itemSnaps.forEach((snap, i) => {
      if (!snap.exists) return;
      const itemId = [...porItem.keys()][i];
      const qtd = porItem.get(itemId)!;
      const data = snap.data()!;
      tx.update(itemRefs[i], {
        quantidadeReservada: Math.max(0, (data.quantidadeReservada as number) - qtd),
        quantidadeConsumida: (data.quantidadeConsumida as number) + qtd
      });
    });

    tx.update(osRef, { situacao: 'Executada' });
    tx.update(chamadoRef, { status: 'Executado' });

    registrarLog(tx, empresaId, autor, {
      alvo: 'ordemServico',
      operacao: 'transicao',
      descricao: `Executou a OS ${os.numero}`,
      alvoId: osId,
      alvoRotulo: os.numero as string,
      detalhes: {
        situacao: { de: 'Aprovada', para: 'Executada' },
        chamado: { statusPara: 'Executado' },
        itensBaixados: porItem.size
      }
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
