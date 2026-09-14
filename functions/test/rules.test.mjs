// Security Rules do Firestore: quem lê e escreve o quê, por perfil. Usa
// @firebase/rules-unit-testing contra o Firestore Emulator, com as rules do
// arquivo firestore.rules da raiz.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import {
  initializeTestEnvironment,
  assertSucceeds,
  assertFails
} from '@firebase/rules-unit-testing';
import { doc, getDoc, getDocs, collection, collectionGroup, query, where, setDoc, updateDoc, deleteDoc } from 'firebase/firestore';

const aqui = dirname(fileURLToPath(import.meta.url));
const [host, porta] = (process.env.FIRESTORE_EMULATOR_HOST ?? '127.0.0.1:8080').split(':');
const EMP = 'teste-rules';
const OUTRA = 'outra-empresa';

let env;

function ctx(perfil, extras = {}) {
  const uid = `${EMP}-${perfil}`;
  return env.authenticatedContext(uid, {
    email: `${perfil}@${EMP}.test`,
    perfil,
    empresaId: EMP,
    usuarioId: perfil,
    firebase: { sign_in_provider: 'password' },
    ...extras
  }).firestore();
}

const caminho = (...p) => ['empresasClientes', EMP, ...p].join('/');

before(async () => {
  env = await initializeTestEnvironment({
    projectId: 'gestao-manutencao-app',
    firestore: { host, port: Number(porta), rules: readFileSync(resolve(aqui, '../../firestore.rules'), 'utf8') }
  });
  await env.clearFirestore();
  await env.withSecurityRulesDisabled(async (c) => {
    const db = c.firestore();
    await setDoc(doc(db, 'empresasClientes', EMP), { id: EMP, nome: 'Rules', ativa: true });
    await setDoc(doc(db, 'empresasClientes', OUTRA), { id: OUTRA, nome: 'Outra', ativa: true });
    await setDoc(doc(db, caminho('usuarios', 'gestor')), { id: 'gestor', nome: 'G', email: 'gestor@x', perfil: 'gestor' });
    await setDoc(doc(db, caminho('usuarios', 'cliente')), { id: 'cliente', nome: 'C', email: 'cliente@x', perfil: 'cliente', unidadeId: 'u1' });
    await setDoc(doc(db, caminho('usuariosPublicos', 'gestor')), { id: 'gestor', nome: 'G', perfil: 'gestor' });
    await setDoc(doc(db, caminho('contratos', 'c1')), { id: 'c1', numero: 'C1', fornecedor: 'F', empresaContratadaId: 'ec1', vigenciaInicio: '2026-01-01', vigenciaFim: '2027-01-01', status: 'Ativo' });
    await setDoc(doc(db, caminho('contratos', 'c1', 'itens', 'i1')), { id: 'i1', empresaId: EMP, nome: 'I', unidadeMedida: 'un', quantidadeContratada: 10, quantidadeDisponivel: 10, quantidadeReservada: 0, quantidadeConsumida: 0, precoUnitario: 1 });
    await setDoc(doc(db, caminho('contratos', 'c2')), { id: 'c2', numero: 'C2', fornecedor: 'F2', empresaContratadaId: 'ec2', vigenciaInicio: '2026-01-01', vigenciaFim: '2027-01-01', status: 'Ativo' });
    await setDoc(doc(db, caminho('contratos', 'c2', 'itens', 'i2')), { id: 'i2', empresaId: EMP, nome: 'I2', unidadeMedida: 'un', quantidadeContratada: 5, quantidadeDisponivel: 5, quantidadeReservada: 0, quantidadeConsumida: 0, precoUnitario: 1 });
    await setDoc(doc(db, caminho('orcamentos', 'o1')), { id: 'o1', osId: 'os1', empresaContratadaId: 'ec1', situacao: 'Pendente', itens: [], dataCriacao: '2026-09-01' });
    await setDoc(doc(db, caminho('chamados', 'ch1')), { id: 'ch1', numero: 'CH1', unidadeId: 'u1', status: 'Aberto' });
    await setDoc(doc(db, caminho('chamados', 'ch2')), { id: 'ch2', numero: 'CH2', unidadeId: 'u2', status: 'Aberto' });
    await setDoc(doc(db, 'empresasClientes', OUTRA, 'unidades', 'ux'), { id: 'ux', nome: 'X', sigla: 'X' });
  });
});

after(async () => {
  await env?.cleanup();
});

test('isolamento entre empresas: token de uma não lê a outra', async () => {
  const g = ctx('gestor');
  await assertFails(getDoc(doc(g, 'empresasClientes', OUTRA, 'unidades', 'ux')));
  await assertSucceeds(getDoc(doc(g, caminho('usuarios', 'gestor'))));
});

test('usuarios (com e-mail): só gestor lista; cada um lê o próprio; público é pra todos', async () => {
  const gestor = ctx('gestor');
  const cliente = ctx('cliente', { unidadeId: 'u1' });
  const tecnico = ctx('tecnico', { empresaContratadaId: 'ec1' });
  await assertSucceeds(getDocs(collection(gestor, caminho('usuarios'))));
  await assertFails(getDocs(collection(cliente, caminho('usuarios'))));
  await assertFails(getDoc(doc(tecnico, caminho('usuarios', 'gestor'))));
  await assertSucceeds(getDoc(doc(cliente, caminho('usuarios', 'cliente'))));
  await assertSucceeds(getDocs(collection(cliente, caminho('usuariosPublicos'))));
  await assertSucceeds(getDocs(collection(tecnico, caminho('usuariosPublicos'))));
  await assertFails(setDoc(doc(gestor, caminho('usuariosPublicos', 'x')), { id: 'x', nome: 'x' }));
});

test('contrato: contratada só lê o dela; não edita; técnico lê itens do próprio contrato', async () => {
  const contratado = ctx('gestor_contratado', { empresaContratadaId: 'ec1' });
  const tecnico = ctx('tecnico', { empresaContratadaId: 'ec1' });
  await assertSucceeds(getDoc(doc(contratado, caminho('contratos', 'c1'))));
  await assertFails(getDoc(doc(contratado, caminho('contratos', 'c2'))));
  await assertSucceeds(getDocs(query(collection(tecnico, caminho('contratos')), where('empresaContratadaId', '==', 'ec1'))));
  await assertSucceeds(getDocs(collection(tecnico, caminho('contratos', 'c1', 'itens'))));
  await assertFails(getDocs(collection(tecnico, caminho('contratos', 'c2', 'itens'))));
  await assertFails(updateDoc(doc(contratado, caminho('contratos', 'c1')), { fornecedor: 'Outro' }));
  await assertFails(updateDoc(doc(contratado, caminho('contratos', 'c1', 'itens', 'i1')), { quantidadeContratada: 999, quantidadeDisponivel: 999 }));
  await assertFails(setDoc(doc(contratado, caminho('contratos', 'c1', 'itens', 'novo')), { id: 'novo', empresaId: EMP, nome: 'N', unidadeMedida: 'un', quantidadeContratada: 1, quantidadeDisponivel: 1, quantidadeReservada: 0, quantidadeConsumida: 0, precoUnitario: 1 }));
});

test('gestor: edita nome/preço do item, mas quantidade contratada e saldo são imutáveis', async () => {
  const gestor = ctx('gestor');
  await assertSucceeds(updateDoc(doc(gestor, caminho('contratos', 'c1', 'itens', 'i1')), { nome: 'Renomeado', precoUnitario: 2 }));
  await assertFails(updateDoc(doc(gestor, caminho('contratos', 'c1', 'itens', 'i1')), { quantidadeContratada: 20 }));
  await assertFails(updateDoc(doc(gestor, caminho('contratos', 'c1', 'itens', 'i1')), { quantidadeDisponivel: 0 }));
  await assertFails(updateDoc(doc(gestor, caminho('contratos', 'c1', 'itens', 'i1')), { quantidadeReservada: 3 }));
  await assertFails(updateDoc(doc(gestor, caminho('contratos', 'c1')), { vigenciaFim: '2030-01-01' }));
  await assertSucceeds(updateDoc(doc(gestor, caminho('contratos', 'c1')), { fornecedor: 'Novo nome' }));
  // Criação de item só no estado zerado.
  await assertSucceeds(setDoc(doc(gestor, caminho('contratos', 'c1', 'itens', 'i9')), { id: 'i9', empresaId: EMP, nome: 'N', unidadeMedida: 'un', quantidadeContratada: 7, quantidadeDisponivel: 7, quantidadeReservada: 0, quantidadeConsumida: 0, precoUnitario: 1 }));
  await assertFails(setDoc(doc(gestor, caminho('contratos', 'c1', 'itens', 'i10')), { id: 'i10', empresaId: EMP, nome: 'N', unidadeMedida: 'un', quantidadeContratada: 7, quantidadeDisponivel: 9, quantidadeReservada: 0, quantidadeConsumida: 0, precoUnitario: 1 }));
  await assertSucceeds(deleteDoc(doc(gestor, caminho('contratos', 'c1', 'itens', 'i9'))));
});

test('itens por collection group: só gestor, filtrando pela própria empresa', async () => {
  const gestor = ctx('gestor');
  const contratado = ctx('gestor_contratado', { empresaContratadaId: 'ec1' });
  await assertSucceeds(getDocs(query(collectionGroup(gestor, 'itens'), where('empresaId', '==', EMP))));
  await assertFails(getDocs(query(collectionGroup(gestor, 'itens'), where('empresaId', '==', OUTRA))));
  await assertFails(getDocs(query(collectionGroup(contratado, 'itens'), where('empresaId', '==', EMP))));
});

test('fluxo (chamado, OS, orçamento) nunca é escrito pelo cliente do SDK', async () => {
  const gestor = ctx('gestor');
  await assertFails(updateDoc(doc(gestor, caminho('chamados', 'ch1')), { status: 'Encerrado' }));
  await assertFails(setDoc(doc(gestor, caminho('ordensServico', 'osx')), { id: 'osx', situacao: 'Aprovada' }));
  await assertFails(updateDoc(doc(gestor, caminho('orcamentos', 'o1')), { situacao: 'Aprovado' }));
});

test('orçamento: gestor e contratada dona leem; cliente e outra contratada não', async () => {
  await assertSucceeds(getDoc(doc(ctx('gestor'), caminho('orcamentos', 'o1'))));
  await assertSucceeds(getDoc(doc(ctx('gestor_contratado', { empresaContratadaId: 'ec1' }), caminho('orcamentos', 'o1'))));
  await assertSucceeds(getDoc(doc(ctx('tecnico', { empresaContratadaId: 'ec1' }), caminho('orcamentos', 'o1'))));
  await assertFails(getDoc(doc(ctx('tecnico', { empresaContratadaId: 'ec2' }), caminho('orcamentos', 'o1'))));
  await assertFails(getDoc(doc(ctx('cliente', { unidadeId: 'u1' }), caminho('orcamentos', 'o1'))));
});

test('cliente só enxerga chamados da própria unidade', async () => {
  const cliente = ctx('cliente', { unidadeId: 'u1' });
  await assertSucceeds(getDoc(doc(cliente, caminho('chamados', 'ch1'))));
  await assertFails(getDoc(doc(cliente, caminho('chamados', 'ch2'))));
  await assertSucceeds(getDocs(query(collection(cliente, caminho('chamados')), where('unidadeId', '==', 'u1'))));
  await assertFails(getDocs(collection(cliente, caminho('chamados'))));
});

test('log: append-only, forma fechada, autoria do token', async () => {
  const gestor = ctx('gestor');
  const entrada = {
    id: 'l1', acao: 'unidade.criar', alvo: 'unidade', operacao: 'criar', descricao: 'Criou', data: '2026-09-14T10:00:00.000Z',
    usuarioUid: `${EMP}-gestor`, usuarioNome: 'G', usuarioEmail: `gestor@${EMP}.test`, alvoId: 'u1', alvoRotulo: 'U1', alvoPaiId: 'u1', origem: 'app'
  };
  await assertSucceeds(setDoc(doc(gestor, caminho('logs', 'l1')), entrada));
  await assertFails(setDoc(doc(gestor, caminho('logs', 'l2')), { ...entrada, id: 'l2', usuarioUid: 'outro' }));
  await assertFails(setDoc(doc(gestor, caminho('logs', 'l3')), { ...entrada, id: 'l3', origem: 'backend' }));
  await assertFails(updateDoc(doc(gestor, caminho('logs', 'l1')), { descricao: 'Editado' }));
  await assertFails(deleteDoc(doc(gestor, caminho('logs', 'l1'))));
  await assertFails(getDocs(collection(ctx('tecnico', { empresaContratadaId: 'ec1' }), caminho('logs'))));
});

test('convidado (anônimo) não lê nada', async () => {
  const anon = env.authenticatedContext('anon', { firebase: { sign_in_provider: 'anonymous' } }).firestore();
  await assertFails(getDoc(doc(anon, caminho('unidades', 'u1'))));
  await assertFails(getDoc(doc(anon, 'empresasClientes', EMP)));
});
