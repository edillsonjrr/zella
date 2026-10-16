// Rules de preferencias/{usuarioId} (Z2.8: a tela "O que você faz aqui"
// aparece uma vez por pessoa) e leitura de equipamentos por perfil (Z2.4:
// a lista do "Novo chamado").
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { initializeTestEnvironment, assertSucceeds, assertFails } from '@firebase/rules-unit-testing';
import { doc, getDoc, getDocs, collection, setDoc, updateDoc, deleteDoc } from 'firebase/firestore';

const aqui = dirname(fileURLToPath(import.meta.url));
const [host, porta] = (process.env.FIRESTORE_EMULATOR_HOST ?? '127.0.0.1:8080').split(':');
const EMP = 'teste-rules3';
let env;

function ctx(perfil, usuarioId, extras = {}) {
  return env.authenticatedContext(`${EMP}-${usuarioId}`, {
    email: `${usuarioId}@${EMP}.test`, perfil, empresaId: EMP, usuarioId,
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
    await setDoc(doc(db, 'empresasClientes', EMP), { id: EMP, nome: 'Rules3', ativa: true });
    await setDoc(doc(db, caminho('preferencias', 'ana')), { boasVindasEm: '2026-10-13T10:00:00.000Z' });
    await setDoc(doc(db, caminho('equipamentos', 'e1')), { id: 'e1', unidadeId: 'u1', salaId: 's1', nome: 'Ar' });
  });
});

after(async () => { await env?.cleanup(); });

test('preferências: cada pessoa lê e grava só a própria, com forma fechada', async () => {
  const ana = ctx('cliente', 'ana', { unidadeId: 'u1' });
  const eduardo = ctx('tecnico', 'eduardo', { empresaContratadaId: 'ec1' });
  const gestor = ctx('gestor', 'carla');

  await assertSucceeds(getDoc(doc(ana, caminho('preferencias', 'ana'))));
  await assertFails(getDoc(doc(gestor, caminho('preferencias', 'ana'))));
  await assertFails(getDoc(doc(eduardo, caminho('preferencias', 'ana'))));

  await assertSucceeds(setDoc(doc(eduardo, caminho('preferencias', 'eduardo')), { boasVindasEm: '2026-10-13T11:00:00.000Z' }));
  await assertSucceeds(updateDoc(doc(ana, caminho('preferencias', 'ana')), { boasVindasEm: '2026-10-14T09:00:00.000Z' }));
  await assertFails(setDoc(doc(gestor, caminho('preferencias', 'ana')), { boasVindasEm: 'x' }));
  await assertFails(setDoc(doc(gestor, caminho('preferencias', 'carla')), { boasVindasEm: 'x', perfil: 'admin' }));
  await assertFails(setDoc(doc(gestor, caminho('preferencias', 'carla')), { boasVindasEm: 123 }));
  await assertFails(deleteDoc(doc(ana, caminho('preferencias', 'ana'))));
  await assertFails(getDocs(collection(gestor, caminho('preferencias'))));
  assert.ok(true);
});

test('preferências: convidado do QR Code e outra empresa não leem nem gravam', async () => {
  const convidado = env.authenticatedContext('anonimo', { firebase: { sign_in_provider: 'anonymous' } }).firestore();
  await assertFails(getDoc(doc(convidado, caminho('preferencias', 'ana'))));
  await assertFails(setDoc(doc(convidado, caminho('preferencias', 'anonimo')), { boasVindasEm: 'x' }));
  const outra = env.authenticatedContext('outra-ana', {
    email: 'ana@outra.test', perfil: 'cliente', empresaId: 'outra-empresa', usuarioId: 'ana', firebase: { sign_in_provider: 'password' }
  }).firestore();
  await assertFails(getDoc(doc(outra, caminho('preferencias', 'ana'))));
});

test('equipamentos: todo perfil da empresa lê (lista do novo chamado); só o gestor grava', async () => {
  await assertSucceeds(getDocs(collection(ctx('cliente', 'ana', { unidadeId: 'u1' }), caminho('equipamentos'))));
  await assertSucceeds(getDocs(collection(ctx('tecnico', 'eduardo', { empresaContratadaId: 'ec1' }), caminho('equipamentos'))));
  await assertFails(setDoc(doc(ctx('cliente', 'ana', { unidadeId: 'u1' }), caminho('equipamentos', 'e2')), { id: 'e2', unidadeId: 'u1', salaId: 's1', nome: 'x' }));
  await assertSucceeds(setDoc(doc(ctx('gestor', 'carla'), caminho('equipamentos', 'e2')), { id: 'e2', unidadeId: 'u1', salaId: 's1', nome: 'Bebedouro' }));
});
