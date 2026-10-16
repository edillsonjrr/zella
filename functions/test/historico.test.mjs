// Z0.2: a linha do tempo do chamado e da OS depois do fluxo inteiro.
//
// O fluxo passa pelas callables (aberto, OS criada, orçamento enviado,
// aprovado, serviço feito, encerrado). A leitura é feita como o app faz:
// pelo SDK do cliente, com as Security Rules valendo, e a linha do tempo é
// montada pela mesma função do app (shared/historico.ts).
//
// O defeito era duplo: só a gestão lê `logs` (o técnico e a contratada
// recebiam permission-denied, que o app engolia como "Nenhuma ação
// registrada"), e cada painel consultava só o próprio id (o chamado não via
// orçamento nem execução; a OS não via abertura nem encerramento).
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { createRequire } from 'node:module';
import { initializeTestEnvironment, assertFails } from '@firebase/rules-unit-testing';
import { collection, doc as docCliente, getDoc, getDocs, limit, orderBy, query, where } from 'firebase/firestore';
import { cenarioBasico, chamar, doc } from './helpers.mjs';

const require = createRequire(import.meta.url);
const { montarLinhaDoTempo, idsDaLinhaDoTempo } = require('../lib/shared/historico.js');

const aqui = dirname(fileURLToPath(import.meta.url));
const [host, porta] = (process.env.FIRESTORE_EMULATOR_HOST ?? '127.0.0.1:8080').split(':');
const EMP = 'teste-historico';
const MARCOS = ['aberto', 'os', 'orcamento', 'aprovado', 'executado', 'encerrado'];
let emp, tokens, env;
let chamadoId, osId, orcamentoId;

before(async () => {
  ({ emp, tokens } = await cenarioBasico(EMP));
  env = await initializeTestEnvironment({
    projectId: 'gestao-manutencao-app',
    firestore: { host, port: Number(porta), rules: readFileSync(resolve(aqui, '../../firestore.rules'), 'utf8') }
  });

  // O fluxo inteiro, cada etapa pelo perfil que a faz na vida real.
  const aberto = await chamar('criarChamado', tokens.cliente, {
    titulo: 'Ar', equipamento: 'Ar Split', descricao: 'não liga', unidadeId: 'u1', solicitanteNome: 'cliente', possuiFoto: false
  });
  assert.equal(aberto.ok, true, aberto.message);
  chamadoId = aberto.data.id;
  const os = await chamar('criarOS', tokens.gestor, { chamadoId, contratoId: 'c1', tecnicoId: 't1' });
  assert.equal(os.ok, true, os.message);
  osId = os.data.id;
  const orc = await chamar('criarOrcamento', tokens.contratado, { osId, itens: [{ itemContratoId: 'i1', quantidade: 2 }] });
  assert.equal(orc.ok, true, orc.message);
  orcamentoId = orc.data.id;
  const apr = await chamar('aprovarOrcamento', tokens.gestor, { orcamentoId });
  assert.equal(apr.ok, true, apr.message);
  const exe = await chamar('executarOS', tokens.tecnico, { osId, observacao: 'Troquei o capacitor.' });
  assert.equal(exe.ok, true, exe.message);
  const enc = await chamar('encerrarChamado', tokens.gestor, { chamadoId });
  assert.equal(enc.ok, true, enc.message);
});

after(async () => { await env?.cleanup(); });

function cliente(perfil, usuarioId, extras = {}) {
  return env.authenticatedContext(`${EMP}-${usuarioId}`, {
    email: `${usuarioId}@${EMP}.test`, perfil, empresaId: EMP, usuarioId,
    firebase: { sign_in_provider: 'password' }, ...extras
  }).firestore();
}

// A mesma consulta do LogService.historicoDe: os ids do chamado, da OS e do
// orçamento, por alvoId e por alvoPaiId.
async function logsComoOApp(db, ids) {
  const logs = collection(db, 'empresasClientes', EMP, 'logs');
  const [porPai, porAlvo] = await Promise.all([
    getDocs(query(logs, where('alvoPaiId', 'in', ids), orderBy('data', 'desc'), limit(100))),
    getDocs(query(logs, where('alvoId', 'in', ids), orderBy('data', 'desc'), limit(100)))
  ]);
  const porId = new Map();
  for (const d of [...porPai.docs, ...porAlvo.docs]) porId.set(d.id, d.data());
  return [...porId.values()];
}

// Chamado e OS lidos como o app lê: a contratada só lista as OS dela
// (where empresaContratadaId), e a tela filtra as do chamado.
async function registros(db, contratada) {
  const base = ['empresasClientes', EMP];
  const chamado = (await getDoc(docCliente(db, ...base, 'chamados', chamadoId))).data();
  const colOS = collection(db, ...base, 'ordensServico');
  const ordens = (await getDocs(contratada ? query(colOS, where('empresaContratadaId', '==', contratada)) : colOS)).docs
    .map((d) => d.data())
    .filter((o) => o.chamadoId === chamadoId);
  return { chamado, ordens };
}

const nomes = { nomeUsuario: (id) => ({ t1: 'Técnico Um', gc1: 'Responsável Um' })[id], nomeContratada: (id) => (id === 'ec1' ? 'Contratada Um' : undefined) };

test('as callables gravam o log de cada etapa ligado ao chamado, à OS ou ao orçamento', async () => {
  const todos = (await emp.collection('logs').get()).docs.map((d) => d.data());
  const ids = new Set([chamadoId, osId, orcamentoId]);
  const doFluxo = todos.filter((l) => ids.has(l.alvoId));
  assert.deepEqual(
    doFluxo.map((l) => l.acao).sort(),
    ['chamado.criar', 'chamado.transicao', 'orcamento.criar', 'orcamento.transicao', 'ordemServico.criar', 'ordemServico.transicao'].sort()
  );
  // Nenhuma descrição com o prefixo repetido ("OS OS-...").
  for (const l of doFluxo) assert.doesNotMatch(l.descricao, /\bOS OS-/, l.descricao);
});

test('gestão: a mesma linha do tempo no chamado e na OS, com as seis etapas, hora e autor', async () => {
  const gestor = cliente('gestor', 'g1');
  const { chamado, ordens } = await registros(gestor);
  const orcamentos = (await getDocs(collection(gestor, 'empresasClientes', EMP, 'orcamentos'))).docs
    .map((d) => d.data())
    .filter((o) => o.osId === osId);
  const ids = idsDaLinhaDoTempo({ chamado, ordens, orcamentos });
  assert.deepEqual(new Set(ids), new Set([chamadoId, osId, orcamentoId]));

  const logs = await logsComoOApp(gestor, ids);
  const linha = montarLinhaDoTempo({ chamado, ordens, orcamentos, logs, ...nomes });
  assert.deepEqual(linha.map((e) => e.tipo), MARCOS);
  // Vieram do log: cada marco tem hora e quem fez.
  for (const e of linha) {
    assert.match(e.quandoTexto, /^\d{2}\/\d{2}\/\d{4} às \d{2}:\d{2}$/, `${e.titulo}: ${e.quandoTexto}`);
    assert.ok(e.autor, `${e.titulo} sem autor`);
  }
  assert.deepEqual(linha.map((e) => e.autor), ['cliente', 'gestor', 'contratado', 'gestor', 'tecnico', 'gestor']);
  assert.deepEqual(linha.map((e) => e.titulo), [
    'Chamado aberto',
    'OS criada e enviada à empresa contratada',
    'Orçamento enviado para aprovação',
    'Orçamento aprovado pela gestão',
    'Serviço feito',
    'Chamado encerrado'
  ]);
  assert.match(linha[1].detalhe, /^OS-\d{4}-\d{4} · Contratada Um$/);
  assert.equal(linha[2].detalhe, '1 item do contrato');
  assert.equal(linha[4].detalhe, 'Troquei o capacitor.');
  // Linguagem comum: nenhum nome de campo (camelCase), nenhuma data ISO.
  for (const e of linha) {
    const texto = `${e.titulo} ${e.detalhe} ${e.quandoTexto}`;
    assert.doesNotMatch(texto, /\b[a-z]+[A-Z][a-zA-Z]*\b/, texto);
    assert.doesNotMatch(texto, /\d{4}-\d{2}-\d{2}/, texto);
  }
});

test('técnico e contratada: o log continua fechado, e a linha do tempo sai dos registros', async () => {
  const tecnico = cliente('tecnico', 't1', { empresaContratadaId: 'ec1' });
  const contratado = cliente('gestor_contratado', 'gc1', { empresaContratadaId: 'ec1' });
  // O app não consulta `logs` para esses perfis: a regra nega, de propósito
  // (o log guarda preços e motivos que não são deles).
  await assertFails(getDocs(query(collection(tecnico, 'empresasClientes', EMP, 'logs'), where('alvoId', 'in', [osId]))));

  for (const db of [tecnico, contratado]) {
    const { chamado, ordens } = await registros(db, 'ec1');
    const orcamentos = (await getDocs(query(collection(db, 'empresasClientes', EMP, 'orcamentos'), where('empresaContratadaId', '==', 'ec1'))))
      .docs.map((d) => d.data())
      .filter((o) => o.osId === osId);
    const linha = montarLinhaDoTempo({ chamado, ordens, orcamentos, ...nomes });
    assert.deepEqual(linha.map((e) => e.tipo), MARCOS);
    // Do registro: data sem hora, e quem pediu e quem fez o serviço.
    for (const e of linha) assert.match(e.quandoTexto, /^\d{2}\/\d{2}\/\d{4}$/);
    assert.equal(linha[0].autor, 'cliente');
    assert.equal(linha[4].autor, 'Técnico Um');
  }
});

test('chamado da demonstração (sem log nenhum) também mostra a linha do tempo', async () => {
  // O chamado do cenário foi gravado direto, como o seed faz: sem logs.
  await emp.collection('orcamentos').doc('orc-seed').set({
    id: 'orc-seed', osId: 'os1', empresaContratadaId: 'ec1', situacao: 'Pendente', dataCriacao: '2026-09-03',
    itens: [{ itemContratoId: 'i1', nome: 'Item A', quantidade: 1, precoUnitario: 10 }]
  });
  const chamado = await doc(emp, 'chamados', 'ch1');
  const ordens = [await doc(emp, 'ordensServico', 'os1')];
  const linha = montarLinhaDoTempo({ chamado, ordens, orcamentos: [await doc(emp, 'orcamentos', 'orc-seed')], logs: [], ...nomes });
  assert.deepEqual(linha.map((e) => e.tipo), ['aberto', 'os', 'orcamento']);
  assert.deepEqual(linha.map((e) => e.quandoTexto), ['01/09/2026', '02/09/2026', '03/09/2026']);
});
