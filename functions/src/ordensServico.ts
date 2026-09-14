import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { FieldValue } from 'firebase-admin/firestore';
import { db, colecao, exigirPerfil, exigirMesmaContratada } from './admin';
import { proximoNumero } from './contadores';
import { registrarLog, resolverAutor } from './logs';
import { notificar } from './notificacoes';
import type { OrdemServico } from './types';

export interface CriarOSInput {
  chamadoId: string;
  contratoId: string;
  tecnicoId?: string;
}

export const criarOS = onCall<CriarOSInput>(async (request) => {
  const ctx = exigirPerfil(request, ['gestor', 'gestor_contratado']);
  const { empresaId } = ctx;

  const { chamadoId, contratoId, tecnicoId } = request.data;
  if (!chamadoId || !contratoId) {
    throw new HttpsError('invalid-argument', 'Informe o chamado de origem e o contrato.');
  }

  const chamadoRef = colecao(empresaId, 'chamados').doc(chamadoId);
  const contratoRef = colecao(empresaId, 'contratos').doc(contratoId);
  const osRef = colecao(empresaId, 'ordensServico').doc();
  const autor = await resolverAutor(request, empresaId);

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
    tx.update(chamadoRef, {
      status: 'Em atendimento',
      ordemServicoId: osRef.id
    });

    registrarLog(tx, empresaId, autor, {
      alvo: 'ordemServico',
      operacao: 'criar',
      descricao: `Criou a OS ${numero} a partir do chamado ${chamadoSnap.data()!.numero}`,
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
        titulo: `Nova OS ${numero}`,
        texto: `Aberta no contrato ${contrato.numero} para o chamado ${chamadoSnap.data()!.numero}. Aguarda orçamento.`,
        link: '/ordens-servico',
        alvo: { tipo: 'ordemServico', id: osRef.id, numero }
      });
    }
    if (tecnicoId) {
      notificar(tx, empresaId, {
        paraUsuarioId: tecnicoId,
        titulo: `OS ${numero} designada a você`,
        texto: `Chamado ${chamadoSnap.data()!.numero}: ${chamadoSnap.data()!.equipamento}. Envie o orçamento.`,
        link: '/ordens-servico',
        alvo: { tipo: 'ordemServico', id: osRef.id, numero }
      });
    }

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

  await db.runTransaction(async (tx) => {
    const snap = await tx.get(osRef);
    if (!snap.exists) {
      throw new HttpsError('not-found', 'Ordem de serviço não encontrada.');
    }
    const os = snap.data()!;
    exigirMesmaContratada(ctx, os as { empresaContratadaId?: string });
    if (['Executada', 'Encerrada', 'Cancelada'].includes(os.situacao)) {
      throw new HttpsError('failed-precondition', `A OS ${os.numero} está ${os.situacao} e não muda mais de técnico.`);
    }
    if (tecnico && os.empresaContratadaId && tecnico['empresaContratadaId'] !== os.empresaContratadaId) {
      throw new HttpsError('failed-precondition', 'O técnico precisa ser da empresa contratada desta OS.');
    }

    tx.update(osRef, { tecnicoId: tecnicoId ?? FieldValue.delete() });

    registrarLog(tx, empresaId, autor, {
      alvo: 'ordemServico',
      operacao: 'editar',
      descricao: tecnicoId ? `Designou a OS ${os.numero} a ${nomeTecnico}` : `Removeu o técnico da OS ${os.numero}`,
      alvoId: osId,
      alvoRotulo: os.numero as string,
      detalhes: { tecnico: { de: os.tecnicoId ?? null, para: tecnicoId ?? null } }
    });

    if (tecnicoId) {
      notificar(tx, empresaId, {
        paraUsuarioId: tecnicoId,
        titulo: `OS ${os.numero} designada a você`,
        texto: 'Confira o chamado e envie o orçamento, ou execute se já estiver aprovada.',
        link: '/ordens-servico',
        alvo: { tipo: 'ordemServico', id: osId, numero: os.numero as string }
      });
    }
  });

  return { ok: true };
});
