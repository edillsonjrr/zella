import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { FieldValue } from 'firebase-admin/firestore';
import { db, colecao, exigirPerfil, exigirMesmaContratada } from './admin';
import { proximoNumero } from './contadores';
import { registrarLog, resolverAutor } from './logs';
import { notificar, lerSolicitante, avisarSolicitante } from './notificacoes';
import { rotuloOS } from '../../shared/historico';
import type { OrdemServico } from './types';

/**
 * Quem manda o orçamento na contratada (Z0.4). Com responsável da
 * contratada cadastrado, é ele: foi ele quem recebeu "Aguarda orçamento", e
 * o técnico só executa depois da aprovação. Sem responsável, o técnico é a
 * única pessoa da contratada no sistema e orça ele mesmo. A callable aceita
 * orçamento dos dois perfis; isto só decide o que cada um recebe de aviso.
 */
export async function quemOrca(empresaId: string, empresaContratadaId: string | undefined): Promise<'prestadora' | 'tecnico'> {
  if (!empresaContratadaId) return 'tecnico';
  const snap = await colecao(empresaId, 'usuarios')
    .where('empresaContratadaId', '==', empresaContratadaId)
    .where('perfil', '==', 'gestor_contratado')
    .limit(1)
    .get();
  return snap.empty ? 'tecnico' : 'prestadora';
}

/** O que o técnico designado precisa fazer, conforme a etapa da OS e quem orça. */
export function textoParaTecnico(situacao: string, orca: 'prestadora' | 'tecnico'): string {
  if (situacao === 'Aprovada') return 'O orçamento já foi aprovado: faça o serviço e registre como feito.';
  if (orca === 'tecnico') return 'Confira o pedido e envie o orçamento para a gestão aprovar.';
  return 'Sua empresa manda o orçamento. Depois que a gestão aprovar, você faz o serviço e registra como feito.';
}

export interface CriarOSInput {
  chamadoId: string;
  contratoId: string;
  tecnicoId?: string;
}

// Só o gestor do cliente transforma chamado em OS. A contratada não enxerga
// os chamados que ainda não são dela (rodada 3), então não escolhe chamado.
export const criarOS = onCall<CriarOSInput>(async (request) => {
  const ctx = exigirPerfil(request, ['gestor']);
  const { empresaId } = ctx;

  const { chamadoId, contratoId, tecnicoId } = request.data;
  if (!chamadoId || !contratoId) {
    throw new HttpsError('invalid-argument', 'Informe o chamado de origem e o contrato.');
  }

  const chamadoRef = colecao(empresaId, 'chamados').doc(chamadoId);
  const contratoRef = colecao(empresaId, 'contratos').doc(contratoId);
  const osRef = colecao(empresaId, 'ordensServico').doc();
  const autor = await resolverAutor(request, empresaId);

  // Técnico escolhido na criação: precisa ser técnico e, conferido dentro da
  // transação, da contratada do contrato (a mesma regra de atribuirTecnicoOS).
  // Antes a tela listava técnicos de todas as contratadas, e a OS nascia com
  // alguém que o detalhe da OS não mostrava.
  let tecnico: FirebaseFirestore.DocumentData | undefined;
  if (tecnicoId) {
    tecnico = (await colecao(empresaId, 'usuarios').doc(tecnicoId).get()).data();
    if (!tecnico || tecnico['perfil'] !== 'tecnico') {
      throw new HttpsError('invalid-argument', 'O usuário escolhido não é um técnico.');
    }
  }
  // Fora da transação: só decide o texto do aviso ao técnico.
  const orca = tecnicoId ? await quemOrca(empresaId, (await contratoRef.get()).data()?.['empresaContratadaId']) : 'tecnico';

  const numero = await db.runTransaction(async (tx) => {
    const chamadoSnap = await tx.get(chamadoRef);
    if (!chamadoSnap.exists) {
      throw new HttpsError('not-found', 'Chamado não encontrado.');
    }
    if (chamadoSnap.data()!.ordemServicoId) {
      throw new HttpsError('failed-precondition', 'Este chamado já tem uma ordem de serviço.');
    }
    if (chamadoSnap.data()!.status === 'Cancelado') {
      throw new HttpsError('failed-precondition', 'Chamado cancelado não recebe OS. Reabra-o antes.');
    }

    // Contrato encerrado ou vencido não sustenta OS nova: o saldo dele não
    // pode mais ser comprometido.
    const contratoSnap = await tx.get(contratoRef);
    if (!contratoSnap.exists) {
      throw new HttpsError('not-found', 'Contrato não encontrado.');
    }
    const contrato = contratoSnap.data()!;
    const hoje = new Date().toISOString().split('T')[0];
    if (contrato.status === 'Encerrado' || (typeof contrato.vigenciaFim === 'string' && contrato.vigenciaFim < hoje)) {
      throw new HttpsError('failed-precondition', `O contrato ${contrato.numero} está encerrado ou vencido.`);
    }
    exigirMesmaContratada(ctx, contrato as { empresaContratadaId?: string });
    if (tecnico && contrato.empresaContratadaId && tecnico['empresaContratadaId'] !== contrato.empresaContratadaId) {
      throw new HttpsError('failed-precondition', 'O técnico precisa ser da empresa contratada do contrato escolhido.');
    }

    // Leitura antes do contador: ele já escreve, e depois de uma escrita a
    // transação não aceita mais leituras.
    const solicitante = await lerSolicitante(tx, empresaId, chamadoSnap.data());

    const numero = await proximoNumero(tx, empresaId, 'OS');

    const os: OrdemServico = {
      id: osRef.id,
      numero,
      chamadoId,
      contratoId,
      tecnicoId,
      unidadeId: chamadoSnap.data()!.unidadeId,
      empresaContratadaId: contrato.empresaContratadaId,
      situacao: 'Aberta',
      dataCriacao: new Date().toISOString().split('T')[0]
    };

    tx.set(osRef, os);
    // A empresa contratada vai junto para o chamado: é por este campo que a
    // regra deixa a contratada ler só os chamados dos próprios contratos.
    tx.update(chamadoRef, {
      status: 'Em atendimento',
      ordemServicoId: osRef.id,
      empresaContratadaId: contrato.empresaContratadaId ?? FieldValue.delete()
    });

    registrarLog(tx, empresaId, autor, {
      alvo: 'ordemServico',
      operacao: 'criar',
      descricao: `Criou a ${rotuloOS(numero)} a partir do chamado ${chamadoSnap.data()!.numero}`,
      alvoId: osRef.id,
      alvoRotulo: numero,
      alvoPaiId: chamadoId,
      detalhes: { chamado: chamadoSnap.data()!.numero, contratoId, tecnicoId: tecnicoId ?? null }
    });

    // Avisa a contratada dona do contrato (e o técnico, se já designado).
    if (contrato.empresaContratadaId) {
      notificar(tx, empresaId, {
        paraPerfil: 'gestor_contratado',
        empresaContratadaId: contrato.empresaContratadaId,
        titulo: `Nova ${rotuloOS(numero)}`,
        texto: `Aberta no contrato ${contrato.numero} para o chamado ${chamadoSnap.data()!.numero}. Aguarda o orçamento da sua empresa.`,
        link: `/ordens-servico?os=${osRef.id}`,
        alvo: { tipo: 'ordemServico', id: osRef.id, numero }
      });
    }
    if (tecnicoId) {
      notificar(tx, empresaId, {
        paraUsuarioId: tecnicoId,
        titulo: `${rotuloOS(numero)} designada a você`,
        texto: `Chamado ${chamadoSnap.data()!.numero}: ${chamadoSnap.data()!.equipamento}. ${textoParaTecnico('Aberta', orca)}`,
        link: `/ordens-servico?os=${osRef.id}`,
        alvo: { tipo: 'ordemServico', id: osRef.id, numero }
      });
    }

    // Quem pediu fica sabendo que o pedido saiu da mesa da gestão.
    avisarSolicitante(tx, empresaId, solicitante, ctx.usuarioId, { id: chamadoId, numero: chamadoSnap.data()!.numero as string }, {
      titulo: `Pedido ${chamadoSnap.data()!.numero} encaminhado`,
      texto: `Seu pedido foi enviado à empresa contratada (${rotuloOS(numero)}). Ela vai avaliar o serviço.`
    });

    return numero;
  });

  return { id: osRef.id, numero };
});

/**
 * Designa (ou troca) o técnico da OS. Gestor do cliente ou gestor da
 * contratada dona da OS; só enquanto a OS ainda não foi executada. O
 * técnico precisa ser da mesma contratada da OS.
 */
export const atribuirTecnicoOS = onCall<{ osId: string; tecnicoId: string | null }>(async (request) => {
  const ctx = exigirPerfil(request, ['gestor', 'gestor_contratado']);
  const { empresaId } = ctx;
  const { osId, tecnicoId } = request.data ?? {};
  if (!osId) {
    throw new HttpsError('invalid-argument', 'Informe a OS.');
  }

  const osRef = colecao(empresaId, 'ordensServico').doc(osId);
  const autor = await resolverAutor(request, empresaId);

  let nomeTecnico = 'ninguém';
  let tecnico: FirebaseFirestore.DocumentData | undefined;
  if (tecnicoId) {
    tecnico = (await colecao(empresaId, 'usuarios').doc(tecnicoId).get()).data();
    if (!tecnico || tecnico['perfil'] !== 'tecnico') {
      throw new HttpsError('invalid-argument', 'O usuário informado não é um técnico.');
    }
    nomeTecnico = (tecnico['nome'] as string) ?? tecnicoId;
  }
  // Fora da transação: só decide o texto do aviso ao técnico.
  const orca = tecnicoId ? await quemOrca(empresaId, (await osRef.get()).data()?.['empresaContratadaId']) : 'tecnico';

  await db.runTransaction(async (tx) => {
    const snap = await tx.get(osRef);
    if (!snap.exists) {
      throw new HttpsError('not-found', 'Ordem de serviço não encontrada.');
    }
    const os = snap.data()!;
    exigirMesmaContratada(ctx, os as { empresaContratadaId?: string });
    if (['Executada', 'Encerrada', 'Cancelada'].includes(os.situacao)) {
      throw new HttpsError('failed-precondition', `A ${rotuloOS(os.numero)} já foi ${os.situacao === 'Cancelada' ? 'cancelada' : 'feita'} e não muda mais de técnico.`);
    }
    if (tecnico && os.empresaContratadaId && tecnico['empresaContratadaId'] !== os.empresaContratadaId) {
      throw new HttpsError('failed-precondition', 'O técnico precisa ser da empresa contratada desta OS.');
    }

    tx.update(osRef, { tecnicoId: tecnicoId ?? FieldValue.delete() });

    registrarLog(tx, empresaId, autor, {
      alvo: 'ordemServico',
      operacao: 'editar',
      descricao: tecnicoId ? `Designou a ${rotuloOS(os.numero)} a ${nomeTecnico}` : `Removeu o técnico da ${rotuloOS(os.numero)}`,
      alvoId: osId,
      alvoRotulo: os.numero as string,
      detalhes: { tecnico: { de: os.tecnicoId ?? null, para: tecnicoId ?? null } }
    });

    if (tecnicoId) {
      notificar(tx, empresaId, {
        paraUsuarioId: tecnicoId,
        titulo: `${rotuloOS(os.numero)} designada a você`,
        texto: textoParaTecnico(os.situacao as string, orca),
        link: `/ordens-servico?os=${osId}`,
        alvo: { tipo: 'ordemServico', id: osId, numero: os.numero as string }
      });
    }
  });

  return { ok: true };
});
