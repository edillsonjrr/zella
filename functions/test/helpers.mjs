// Apoio dos testes de integração. Roda dentro de `firebase emulators:exec`,
// que exporta FIRESTORE_EMULATOR_HOST e FIREBASE_AUTH_EMULATOR_HOST: o Admin
// SDK cai no emulador sozinho, e as callables são chamadas por HTTP no
// Functions Emulator com o ID token de um usuário criado no Auth Emulator.
import { initializeApp, getApps } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore } from 'firebase-admin/firestore';

export const PROJETO = 'gestao-manutencao-app';
export const REGIAO = 'southamerica-east1';
const AUTH_HOST = process.env.FIREBASE_AUTH_EMULATOR_HOST ?? '127.0.0.1:9099';
const FUNCTIONS_HOST = process.env.FUNCTIONS_EMULATOR_HOST ?? '127.0.0.1:5001';

if (!process.env.FIRESTORE_EMULATOR_HOST) {
  throw new Error('Rode via `npm test` (firebase emulators:exec): FIRESTORE_EMULATOR_HOST não está definido.');
}

if (!getApps().length) initializeApp({ projectId: PROJETO });
export const db = getFirestore();
db.settings({ ignoreUndefinedProperties: true });
export const auth = getAuth();

export const SENHA = 'teste123';

/** Cria (ou reaproveita) um usuário no Auth Emulator com os claims dados. */
export async function criarUsuarioAuth(uid, email, claims) {
  try {
    await auth.createUser({ uid, email, password: SENHA, displayName: uid });
  } catch (e) {
    if (e.code !== 'auth/uid-already-exists' && e.code !== 'auth/email-already-exists') throw e;
  }
  await auth.setCustomUserClaims(uid, claims);
}

/** ID token de um usuário do Auth Emulator (login por senha via REST). */
export async function idToken(email) {
  const r = await fetch(`http://${AUTH_HOST}/identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=fake`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password: SENHA, returnSecureToken: true })
  });
  const j = await r.json();
  if (!j.idToken) throw new Error(`Login falhou para ${email}: ${JSON.stringify(j)}`);
  return j.idToken;
}

/**
 * Chama uma callable como faz o SDK do cliente. Devolve `{ ok, data }` ou
 * `{ ok: false, code, message }` (o código é o do HttpsError, ex.
 * 'FAILED_PRECONDITION', 'PERMISSION_DENIED').
 */
export async function chamar(nome, token, data) {
  const r = await fetch(`http://${FUNCTIONS_HOST}/${PROJETO}/${REGIAO}/${nome}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: JSON.stringify({ data: data ?? {} })
  });
  const j = await r.json().catch(() => ({}));
  if (j.error) return { ok: false, code: j.error.status, message: j.error.message };
  return { ok: true, data: j.result };
}

/** Apaga recursivamente uma empresa de teste e recria só o documento raiz. */
export async function limparEmpresa(empresaId, nome = 'Empresa de teste') {
  const ref = db.collection('empresasClientes').doc(empresaId);
  await db.recursiveDelete(ref);
  await ref.set({ id: empresaId, nome, ativa: true });
  return ref;
}

/**
 * Cenário padrão: uma empresa, uma unidade, uma contratada, um contrato com
 * um item (100 contratados / 100 disponíveis), um chamado e uma OS aberta.
 * Devolve ids e tokens dos quatro perfis.
 */
export async function cenarioBasico(empresaId) {
  const emp = await limparEmpresa(empresaId);
  const cont = 'ec1';

  await emp.collection('unidades').doc('u1').set({ id: 'u1', nome: 'Unidade 1', sigla: 'U1' });
  await emp.collection('empresasContratadas').doc(cont).set({ id: cont, nome: 'Contratada Um' });

  const usuarios = {
    gestor: { id: 'g1', email: `g1@${empresaId}.test`, perfil: 'gestor' },
    contratado: { id: 'gc1', email: `gc1@${empresaId}.test`, perfil: 'gestor_contratado', empresaContratadaId: cont },
    tecnico: { id: 't1', email: `t1@${empresaId}.test`, perfil: 'tecnico', empresaContratadaId: cont },
    cliente: { id: 'cl1', email: `cl1@${empresaId}.test`, perfil: 'cliente', unidadeId: 'u1' }
  };
  const tokens = {};
  for (const [chave, u] of Object.entries(usuarios)) {
    await emp.collection('usuarios').doc(u.id).set({ id: u.id, nome: chave, email: u.email, perfil: u.perfil,
      ...(u.unidadeId ? { unidadeId: u.unidadeId } : {}), ...(u.empresaContratadaId ? { empresaContratadaId: u.empresaContratadaId } : {}) });
    const claims = { perfil: u.perfil, empresaId, usuarioId: u.id,
      ...(u.unidadeId ? { unidadeId: u.unidadeId } : {}), ...(u.empresaContratadaId ? { empresaContratadaId: u.empresaContratadaId } : {}) };
    await criarUsuarioAuth(`${empresaId}-${u.id}`, u.email, claims);
    tokens[chave] = await idToken(u.email);
  }

  await emp.collection('contratos').doc('c1').set({
    id: 'c1', numero: 'CTR-T-001', fornecedor: 'Contratada Um', empresaContratadaId: cont,
    vigenciaInicio: '2026-01-01', vigenciaFim: '2027-12-31', status: 'Ativo'
  });
  await emp.collection('contratos').doc('c1').collection('itens').doc('i1').set({
    id: 'i1', empresaId, nome: 'Item A', unidadeMedida: 'un',
    quantidadeContratada: 100, quantidadeDisponivel: 100, quantidadeReservada: 0, quantidadeConsumida: 0, precoUnitario: 10
  });
  await emp.collection('chamados').doc('ch1').set({
    id: 'ch1', numero: 'CH-T-0001', titulo: 'Teste', equipamento: 'Equip', descricao: 'd', unidadeId: 'u1',
    solicitanteId: 'cl1', solicitanteNome: 'cliente', status: 'Em atendimento', dataCriacao: '2026-09-01', possuiFoto: false, ordemServicoId: 'os1'
  });
  await emp.collection('ordensServico').doc('os1').set({
    id: 'os1', numero: 'OS-T-0001', chamadoId: 'ch1', contratoId: 'c1', unidadeId: 'u1', empresaContratadaId: cont,
    situacao: 'Aberta', dataCriacao: '2026-09-02'
  });

  return { emp, tokens, cont };
}

export async function item(emp, contratoId = 'c1', itemId = 'i1') {
  const d = (await emp.collection('contratos').doc(contratoId).collection('itens').doc(itemId).get()).data();
  return { disp: d.quantidadeDisponivel, res: d.quantidadeReservada, cons: d.quantidadeConsumida, contratada: d.quantidadeContratada };
}

export async function doc(emp, colecao, id) {
  return (await emp.collection(colecao).doc(id).get()).data();
}
