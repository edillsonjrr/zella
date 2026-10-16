import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { db, colecao, exigirPerfil, exigirMesmaContratada, exigirTecnicoDesignado } from './admin';
import { proximoNumero } from './contadores';
import { registrarLog, resolverAutor } from './logs';
import { notificar, lerSolicitante, avisarSolicitante } from './notificacoes';
import { validarItensForaContrato, aplicarDecisoes, totalForaContrato } from './foraContrato';
import { plural, rotuloOS } from '../../shared/historico';
import { situacaoDoServico } from '../../shared/situacao';
import { quemOrca } from './ordensServico';
import type { ItemForaContratoPedido, Orcamento, OrcamentoItem, SituacaoOS } from './types';

// O que a tela manda: só item e quantidade. Nome e preço são copiados do
// item de contrato dentro da transação — preço é acordado no contrato e
// ninguém da contratada pode propor outro.
//
// `itensForaContrato` (Z3.5) é a exceção: o que não está no contrato vem
// com descrição, unidade e preço propostos pela prestadora. Não mexe em
// saldo; a gestora aprova ou recusa cada um à parte.
export interface CriarOrcamentoInput {
  osId: string;
  itens?: { itemContratoId: string; quantidade: number }[];
  itensForaContrato?: ItemForaContratoPedido[];
}

// Situações da OS em que cabe (novo) orçamento. Aprovada fica de fora de
// propósito: um orçamento novo ali sobrescreveria o `orcamentoId` e a
// reserva do orçamento aprovado vazaria. Quem quer trocar um orçamento
// aprovado rejeita-o ou cancela o chamado primeiro.
const SITUACOES_OS_ABERTAS_A_ORCAMENTO = ['Aberta', 'Em vistoria', 'Rejeitada'];

// Situações da OS em que um orçamento pendente ainda pode ser decidido. Fora
// delas (OS cancelada junto com o chamado, contrato encerrado, OS já
// aprovada), aprovar separaria saldo para um serviço que não vai acontecer.
const SITUACOES_OS_COM_DECISAO = ['Aberta', 'Em vistoria'];

function reais(valor: number): string {
  return valor.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

function itensTexto(n: number): string {
  return plural(n, 'item', 'itens');
}

// Situação da OS em palavras, para as mensagens de erro ("aprovado,
// aguardando o serviço" em vez de "Aprovada").
function situacaoTexto(situacao: string): string {
  return situacaoDoServico({ os: { situacao: situacao as SituacaoOS } }).rotulo.toLowerCase();
}

export const criarOrcamento = onCall<CriarOrcamentoInput>(async (request) => {
  const ctx = exigirPerfil(request, ['tecnico', 'gestor_contratado']);
  const { empresaId } = ctx;

  const osId = request.data?.osId;
  const pedidos = request.data?.itens ?? [];
  if (!osId || !Array.isArray(pedidos)) {
    throw new HttpsError('invalid-argument', 'Informe a OS e ao menos um item.');
  }
  const foraContrato = validarItensForaContrato(request.data?.itensForaContrato);
  if (!pedidos.length && !foraContrato.length) {
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
      throw new HttpsError('failed-precondition', `A ${rotuloOS(os.numero)} está "${situacaoTexto(os.situacao)}" e não aceita novo orçamento.`);
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
      dataCriacao: new Date().toISOString().split('T')[0],
      ...(foraContrato.length ? { itensForaContrato: foraContrato } : {})
    };
    const totalContrato = itens.reduce((soma, i) => soma + i.quantidade * i.precoUnitario, 0);
    const totalFora = totalForaContrato(foraContrato);

    tx.set(orcamentoRef, orcamento);
    tx.update(osRef, { situacao: 'Em vistoria', orcamentoId: orcamentoRef.id });
    tx.update(chamadoRef, { status: 'Em orçamento' });

    registrarLog(tx, empresaId, autor, {
      alvo: 'orcamento',
      operacao: 'criar',
      descricao: `Enviou o orçamento da ${rotuloOS(os.numero)} com ${itensTexto(itens.length)}${foraContrato.length ? ` e ${plural(foraContrato.length, 'item fora do contrato', 'itens fora do contrato')}` : ''}`,
      alvoId: orcamentoRef.id,
      alvoRotulo: os.numero as string,
      alvoPaiId: osId,
      detalhes: {
        os: os.numero,
        itens: itens.length,
        total: totalContrato,
        ...(foraContrato.length ? { itensForaContrato: foraContrato.length, totalForaContrato: totalFora } : {}),
        substituiu: substituido
      }
    });

    notificar(tx, empresaId, {
      paraPerfil: 'gestor',
      titulo: `Orçamento para aprovar na ${rotuloOS(os.numero)}`,
      texto: foraContrato.length
        ? `${autor.nome} enviou um orçamento com ${itensTexto(itens.length)} do contrato (${reais(totalContrato)}) e ${itensTexto(foraContrato.length)} fora do contrato (${reais(totalFora)}, à parte). Aguarda sua aprovação.`
        : `${autor.nome} enviou um orçamento com ${itensTexto(itens.length)}, total ${reais(totalContrato)}. Aguarda sua aprovação.`,
      link: `/ordens-servico?os=${osId}`,
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

// Frase da notificação sobre os itens fora do contrato decididos.
function resumoForaContrato(d: { aprovados: number; recusados: number }): string {
  if (!d.aprovados && !d.recusados) return '';
  const partes: string[] = [];
  if (d.aprovados) partes.push(`${d.aprovados} aprovado${d.aprovados === 1 ? '' : 's'}`);
  if (d.recusados) partes.push(`${d.recusados} recusado${d.recusados === 1 ? '' : 's'}`);
  return `Fora do contrato: ${partes.join(', ')}. `;
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
  // Decisão sobre cada item fora do contrato (Z3.5). Obrigatória quando o
  // orçamento tem esses itens: todo item precisa de aprovar ou recusar.
  // Não separa saldo de nenhum item do contrato.
  foraContrato?: { id: string; aprovado: boolean }[];
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
    if (!SITUACOES_OS_COM_DECISAO.includes(os.situacao)) {
      throw new HttpsError('failed-precondition', `A ${rotuloOS(os.numero)} está "${situacaoTexto(os.situacao)}"; este orçamento não pode mais ser aprovado.`);
    }
    // Z0.3: a OS só fica "Aprovada" pelo orçamento que ela aponta. Um
    // orçamento que não é o atual da OS (dado antigo, ou trocado por outro)
    // deixaria a OS aprovada por um orçamento que a tela não mostra.
    if (os.orcamentoId && os.orcamentoId !== orcamentoId) {
      throw new HttpsError('failed-precondition', `Este não é o orçamento atual da ${rotuloOS(os.numero)}. Abra a OS de novo e confira o orçamento mais recente.`);
    }
    const chamadoRef = colecao(empresaId, 'chamados').doc(os.chamadoId);
    const chamadoSnap = await tx.get(chamadoRef);
    const solicitante = await lerSolicitante(tx, empresaId, chamadoSnap.data());

    // Itens fora do contrato: só a decisão da gestora, item a item. Ficam
    // de fora da reserva logo abaixo, que só lê itens do contrato.
    const foraContrato = aplicarDecisoes(orcamento.itensForaContrato, request.data?.foraContrato);

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
      if (!itensFinais.length && !foraContrato.aprovados) {
        throw new HttpsError('failed-precondition', 'O ajuste zerou todos os itens; rejeite o orçamento em vez de aprovar.');
      }
    }
    if (!itensFinais.length && !foraContrato.aprovados) {
      throw new HttpsError('failed-precondition', 'Nenhum item foi aprovado; recuse o orçamento em vez de aprovar.');
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
        const un = (snap.data()!.unidadeMedida as string | undefined)?.trim() || 'un';
        const qtd = (n: number) => `${n.toLocaleString('pt-BR')} ${un}`;
        throw new HttpsError(
          'failed-precondition',
          `Saldo insuficiente para "${snap.data()!.nome}": o orçamento pede ${qtd(solicitado)}, e o contrato só tem ${qtd(disponivel)} livres. Reduza a quantidade ou faça um aditivo.`
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
      dataAprovacao: new Date().toISOString().split('T')[0],
      ...(ajustesAplicados.length ? { itens: itensFinais, itensOriginais: orcamento.itens, ajustadoPeloGestor: true } : {}),
      ...(foraContrato.itens.length ? { itensForaContrato: foraContrato.itens } : {}),
      ...(observacao ? { observacaoAprovacao: observacao } : {})
    });
    tx.update(osRef, { situacao: 'Aprovada', orcamentoId });
    tx.update(chamadoRef, { status: 'A ser finalizado' });

    registrarLog(tx, empresaId, autor, {
      alvo: 'orcamento',
      operacao: 'transicao',
      descricao: `Aprovou o orçamento da ${rotuloOS(os.numero)}${ajustesAplicados.length ? ` com ${plural(ajustesAplicados.length, 'ajuste', 'ajustes')} de quantidade` : ''}${foraContrato.itens.length ? ` (fora do contrato: ${plural(foraContrato.aprovados, 'aprovado', 'aprovados')}, ${plural(foraContrato.recusados, 'recusado', 'recusados')})` : ''}${observacao ? ` — ${observacao}` : ''}`,
      alvoId: orcamentoId,
      alvoRotulo: os.numero as string,
      alvoPaiId: orcamento.osId,
      detalhes: {
        situacao: { de: 'Pendente', para: 'Aprovado' },
        // A aprovação é o momento em que o saldo do contrato é reservado —
        // registrar quantos itens foram afetados ajuda a auditar o saldo.
        itensReservados: porItem.size,
        ajustes: ajustesAplicados,
        ...(foraContrato.itens.length
          ? {
              foraContrato: {
                aprovados: foraContrato.aprovados,
                recusados: foraContrato.recusados,
                totalAprovado: totalForaContrato(foraContrato.itens, true)
              }
            }
          : {})
      }
    });

    notificar(tx, empresaId, {
      paraPerfil: 'tecnico',
      empresaContratadaId: os.empresaContratadaId,
      paraUsuarioId: os.tecnicoId ?? undefined,
      titulo: `Orçamento da ${rotuloOS(os.numero)} aprovado`,
      texto: `${ajustesAplicados.length ? `Aprovado com ajuste de quantidade em ${itensTexto(ajustesAplicados.length)}. ` : ''}${resumoForaContrato(foraContrato)}Faça o serviço e registre como feito.`,
      link: `/ordens-servico?os=${orcamento.osId}`,
      alvo: { tipo: 'ordemServico', id: orcamento.osId, numero: os.numero as string }
    });
    notificar(tx, empresaId, {
      paraPerfil: 'gestor_contratado',
      empresaContratadaId: os.empresaContratadaId,
      titulo: `Orçamento da ${rotuloOS(os.numero)} aprovado`,
      texto: `${resumoForaContrato(foraContrato)}O serviço está liberado: o técnico faz e registra como feito.`,
      link: `/ordens-servico?os=${orcamento.osId}`,
      alvo: { tipo: 'ordemServico', id: orcamento.osId, numero: os.numero as string }
    });

    const chamado = chamadoSnap.data();
    if (chamado) {
      avisarSolicitante(tx, empresaId, solicitante, ctx.usuarioId, { id: chamadoRef.id, numero: chamado['numero'] as string }, {
        titulo: `Pedido ${chamado['numero']} aprovado`,
        texto: 'O conserto foi aprovado. Agora o técnico vai fazer o serviço.'
      });
    }
  });

  return { ok: true };
});

export const rejeitarOrcamento = onCall<{ orcamentoId: string }>(async (request) => {
  const ctx = exigirPerfil(request, ['gestor']);
  const { empresaId } = ctx;

  const { orcamentoId } = request.data;
  if (!orcamentoId) {
    throw new HttpsError('invalid-argument', 'Informe o orçamento.');
  }
  const orcamentoRef = colecao(empresaId, 'orcamentos').doc(orcamentoId);
  const autor = await resolverAutor(request, empresaId);
  // Fora da transação: decide só quem recebe o aviso para refazer (Z0.4).
  // Com responsável da contratada, é ele quem orça; o técnico não recebe
  // "envie um novo orçamento".
  const previa = (await orcamentoRef.get()).data();
  const orca = await quemOrca(empresaId, previa?.['empresaContratadaId']);

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
    if (!SITUACOES_OS_COM_DECISAO.includes(osSnap.data()!.situacao)) {
      throw new HttpsError('failed-precondition', `A ${rotuloOS(osSnap.data()!.numero)} está "${situacaoTexto(osSnap.data()!.situacao)}"; este orçamento não pode mais ser recusado.`);
    }
    const chamadoRef = colecao(empresaId, 'chamados').doc(osSnap.data()!.chamadoId);

    tx.update(orcamentoRef, { situacao: 'Rejeitado' });
    tx.update(osRef, { situacao: 'Rejeitada' });
    tx.update(chamadoRef, { status: 'Em atendimento' });

    registrarLog(tx, empresaId, autor, {
      alvo: 'orcamento',
      operacao: 'transicao',
      descricao: `Recusou o orçamento da ${rotuloOS(osSnap.data()!.numero)}`,
      alvoId: orcamentoId,
      alvoRotulo: osSnap.data()!.numero as string,
      alvoPaiId: orcamento.osId,
      detalhes: { situacao: { de: 'Pendente', para: 'Rejeitado' } }
    });

    const osDados = osSnap.data()!;
    notificar(tx, empresaId, {
      paraPerfil: 'gestor_contratado',
      empresaContratadaId: osDados.empresaContratadaId,
      titulo: `Orçamento da ${rotuloOS(osDados.numero)} recusado`,
      texto: 'Revise os itens e envie um novo orçamento.',
      link: `/ordens-servico?os=${orcamento.osId}`,
      alvo: { tipo: 'ordemServico', id: orcamento.osId, numero: osDados.numero as string }
    });
    if (osDados.tecnicoId && orca === 'tecnico') {
      notificar(tx, empresaId, {
        paraUsuarioId: osDados.tecnicoId,
        titulo: `Orçamento da ${rotuloOS(osDados.numero)} recusado`,
        texto: 'Revise os itens e envie um novo orçamento.',
        link: `/ordens-servico?os=${orcamento.osId}`,
        alvo: { tipo: 'ordemServico', id: orcamento.osId, numero: osDados.numero as string }
      });
    }
  });

  return { ok: true };
});
