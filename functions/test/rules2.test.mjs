// Rules das notificações internas e do monitor de operação.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { initializeTestEnvironment, assertSucceeds, assertFails } from '@firebase/rules-unit-testing';
import { doc, getDoc, getDocs, collection, query, where, setDoc, updateDoc, deleteDoc } from 'firebase/firestore';

const aqui = dirname(fileURLToPath(import.meta.url));
const [host, porta] = (process.env.FIRESTORE_EMULATOR_HOST ?? '127.0.0.1:8080').split(':');
const EMP = 'teste-rules2';
let env;

function ctx(perfil, extras = {}) {
  return env.authenticatedContext(`${EMP}-${perfil}-${extras.empresaContratadaId ?? ''}`, {
    email: `${perfil}@${EMP}.test`, perfil, empresaId: EMP, usuarioId: perfil,
    firebase: { sign_in_provider: 'password' }, ...extras
  }).firestore();
}
const caminho = (...p) => ['empresasClientes', EMP, ...p].join('/');

before(async () => {
  env = await initializeTestEnvironment({
    projectId: 'gestao-manutencao-app',
    firestore: { host, port: Number(porta), rules: readFileSync(resolve(aqui, '../../firestore.rules'), 'utf8') }
  });
  await env.withSecurityRulesDisabled(async (c) => {
    const db = c.firestore();
    await setDoc(doc(db, 'empresasClientes', EMP), { id: EMP, nome: 'Rules2', ativa: true });
    await setDoc(doc(db, caminho('notificacoes', 'n1')), { id: 'n1', paraPerfil: 'gestor', titulo: 't', texto: 'x', data: '2026-09-14T10:00:00.000Z', lidaPor: [] });
    await setDoc(doc(db, caminho('notificacoes', 'n2')), { id: 'n2', paraPerfil: 'tecnico', empresaContratadaId: 'ec1', titulo: 't', texto: 'x', data: '2026-09-14T10:00:00.000Z', lidaPor: [] });
    await setDoc(doc(db, caminho('notificacoes', 'n3')), { id: 'n3', paraUsuarioId: 'tecnico', titulo: 't', texto: 'x', data: '2026-09-14T10:00:00.000Z', lidaPor: [] });
    await setDoc(doc(db, caminho('operacao', 'preventiva')), { ultimaExecucao: '2026-09-14T09:00:00.000Z' });
  });
});

after(async () => { await env?.cleanup(); });

test('notificações: cada um lê as suas; só marca como lida acrescentando o próprio id', async () => {
  const gestor = ctx('gestor');
  const tecnico = ctx('tecnico', { empresaContratadaId: 'ec1' });
  const tecnicoOutra = ctx('tecnico', { empresaContratadaId: 'ec2' });
  await assertSucceeds(getDoc(doc(gestor, caminho('notificacoes', 'n1'))));
  await assertFails(getDoc(doc(gestor, caminho('notificacoes', 'n2'))));
  await assertSucceeds(getDoc(doc(tecnico, caminho('notificacoes', 'n2'))));
  await assertFails(getDoc(doc(tecnicoOutra, caminho('notificacoes', 'n2'))));
  await assertSucceeds(getDoc(doc(tecnico, caminho('notificacoes', 'n3'))));
  await assertSucceeds(getDocs(query(collection(gestor, caminho('notificacoes')), where('paraPerfil', '==', 'gestor'))));
  await assertFails(getDocs(collection(gestor, caminho('notificacoes'))));
  await assertSucceeds(updateDoc(doc(gestor, caminho('notificacoes', 'n1')), { lidaPor: ['gestor'] }));
  await assertFails(updateDoc(doc(gestor, caminho('notificacoes', 'n1')), { lidaPor: ['gestor', 'outro'] }));
  await assertFails(updateDoc(doc(gestor, caminho('notificacoes', 'n1')), { titulo: 'editado' }));
  await assertFails(setDoc(doc(gestor, caminho('notificacoes', 'n9')), { id: 'n9', paraPerfil: 'gestor', titulo: 't', texto: 'x', data: 'd', lidaPor: [] }));
  await assertFails(deleteDoc(doc(gestor, caminho('notificacoes', 'n1'))));
  assert.ok(true);
});

test('monitor de operação: só gestor lê, ninguém escreve', async () => {
  await assertSucceeds(getDoc(doc(ctx('gestor'), caminho('operacao', 'preventiva'))));
  await assertFails(getDoc(doc(ctx('tecnico', { empresaContratadaId: 'ec1' }), caminho('operacao', 'preventiva'))));
  await assertFails(updateDoc(doc(ctx('gestor'), caminho('operacao', 'preventiva')), { ultimaExecucao: 'x' }));
});
