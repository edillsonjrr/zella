import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { db, EMPRESAS, empresaRef, exigirAdminPlataforma } from './admin';

/**
 * Migração única: os dados que nasceram na raiz do Firestore (antes de
 * existir o nó de empresa) são copiados para dentro de uma empresa cliente.
 * Temporária — sai do código depois do teste guiado.
 *
 * Só copia: nada é apagado da raiz, pra dar caminho de volta se algo sair
 * errado. É idempotente: rodar de novo sobrescreve os mesmos documentos.
 */
const COLECOES = [
  'unidades', 'blocos', 'salas', 'equipamentos', 'usuarios',
  'chamados', 'ordensServico', 'orcamentos', 'planosManutencao',
  'logs', 'contadores'
];

export const migrarDadosRaiz = onCall<{ empresaId: string; nome?: string }, Promise<Record<string, number>>>(
  { timeoutSeconds: 540 },
  async (request) => {
    exigirAdminPlataforma(request);

    const empresaId = request.data?.empresaId?.trim();
    if (!empresaId) {
      throw new HttpsError('invalid-argument', 'Informe o id da empresa de destino.');
    }

    const destino = empresaRef(empresaId);
    const existente = await destino.get();
    if (!existente.exists) {
      await destino.set({
        id: empresaId,
        nome: request.data.nome?.trim() || 'Empresa migrada',
        ativa: true
      });
    }

    const contagem: Record<string, number> = {};
    let batch = db.batch();
    let pendentes = 0;
    const escrever = async (ref: FirebaseFirestore.DocumentReference, dados: FirebaseFirestore.DocumentData) => {
      batch.set(ref, dados);
      if (++pendentes >= 400) {
        await batch.commit();
        batch = db.batch();
        pendentes = 0;
      }
    };

    for (const nome of COLECOES) {
      const snap = await db.collection(nome).get();
      contagem[nome] = snap.size;
      for (const doc of snap.docs) {
        await escrever(destino.collection(nome).doc(doc.id), doc.data());
      }
    }

    const contratos = await db.collection('contratos').get();
    contagem['contratos'] = contratos.size;
    contagem['itens'] = 0;
    for (const contrato of contratos.docs) {
      await escrever(destino.collection('contratos').doc(contrato.id), contrato.data());
      const itens = await contrato.ref.collection('itens').get();
      for (const item of itens.docs) {
        contagem['itens']++;
        await escrever(
          destino.collection('contratos').doc(contrato.id).collection('itens').doc(item.id),
          { ...item.data(), empresaId }
        );
      }
    }

    if (pendentes > 0) await batch.commit();

    // Campos novos de isolamento: a OS ganha a unidade do chamado e a
    // contratada do contrato; o orçamento ganha a contratada da OS.
    const unidadePorChamado = new Map<string, string>();
    for (const c of (await destino.collection('chamados').get()).docs) {
      unidadePorChamado.set(c.id, c.data()['unidadeId']);
    }
    // Contrato antigo não tem empresa contratada: vira uma, com o id do
    // próprio contrato e o nome do fornecedor (os usuários contratados do
    // seed já apontam pro id do contrato).
    const contratadaPorContrato = new Map<string, string | undefined>();
    let lote = db.batch();
    let n = 0;
    for (const c of (await destino.collection('contratos').get()).docs) {
      let contratadaId = c.data()['empresaContratadaId'] as string | undefined;
      if (!contratadaId) {
        contratadaId = c.id;
        lote.set(destino.collection('empresasContratadas').doc(c.id), { id: c.id, nome: c.data()['fornecedor'] ?? c.id }, { merge: true });
        lote.set(c.ref, { empresaContratadaId: c.id }, { merge: true });
        n += 2;
      }
      contratadaPorContrato.set(c.id, contratadaId);
    }
    const contratadaPorOs = new Map<string, string | undefined>();
    for (const os of (await destino.collection('ordensServico').get()).docs) {
      const dados = os.data();
      const unidadeId = unidadePorChamado.get(dados['chamadoId']);
      const empresaContratadaId = contratadaPorContrato.get(dados['contratoId']);
      contratadaPorOs.set(os.id, empresaContratadaId);
      lote.set(os.ref, { ...(unidadeId ? { unidadeId } : {}), ...(empresaContratadaId ? { empresaContratadaId } : {}) }, { merge: true });
      if (++n >= 400) { await lote.commit(); lote = db.batch(); n = 0; }
    }
    for (const orc of (await destino.collection('orcamentos').get()).docs) {
      const empresaContratadaId = contratadaPorOs.get(orc.data()['osId']);
      if (!empresaContratadaId) continue;
      lote.set(orc.ref, { empresaContratadaId }, { merge: true });
      if (++n >= 400) { await lote.commit(); lote = db.batch(); n = 0; }
    }
    if (n > 0) await lote.commit();

    console.log(`Migração da raiz para ${EMPRESAS}/${empresaId}:`, contagem);
    return contagem;
  }
);
