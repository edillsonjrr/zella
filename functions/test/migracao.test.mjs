// Migração da rodada 3 (scripts/migrar-empresa-contratada.js): preenche
// `empresaContratadaId` nos chamados que já têm OS. O cenário é o seed
// (seedDados.ts) gravado como se fosse anterior à correção, sem o campo nos
// chamados, mais três casos de borda. Depois da migração, as rules de
// firestore.rules deixam a contratada ler só os chamados dela.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { execFileSync } from 'node:child_process';
import { readFileSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { dirname, join, resolve } from 'node:path';
import { initializeTestEnvironment, assertSucceeds, assertFails } from '@firebase/rules-unit-testing';
import { doc, getDoc, getDocs, collection, query, where } from 'firebase/firestore';
import { db, limparEmpresa } from './helpers.mjs';

const require = createRequire(import.meta.url);
const { montarDadosSeed } = require('../lib/functions/src/seedDados.js');
const { migrar, reverter } = require('../scripts/migrar-empresa-contratada.js');

const aqui = dirname(fileURLToPath(import.meta.url));
const SCRIPT = resolve(aqui, '../scripts/migrar-empresa-contratada.js');
const EMP = 'teste-migracao';
const [host, porta] = (process.env.FIRESTORE_EMULATOR_HOST ?? '127.0.0.1:8080').split(':');
const dados = montarDadosSeed('2026-10-15');
const comOS = dados.chamados.filter((c) => c.ordemServicoId);
const daC2 = dados.chamados.filter((c) => c.empresaContratadaId === 'c2').map((c) => c.id).sort();
const pasta = mkdtempSync(join(tmpdir(), 'zella-migracao-'));
const caminho = (...p) => ['empresasClientes', EMP, ...p].join('/');
let env;

function cli(...args) {
  return execFileSync(process.execPath, [SCRIPT, `--empresa=${EMP}`, ...args], { encoding: 'utf8', env: process.env });
}

async function lerChamados() {
  const snap = await db.collection('empresasClientes').doc(EMP).collection('chamados').get();
  return new Map(snap.docs.map((d) => [d.id, d.data()]));
}

function ctx(perfil, extras) {
  return env.authenticatedContext(`${EMP}-${perfil}-${extras.usuarioId}`, {
    perfil, empresaId: EMP, firebase: { sign_in_provider: 'password' }, ...extras
  }).firestore();
}

before(async () => {
  env = await initializeTestEnvironment({
    projectId: 'gestao-manutencao-app',
    firestore: { host, port: Number(porta), rules: readFileSync(resolve(aqui, '../../firestore.rules'), 'utf8') }
  });
  const emp = await limparEmpresa(EMP, 'Migração');
  let batch = db.batch();
  let n = 0;
  const por = async (ref, valor) => {
    batch.set(ref, valor);
    if (++n % 400 === 0) { await batch.commit(); batch = db.batch(); }
  };
  // Chamados como estavam antes da rodada 3: sem empresaContratadaId.
  for (const { empresaContratadaId, ...c } of dados.chamados) await por(emp.collection('chamados').doc(c.id), c);
  for (const os of dados.ordensServico) await por(emp.collection('ordensServico').doc(os.id), os);
  for (const { itens, ...c } of dados.contratos) await por(emp.collection('contratos').doc(c.id), c);
  // Bordas: OS sem a contratada (vem do contrato), OS que sumiu e chamado
  // com o campo errado (a migração corrige pelo da OS).
  await por(emp.collection('ordensServico').doc('osx'), { id: 'osx', numero: 'OS-X', chamadoId: 'chx', contratoId: 'c3', unidadeId: 'u1', situacao: 'Aberta' });
  await por(emp.collection('chamados').doc('chx'), { id: 'chx', numero: 'CH-X', unidadeId: 'u1', status: 'Em atendimento', ordemServicoId: 'osx' });
  await por(emp.collection('chamados').doc('chy'), { id: 'chy', numero: 'CH-Y', unidadeId: 'u1', status: 'Em atendimento', ordemServicoId: 'nao-existe' });
  await por(emp.collection('chamados').doc('chz'), { id: 'chz', numero: 'CH-Z', unidadeId: 'u1', status: 'Em atendimento', ordemServicoId: dados.chamados.find((c) => c.empresaContratadaId === 'c1').ordemServicoId, empresaContratadaId: 'c2' });
  await batch.commit();
});

after(async () => {
  await env?.cleanup();
  rmSync(pasta, { recursive: true, force: true });
});

test('migração: antes dela, a contratada não acha os próprios chamados antigos', async () => {
  assert.ok(daC2.length > 0, 'o seed precisa ter chamados com OS da Elétrica Sul (c2)');
  const diego = ctx('gestor_contratado', { usuarioId: 'usr4', empresaContratadaId: 'c2' });
  const snap = await assertSucceeds(getDocs(query(collection(diego, caminho('chamados')), where('empresaContratadaId', '==', 'c2'))));
  assert.deepEqual(snap.docs.map((d) => d.id), ['chz'], 'só o chamado com o campo errado aparece');
});

test('migração: --simular lista o que mudaria e não grava nada', async () => {
  const antes = await lerChamados();
  const saida = cli('--simular');
  assert.match(saida, /Destino: EMULADOR/);
  assert.match(saida, /Modo: SIMULAR/);
  assert.match(saida, /MUDARIA CH-X: \(sem campo\) -> c3 \(da contrato\)/);
  assert.match(saida, /MUDARIA CH-Z: c2 -> c1 \(da OS\)/);
  assert.match(saida, /PROBLEMA CH-Y: aponta para a OS nao-existe, que não existe/);
  assert.match(saida, new RegExp(`Total: ${comOS.length + 2} chamado\\(s\\) a alterar; 1 problema`));
  assert.match(saida, /Nada gravado/);
  assert.deepEqual(await lerChamados(), antes);
  const logs = await db.collection('empresasClientes').doc(EMP).collection('logs').get();
  assert.equal(logs.size, 0);
});

test('migração: sem o emulador e sem --producao, recusa rodar', () => {
  const { FIRESTORE_EMULATOR_HOST, ...semEmulador } = process.env;
  assert.throws(
    () => execFileSync(process.execPath, [SCRIPT, '--simular'], { encoding: 'utf8', env: semEmulador, stdio: 'pipe' }),
    (e) => /--producao=<projeto>/.test(e.stderr)
  );
  assert.throws(
    () => execFileSync(process.execPath, [SCRIPT], { encoding: 'utf8', env: process.env, stdio: 'pipe' }),
    (e) => /Escolha um modo/.test(e.stderr)
  );
});

test('migração: --aplicar grava o campo da OS (ou do contrato) e deixa os sem OS sem o campo', async () => {
  const copia = join(pasta, 'copia.json');
  const saida = cli('--aplicar', `--copia=${copia}`);
  assert.match(saida, /Modo: APLICAR/);
  const salvos = JSON.parse(readFileSync(copia, 'utf8')).chamados;
  assert.equal(salvos.length, comOS.length + 2);
  assert.deepEqual(salvos.find((c) => c.chamadoId === 'chz'), { empresaId: EMP, chamadoId: 'chz', rotulo: 'CH-Z', antes: 'c2', depois: 'c1' });

  const chamados = await lerChamados();
  for (const c of dados.chamados) {
    assert.equal(chamados.get(c.id).empresaContratadaId, c.empresaContratadaId, `${c.id}: igual ao que o seed novo grava`);
  }
  assert.equal(chamados.get('chx').empresaContratadaId, 'c3');
  assert.equal(chamados.get('chy').empresaContratadaId, undefined);
  assert.equal(chamados.get('chz').empresaContratadaId, 'c1');

  const logs = await db.collection('empresasClientes').doc(EMP).collection('logs').get();
  assert.equal(logs.size, comOS.length + 2);
  const log = logs.docs.map((d) => d.data()).find((l) => l.alvoId === 'chz');
  assert.equal(log.acao, 'chamado.editar');
  assert.equal(log.origem, 'backend');
  assert.deepEqual(log.detalhes, { empresaContratadaId: { de: 'c2', para: 'c1' } });

  // Rodar de novo não muda nada.
  const { planos } = await migrar(db, { empresaId: EMP });
  assert.equal(planos[0].mudancas.length, 0);
  assert.equal(planos[0].jaCertos, comOS.length + 2);
});

test('migração: depois dela, a contratada lê só os chamados dela', async () => {
  const diego = ctx('gestor_contratado', { usuarioId: 'usr4', empresaContratadaId: 'c2' });
  const eduardo = ctx('tecnico', { usuarioId: 'usr5', empresaContratadaId: 'c2' });
  for (const quem of [diego, eduardo]) {
    const snap = await assertSucceeds(getDocs(query(collection(quem, caminho('chamados')), where('empresaContratadaId', '==', 'c2'))));
    assert.deepEqual(snap.docs.map((d) => d.id).sort(), daC2);
    await assertFails(getDocs(collection(quem, caminho('chamados'))));
    await assertFails(getDocs(query(collection(quem, caminho('chamados')), where('empresaContratadaId', '==', 'c1'))));
    await assertFails(getDoc(doc(quem, caminho('chamados', 'chz'))));
    await assertFails(getDoc(doc(quem, caminho('chamados', dados.chamados.find((c) => !c.ordemServicoId).id))));
    await assertSucceeds(getDoc(doc(quem, caminho('chamados', daC2[0]))));
  }
  const gestor = ctx('gestor', { usuarioId: 'usr3' });
  const todos = await assertSucceeds(getDocs(collection(gestor, caminho('chamados'))));
  assert.equal(todos.size, dados.chamados.length + 3);
});

test('migração: --reverter volta o valor anterior, menos o que mudou depois', async () => {
  const copia = join(pasta, 'copia.json');
  // Um chamado mudou depois da migração (outra OS): a reversão não mexe nele.
  const mudado = daC2[0];
  await db.collection('empresasClientes').doc(EMP).collection('chamados').doc(mudado).update({ empresaContratadaId: 'c1' });

  const simulado = cli('--simular', `--reverter=${copia}`);
  assert.match(simulado, /VOLTARIA CH-Z: c1 -> c2/);
  assert.match(simulado, new RegExp(`IGNORADO .*está com "c1", não com "c2"`));
  assert.equal((await lerChamados()).get('chz').empresaContratadaId, 'c1');

  cli('--aplicar', `--reverter=${copia}`);
  const chamados = await lerChamados();
  assert.equal(chamados.get('chz').empresaContratadaId, 'c2');
  assert.equal(chamados.get('chx').empresaContratadaId, undefined);
  assert.equal(chamados.get(mudado).empresaContratadaId, 'c1');
  for (const c of comOS.filter((c) => c.id !== mudado)) assert.equal(chamados.get(c.id).empresaContratadaId, undefined, c.id);

  const { ignorados } = await reverter(db, JSON.parse(readFileSync(copia, 'utf8')).chamados);
  assert.equal(ignorados.length, comOS.length + 2, 'depois de revertido, nada mais a voltar');
});
