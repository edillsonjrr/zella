import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { db, colecao, exigirPerfil, exigirMesmaContratada, exigirTecnicoDesignado } from './admin';
import { proximoNumero } from './contadores';
import { registrarLog, resolverAutor } from './logs';
import { notificar } from './notificacoes';
import type { Orcamento, OrcamentoItem } from './types';

// O que a tela manda: só item e quantidade. Nome e preço são copiados do
// item de contrato dentro da transação — preço é acordado no contrato e
// ninguém da contratada pode propor outro.
export interface CriarOrcamentoInput {
  osId: string;
  itens: { itemContratoId: string; quantidade: number }[];
}

// Situações da OS em que cabe (novo) orçamento. Aprovada fica de fora de
// propósito: um orçamento novo ali sobrescreveria o `orcamentoId` e a
// reserva do orçamento aprovado vazaria. Quem quer trocar um orçamento
// aprovado rejeita-o ou cancela o chamado primeiro.
const SITUACOES_OS_ABERTAS_A_ORCAMENTO = ['Aberta', 'Em vistoria', 'Rejeitada'];

export const criarOrcamento = onCall<CriarOrcamentoInput>(async (request) => {
  const ctx = exigirPerfil(request, ['tecnico', 'gestor_contratado']);
  const { empresaId } = ctx;

  const { osId, itens: pedidos } = request.data;
  if (!osId || !Array.isArray(pedidos) || !pedidos.length) {
    throw new HttpsError('invalid-argument', 'Informe a OS e ao menos um item.');
  }
  for (const pedido of pedidos) {
    if (typeof pedido?.itemContratoId !== 'string' || !pedido.itemContratoId) {
      throw new HttpsError('invalid-argument', 'Item de contrato inválido no orçamento.');
    }
    if (typeof pedido.quantidade !== 'number' || !Number.isFinite(pedido.quantidade) || pedido.quantidade <= 0) {
      throw new HttpsError('invalid-argument', 'Toda linha do orçamento precisa de quantidade maior que zero.');
    }
  }

  const osRef = colecao(empresaId, 'ordensServico').doc(osId);
  const orcamentoRef = colecao(empresaId, 'orcamentos').doc();
  const autor = await resolverAutor(request, empresaId);

  await db.runTransaction(async (tx) => {
    const osSnap = await tx.get(osRef);
    if (!osSnap.exists) {
      throw new HttpsError('not-found', 'Ordem de serviço não encontrada.');
    }
    const os = osSnap.data()!;
    exigirMesmaContratada(ctx, os as { empresaContratadaId?: string });
    exigirTecnicoDesignado(ctx, os as { tecnicoId?: string });
    if (!SITUACOES_OS_ABERTAS_A_ORCAMENTO.includes(os.situacao)) {
      throw new HttpsError('failed-precondition', `A OS ${os.numero} está ${os.situacao} e não aceita novo orçamento.`);
    }
    const chamadoRef = colecao(empresaId, 'chamados').doc(os.chamadoId);

    // Nome e preço saem do item de contrato, não do corpo da chamada. Item
    // que não pertence ao contrato da OS é recusado.
    const idsUnicos = [...new Set(pedidos.map((p) => p.itemContratoId))];
    const itemRefs = idsUnicos.map((id) => colecao(empresaId, 'contratos').doc(os.contratoId).collection('itens').doc(id));
    const itemSnaps = await Promise.all(itemRefs.map((ref) => tx.get(ref)));
    const porId = new Map<string, FirebaseFirestore.DocumentData>();
    itemSnaps.forEach((snap, i) => {
      if (!snap.exists) {
        throw new HttpsError('not-found', `Item ${idsUnicos[i]} não pertence ao contrato desta OS.`);
      }
      porId.set(idsUnicos[i], snap.data()!);
    });
    const itens: OrcamentoItem[] = pedidos.map((p) => {
      const item = porId.get(p.itemContratoId)!;
      return {
        itemContratoId: p.itemContratoId,
        nome: item.nome as string,
        quantidade: p.quantidade,
        precoUnitario: Number(item.precoUnitario) || 0
      };
    });

    // Orçamento pendente anterior (reenvio em "Em vistoria") sai de cena
    // como Substituído: não pode continuar aparecendo como pendente de
    // decisão, e apagar quebraria o histórico. A leitura fica aqui e a
    // escrita mais abaixo: numa transação do Firestore todas as leituras
    // vêm antes de qualquer escrita, e o contador ainda vai ler.
    let anteriorRef: FirebaseFirestore.DocumentReference | undefined;
    if (os.orcamentoId) {
      const ref = colecao(empresaId, 'orcamentos').doc(os.orcamentoId);
      const anterior = (await tx.get(ref)).data() as Orcamento | undefined;
      if (anterior?.situacao === 'Pendente') anteriorRef = ref;
    }

    await proximoNumero(tx, empresaId, 'ORC');

    const substituido = anteriorRef?.id ?? null;
    if (anteriorRef) tx.update(anteriorRef, { situacao: 'Substituído' });

    const orcamento: Orcamento = {
      id: orcamentoRef.id,
      osId,
      empresaContratadaId: os.empresaContratadaId,
      situacao: 'Pendente',
      itens,
      dataCriacao: new Date().toISOString().split('T')[0]
    };

    tx.set(orcamentoRef, orcamento);
    tx.update(osRef, { situacao: 'Em vistoria', orcamentoId: orcamentoRef.id });
    tx.update(chamadoRef, { status: 'Em orçamento' });

    registrarLog(tx, empresaId, autor, {
      alvo: 'orcamento',
      operacao: 'criar',
      descricao: `Criou o orçamento da OS ${os.numero} com ${itens.length} item(ns)`,
      alvoId: orcamentoRef.id,
      alvoRotulo: os.numero as string,
      alvoPaiId: osId,
      detalhes: {
        os: os.numero,
        itens: itens.length,
        total: itens.reduce((soma, i) => soma + i.quantidade * i.precoUnitario, 0),
        substituiu: substituido
      }
    });

    notificar(tx, empresaId, {
      paraPerfil: 'gestor',
      titulo: `Orçamento pendente na OS ${os.numero}`,
      texto: `${autor.nome} enviou um orçamento com ${itens.length} item(ns), total R$ ${itens.reduce((s, i) => s + i.quantidade * i.precoUnitario, 0).toFixed(2)}. Aguarda sua aprovação.`,
      link: '/ordens-servico',
      alvo: { tipo: 'orcamento', id: orcamentoRef.id, numero: os.numero as string }
    });
  });

  return { id: orcamentoRef.id };
});

// Agrega quantidades por item de contrato — o orçamento pode repetir o
// mesmo item em mais de uma linha.
function agregarPorItem(itens: OrcamentoItem[]): Map<string, number> {
  const mapa = new Map<string, number>();
  for (const item of itens) {
    mapa.set(item.itemContratoId, (mapa.get(item.itemContratoId) ?? 0) + item.quantidade);
  }
  return mapa;
}

// Aprovar e rejeitar são do gestor do cliente: é o saldo do contrato dele
// que a aprovação compromete. A contratada propõe, não decide.
export interface AprovarOrcamentoInput {
  orcamentoId: string;
  // Ajuste do gestor na hora de aprovar: quantidade final por item do
  // orçamento (só pra baixo ou igual; pra cima a contratada reenvia). Quem
  // não aparece fica como foi orçado. Zero remove o item.
  ajustes?: { itemContratoId: string; quantidade: number }[];
  observacao?: string;
}

export const aprovarOrcamento = onCall<AprovarOrcamentoInput>(async (request) => {
  const ctx = exigirPerfil(request, ['gestor']);
  const { empresaId } = ctx;

  const { orcamentoId } = request.data ?? {};
  const ajustes = request.data?.ajustes;
  const observacao = (request.data?.observacao ?? '').trim().slice(0, 500);
  if (!orcamentoId) {
    throw new HttpsError('invalid-argument', 'Informe o orçamento.');
  }
  if (ajustes !== undefined) {
    if (!Array.isArray(ajustes)) {
      throw new HttpsError('invalid-argument', 'Lista de ajustes inválida.');
    }
    for (const a of ajustes) {
      if (typeof a?.itemContratoId !== 'string' || typeof a.quantidade !== 'number' || !Number.isFinite(a.quantidade) || a.quantidade < 0) {
        throw new HttpsError('invalid-argument', 'Ajuste precisa de item e quantidade maior ou igual a zero.');
      }
    }
  }
  const orcamentoRef = colecao(empresaId, 'orcamentos').doc(orcamentoId);
  const autor = await resolverAutor(request, empresaId);

  await db.runTransaction(async (tx) => {
    const orcamentoSnap = await tx.get(orcamentoRef);
    if (!orcamentoSnap.exists) {
      throw new HttpsError('not-found', 'Orçamento não encontrado.');
    }
    const orcamento = orcamentoSnap.data() as Orcamento;
    if (orcamento.situacao !== 'Pendente') {
      throw new HttpsError('failed-precondition', 'Este orçamento já foi decidido.');
    }

    const osRef = colecao(empresaId, 'ordensServico').doc(orcamento.osId);
    const osSnap = await tx.get(osRef);
    if (!osSnap.exists) {
      throw new HttpsError('not-found', 'Ordem de serviço não encontrada.');
    }
    const os = osSnap.data()!;
    exigirMesmaContratada(ctx, os as { empresaContratadaId?: string });
    const chamadoRef = colecao(empresaId, 'chamados').doc(os.chamadoId);

    // Aplica os ajustes do gestor sobre as linhas do orçamento antes de
    // reservar. Guarda o original pra auditoria.
    const orcadoPorItem = agregarPorItem(orcamento.itens);
    let itensFinais = orcamento.itens;
    const ajustesAplicados: { itemContratoId: string; nome: string; de: number; para: number }[] = [];
    if (ajustes?.length) {
      const desejado = new Map(ajustes.map((a) => [a.itemContratoId, a.quantidade]));
      for (const [id, qtd] of desejado) {
        if (!orcadoPorItem.has(id)) {
          throw new HttpsError('invalid-argument', `Item ${id} não está neste orçamento.`);
        }
        if (qtd > orcadoPorItem.get(id)!) {
          throw new HttpsError('failed-precondition', `Ajuste acima do orçado para o item ${id}: peça um novo orçamento à contratada.`);
        }
      }
      // Uma linha por item: as linhas repetidas do mesmo item são fundidas.
      const porId = new Map<string, OrcamentoItem>();
      for (const linha of orcamento.itens) {
        const atual = porId.get(linha.itemContratoId);
        porId.set(linha.itemContratoId, atual ? { ...atual, quantidade: atual.quantidade + linha.quantidade } : { ...linha });
      }
      itensFinais = [];
      for (const [id, linha] of porId) {
        const nova = desejado.has(id) ? desejado.get(id)! : linha.quantidade;
        if (nova !== linha.quantidade) ajustesAplicados.push({ itemContratoId: id, nome: linha.nome, de: linha.quantidade, para: nova });
        if (nova > 0) itensFinais.push({ ...linha, quantidade: nova });
      }
      if (!itensFinais.length) {
        throw new HttpsError('failed-precondition', 'O ajuste zerou todos os itens; rejeite o orçamento em vez de aprovar.');
      }
    }

    const porItem = agregarPorItem(itensFinais);
    const itemRefs = [...porItem.keys()].map((itemId) =>
      colecao(empresaId, 'contratos').doc(os.contratoId).collection('itens').doc(itemId)
    );
    const itemSnaps = await Promise.all(itemRefs.map((ref) => tx.get(ref)));

    // Valida saldo de TODOS os itens antes de escrever qualquer um —
    // é isso que torna a reserva atômica ("trava de saldo").
    itemSnaps.forEach((snap, i) => {
      const itemId = [...porItem.keys()][i];
      if (!snap.exists) {
        throw new HttpsError('not-found', `Item de contrato ${itemId} não encontrado.`);
      }
      const disponivel = snap.data()!.quantidadeDisponivel as number;
      const solicitado = porItem.get(itemId)!;
      if (disponivel < solicitado) {
        throw new HttpsError(
          'failed-precondition',
          `Saldo insuficiente para "${snap.data()!.nome}": disponível ${disponivel}, solicitado ${solicitado}.`
        );
      }
    });

    itemSnaps.forEach((snap, i) => {
      const itemId = [...porItem.keys()][i];
      const solicitado = porItem.get(itemId)!;
      const data = snap.data()!;
      tx.update(itemRefs[i], {
        quantidadeReservada: (data.quantidadeReservada as number) + solicitado,
        quantidadeDisponivel: (data.quantidadeDisponivel as number) - solicitado
      });
    });

    tx.update(orcamentoRef, {
      situacao: 'Aprovado',
      ...(ajustesAplicados.length ? { itens: itensFinais, itensOriginais: orcamento.itens, ajustadoPeloGestor: true } : {}),
      ...(observacao ? { observacaoAprovacao: observacao } : {})
    });
    tx.update(osRef, { situacao: 'Aprovada' });
    tx.update(chamadoRef, { status: 'A ser finalizado' });

    registrarLog(tx, empresaId, autor, {
      alvo: 'orcamento',
      operacao: 'transicao',
      descricao: `Aprovou o orçamento da OS ${os.numero}${ajustesAplicados.length ? ` com ${ajustesAplicados.length} ajuste(s) de quantidade` : ''}${observacao ? ` — ${observacao}` : ''}`,
      alvoId: orcamentoId,
      alvoRotulo: os.numero as string,
      alvoPaiId: orcamento.osId,
      detalhes: {
        situacao: { de: 'Pendente', para: 'Aprovado' },
        // A aprovação é o momento em que o saldo do contrato é reservado —
        // registrar quantos itens foram afetados ajuda a auditar o saldo.
        itensReservados: porItem.size,
        ajustes: ajustesAplicados
      }
    });

    notificar(tx, empresaId, {
      paraPerfil: 'tecnico',
      empresaContratadaId: os.empresaContratadaId,
      paraUsuarioId: os.tecnicoId ?? undefined,
      titulo: `Orçamento da OS ${os.numero} aprovado`,
      texto: ajustesAplicados.length
        ? `Aprovado com ajuste de quantidade em ${ajustesAplicados.length} item(ns). A OS pode ser executada.`
        : 'A OS pode ser executada.',
      link: '/ordens-servico',
      alvo: { tipo: 'ordemServico', id: orcamento.osId, numero: os.numero as string }
    });
    notificar(tx, empresaId, {
      paraPerfil: 'gestor_contratado',
      empresaContratadaId: os.empresaContratadaId,
      titulo: `Orçamento da OS ${os.numero} aprovado`,
      texto: 'A OS está liberada para execução.',
      link: '/ordens-servico',
      alvo: { tipo: 'ordemServico', id: orcamento.osId, numero: os.numero as string }
    });
  });

  return { ok: true };
});

export const rejeitarOrcamento = onCall<{ orcamentoId: string }>(async (request) => {
  const ctx = exigirPerfil(request, ['gestor']);
  const { empresaId } = ctx;

  const { orcamentoId } = request.data;
  const orcamentoRef = colecao(empresaId, 'orcamentos').doc(orcamentoId);
  const autor = await resolverAutor(request, empresaId);

  await db.runTransaction(async (tx) => {
    const orcamentoSnap = await tx.get(orcamentoRef);
    if (!orcamentoSnap.exists) {
      throw new HttpsError('not-found', 'Orçamento não encontrado.');
    }
    const orcamento = orcamentoSnap.data() as Orcamento;
    if (orcamento.situacao !== 'Pendente') {
      throw new HttpsError('failed-precondition', 'Este orçamento já foi decidido.');
    }

    const osRef = colecao(empresaId, 'ordensServico').doc(orcamento.osId);
    const osSnap = await tx.get(osRef);
    if (!osSnap.exists) {
      throw new HttpsError('not-found', 'Ordem de serviço não encontrada.');
    }
    exigirMesmaContratada(ctx, osSnap.data() as { empresaContratadaId?: string });
    const chamadoRef = colecao(empresaId, 'chamados').doc(osSnap.data()!.chamadoId);

    tx.update(orcamentoRef, { situacao: 'Rejeitado' });
    tx.update(osRef, { situacao: 'Rejeitada' });
    tx.update(chamadoRef, { status: 'Em atendimento' });

    registrarLog(tx, empresaId, autor, {
      alvo: 'orcamento',
      operacao: 'transicao',
      descricao: `Rejeitou o orçamento da OS ${osSnap.data()!.numero}`,
      alvoId: orcamentoId,
      alvoRotulo: osSnap.data()!.numero as string,
      alvoPaiId: orcamento.osId,
      detalhes: { situacao: { de: 'Pendente', para: 'Rejeitado' } }
    });

    const osDados = osSnap.data()!;
    notificar(tx, empresaId, {
      paraPerfil: 'gestor_contratado',
      empresaContratadaId: osDados.empresaContratadaId,
      titulo: `Orçamento da OS ${osDados.numero} rejeitado`,
      texto: 'Revise os itens e envie um novo orçamento.',
      link: '/ordens-servico',
      alvo: { tipo: 'ordemServico', id: orcamento.osId, numero: osDados.numero as string }
    });
    if (osDados.tecnicoId) {
      notificar(tx, empresaId, {
        paraUsuarioId: osDados.tecnicoId,
        titulo: `Orçamento da OS ${osDados.numero} rejeitado`,
        texto: 'Revise os itens e envie um novo orçamento.',
        link: '/ordens-servico',
        alvo: { tipo: 'ordemServico', id: orcamento.osId, numero: osDados.numero as string }
      });
    }
  });

  return { ok: true };
});
