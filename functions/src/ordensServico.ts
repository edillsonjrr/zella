import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { db, colecao, exigirPerfil, exigirMesmaContratada } from './admin';
import { proximoNumero } from './contadores';
import { registrarLog, resolverAutor } from './logs';
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

    return numero;
  });

  return { id: osRef.id, numero };
});
