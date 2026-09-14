import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { FieldValue } from 'firebase-admin/firestore';
import { db, colecao, exigirPerfil } from './admin';
import { registrarLog, resolverAutor } from './logs';
import type { AditivoContrato } from './types';

export interface AditivarContratoInput {
  contratoId: string;
  motivo: string;
  // Nova data de fim de vigência (YYYY-MM-DD). Só pode estender.
  novaVigenciaFim?: string;
  // Itens cuja quantidade contratada muda. Quem não aparece fica como está.
  itens?: { itemContratoId: string; novaQuantidadeContratada: number }[];
}

const DATA_ISO = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Aditivo de contrato: a única porta pra mudar quantidade contratada ou
 * vigência depois que o contrato existe. As Security Rules travam esses
 * campos pro app, então toda alteração passa por aqui, numa transação que
 * confere o saldo, move o disponível na mesma medida e deixa o registro do
 * aditivo (contratos/{id}/aditivos) mais o log.
 *
 * Só o gestor do cliente: o contrato é dele. A contratada não altera o que
 * foi acordado.
 */
export const aditivarContrato = onCall<AditivarContratoInput>(async (request) => {
  const { empresaId } = exigirPerfil(request, ['gestor']);

  const contratoId = request.data?.contratoId;
  const motivo = (request.data?.motivo ?? '').trim().slice(0, 500);
  const novaVigenciaFim = request.data?.novaVigenciaFim?.trim() || undefined;
  const pedidos = request.data?.itens ?? [];

  if (!contratoId) {
    throw new HttpsError('invalid-argument', 'Informe o contrato.');
  }
  if (!motivo) {
    throw new HttpsError('invalid-argument', 'Informe o motivo do aditivo.');
  }
  if (novaVigenciaFim !== undefined && !DATA_ISO.test(novaVigenciaFim)) {
    throw new HttpsError('invalid-argument', 'Data de vigência inválida.');
  }
  if (!Array.isArray(pedidos)) {
    throw new HttpsError('invalid-argument', 'Lista de itens inválida.');
  }
  for (const p of pedidos) {
    if (typeof p?.itemContratoId !== 'string' || !p.itemContratoId) {
      throw new HttpsError('invalid-argument', 'Item inválido no aditivo.');
    }
    if (typeof p.novaQuantidadeContratada !== 'number' || !Number.isFinite(p.novaQuantidadeContratada) || p.novaQuantidadeContratada < 0) {
      throw new HttpsError('invalid-argument', 'Quantidade contratada precisa ser um número maior ou igual a zero.');
    }
  }
  const ids = pedidos.map((p) => p.itemContratoId);
  if (new Set(ids).size !== ids.length) {
    throw new HttpsError('invalid-argument', 'O mesmo item aparece mais de uma vez no aditivo.');
  }
  if (!pedidos.length && !novaVigenciaFim) {
    throw new HttpsError('invalid-argument', 'O aditivo precisa alterar a vigência ou ao menos um item.');
  }

  const contratoRef = colecao(empresaId, 'contratos').doc(contratoId);
  const autor = await resolverAutor(request, empresaId);

  const numero = await db.runTransaction(async (tx) => {
    const contratoSnap = await tx.get(contratoRef);
    if (!contratoSnap.exists) {
      throw new HttpsError('not-found', 'Contrato não encontrado.');
    }
    const contrato = contratoSnap.data()!;
    if (contrato.status === 'Encerrado') {
      throw new HttpsError('failed-precondition', `O contrato ${contrato.numero} está encerrado e não recebe aditivo.`);
    }

    const itemRefs = pedidos.map((p) => contratoRef.collection('itens').doc(p.itemContratoId));
    const itemSnaps = await Promise.all(itemRefs.map((ref) => tx.get(ref)));

    // Valida tudo antes de escrever qualquer coisa.
    const mudancasItens: AditivoContrato['itens'] = [];
    itemSnaps.forEach((snap, i) => {
      const pedido = pedidos[i];
      if (!snap.exists) {
        throw new HttpsError('not-found', `Item ${pedido.itemContratoId} não pertence a este contrato.`);
      }
      const item = snap.data()!;
      const atual = Number(item.quantidadeContratada) || 0;
      const nova = pedido.novaQuantidadeContratada;
      if (nova === atual) return;

      const delta = nova - atual;
      const disponivel = Number(item.quantidadeDisponivel) || 0;
      if (disponivel + delta < 0) {
        const comprometido = (Number(item.quantidadeReservada) || 0) + (Number(item.quantidadeConsumida) || 0);
        throw new HttpsError(
          'failed-precondition',
          `"${item.nome}": não dá pra reduzir para ${nova}. Já há ${comprometido} reservado(s) ou consumido(s); o mínimo é ${comprometido}.`
        );
      }
      mudancasItens.push({
        itemContratoId: pedido.itemContratoId,
        nome: item.nome as string,
        quantidadeContratada: { de: atual, para: nova }
      });
    });

    let mudancaVigencia: AditivoContrato['vigenciaFim'];
    if (novaVigenciaFim && novaVigenciaFim !== contrato.vigenciaFim) {
      if (typeof contrato.vigenciaFim === 'string' && novaVigenciaFim < contrato.vigenciaFim) {
        throw new HttpsError('failed-precondition', 'Aditivo só estende a vigência; para encurtar, encerre o contrato.');
      }
      if (typeof contrato.vigenciaInicio === 'string' && novaVigenciaFim <= contrato.vigenciaInicio) {
        throw new HttpsError('failed-precondition', 'A nova vigência precisa terminar depois do início do contrato.');
      }
      mudancaVigencia = { de: contrato.vigenciaFim as string, para: novaVigenciaFim };
    }

    if (!mudancasItens.length && !mudancaVigencia) {
      throw new HttpsError('failed-precondition', 'Nada mudou: o aditivo repete os valores atuais do contrato.');
    }

    // Escreve.
    mudancasItens.forEach((m) => {
      const ref = contratoRef.collection('itens').doc(m.itemContratoId);
      const delta = m.quantidadeContratada.para - m.quantidadeContratada.de;
      tx.update(ref, {
        quantidadeContratada: m.quantidadeContratada.para,
        quantidadeDisponivel: FieldValue.increment(delta)
      });
    });

    const numero = (Number(contrato.totalAditivos) || 0) + 1;
    const aditivoRef = contratoRef.collection('aditivos').doc();
    const aditivo: AditivoContrato = {
      id: aditivoRef.id,
      numero,
      contratoId,
      data: new Date().toISOString(),
      motivo,
      ...(mudancaVigencia ? { vigenciaFim: mudancaVigencia } : {}),
      itens: mudancasItens,
      autorUid: autor.uid,
      autorNome: autor.nome
    };
    tx.set(aditivoRef, aditivo);

    tx.update(contratoRef, {
      totalAditivos: numero,
      ...(mudancaVigencia ? { vigenciaFim: mudancaVigencia.para } : {})
    });

    registrarLog(tx, empresaId, autor, {
      alvo: 'contrato',
      operacao: 'editar',
      descricao: `Aditivo nº ${numero} do contrato ${contrato.numero} — ${motivo}`,
      alvoId: contratoId,
      alvoRotulo: contrato.numero as string,
      detalhes: {
        aditivo: numero,
        motivo,
        vigenciaFim: mudancaVigencia ?? null,
        itens: mudancasItens.map((m) => ({ item: m.nome, ...m.quantidadeContratada }))
      }
    });

    return numero;
  });

  return { numero };
});
