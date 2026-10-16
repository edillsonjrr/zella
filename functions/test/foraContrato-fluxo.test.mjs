// Z3.5: orçamento com item fora do contrato, ponta a ponta. O item fora do
// contrato passa por criar, aprovar (decisão item a item) e executar sem
// mexer no saldo de nenhum item do contrato: a conta
// contratada = disponível + reservada + consumida continua fechando.
// Roda contra o Emulator Suite (npm test).
import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import { cenarioBasico, chamar, item, doc } from './helpers.mjs';

const EMP = 'teste-fora-contrato';
let emp, tokens;

const soma = (i) => i.disp + i.res + i.cons;
const compressor = { descricao: 'Troca do compressor', quantidade: 1, unidade: 'un', precoUnitario: 1250 };
const gas = { descricao: 'Gás R-410A', quantidade: 3, unidade: 'kg', precoUnitario: 90 };

async function chamadoComOS(ch, os) {
  await emp.collection('chamados').doc(ch).set({
    id: ch, numero: `CH-${ch}`, titulo: ch, equipamento: 'E', descricao: 'd', unidadeId: 'u1', solicitanteId: 'cl1',
    solicitanteNome: 'cliente', status: 'Em atendimento', dataCriacao: '2026-10-01', possuiFoto: false, ordemServicoId: os
  });
  await emp.collection('ordensServico').doc(os).set({
    id: os, numero: `OS-${os}`, chamadoId: ch, contratoId: 'c1', unidadeId: 'u1', empresaContratadaId: 'ec1',
    situacao: 'Aberta', dataCriacao: '2026-10-01'
  });
}

before(async () => {
  ({ emp, tokens } = await cenarioBasico(EMP));
});

test('orçamento com item do contrato e itens fora do contrato: fora do contrato não separa saldo', async () => {
  const antes = await item(emp);
  const orc = await chamar('criarOrcamento', tokens.tecnico, {
    osId: 'os1',
    itens: [{ itemContratoId: 'i1', quantidade: 10 }],
    itensForaContrato: [compressor, gas]
  });
  assert.equal(orc.ok, true, orc.message);
  const o = await doc(emp, 'orcamentos', orc.data.id);
  assert.deepEqual(o.itensForaContrato.map((i) => i.id), ['fc1', 'fc2']);
  assert.equal(o.itensForaContrato[0].decisao, undefined);
  assert.deepEqual(await item(emp), antes);

  // Sem decisão sobre os itens fora do contrato, não aprova nem separa nada.
  const semDecisao = await chamar('aprovarOrcamento', tokens.gestor, { orcamentoId: orc.data.id });
  assert.equal(semDecisao.code, 'INVALID_ARGUMENT');
  assert.match(semDecisao.message, /Decida cada item fora do contrato/);
  assert.deepEqual(await item(emp), antes);
  assert.equal((await doc(emp, 'orcamentos', orc.data.id)).situacao, 'Pendente');

  const ap = await chamar('aprovarOrcamento', tokens.gestor, {
    orcamentoId: orc.data.id,
    foraContrato: [{ id: 'fc1', aprovado: true }, { id: 'fc2', aprovado: false }]
  });
  assert.equal(ap.ok, true, ap.message);
  let i = await item(emp);
  // Só os 10 do item do contrato foram separados.
  assert.deepEqual(i, { disp: 90, res: 10, cons: 0, contratada: 100 });
  assert.equal(soma(i), i.contratada);
  const aprovado = await doc(emp, 'orcamentos', orc.data.id);
  assert.deepEqual(aprovado.itensForaContrato.map((x) => x.decisao), ['Aprovado', 'Recusado']);

  // Execução: usa 7 do contrato e o compressor aprovado; o gás recusado não entra.
  const recusado = await chamar('executarOS', tokens.tecnico, {
    osId: 'os1',
    itens: [{ itemContratoId: 'i1', quantidadeExecutada: 7 }],
    foraContrato: [{ id: 'fc2', quantidadeExecutada: 1 }]
  });
  assert.equal(recusado.code, 'INVALID_ARGUMENT');
  const ex = await chamar('executarOS', tokens.tecnico, {
    osId: 'os1',
    itens: [{ itemContratoId: 'i1', quantidadeExecutada: 7 }],
    foraContrato: [{ id: 'fc1', quantidadeExecutada: 1 }]
  });
  assert.equal(ex.ok, true, ex.message);
  i = await item(emp);
  assert.deepEqual(i, { disp: 93, res: 0, cons: 7, contratada: 100 });
  assert.equal(soma(i), i.contratada);
  const os = await doc(emp, 'ordensServico', 'os1');
  assert.deepEqual(os.itensForaContratoExecutados, [
    { id: 'fc1', descricao: 'Troca do compressor', unidade: 'un', aprovado: 1, executado: 1 }
  ]);
  // Sem preço na OS: a solicitante lê a OS, não o orçamento.
  assert.equal('precoUnitario' in os.itensForaContratoExecutados[0], false);
});

test('orçamento só com itens fora do contrato: aprova e executa sem tocar no saldo', async () => {
  await chamadoComOS('ch2', 'os2');
  const antes = await item(emp);
  const orc = await chamar('criarOrcamento', tokens.contratado, { osId: 'os2', itens: [], itensForaContrato: [gas] });
  assert.equal(orc.ok, true, orc.message);
  const ap = await chamar('aprovarOrcamento', tokens.gestor, { orcamentoId: orc.data.id, foraContrato: [{ id: 'fc1', aprovado: true }] });
  assert.equal(ap.ok, true, ap.message);
  assert.equal((await doc(emp, 'ordensServico', 'os2')).situacao, 'Aprovada');
  assert.deepEqual(await item(emp), antes);

  const ex = await chamar('executarOS', tokens.contratado, { osId: 'os2', foraContrato: [{ id: 'fc1', quantidadeExecutada: 2 }] });
  assert.equal(ex.ok, true, ex.message);
  assert.deepEqual(await item(emp), antes);
  const os = await doc(emp, 'ordensServico', 'os2');
  assert.deepEqual(os.itensExecutados, []);
  assert.equal(os.itensForaContratoExecutados[0].executado, 2);
});

test('recusar todos os itens fora do contrato sem item do contrato não aprova', async () => {
  await chamadoComOS('ch3', 'os3');
  const orc = await chamar('criarOrcamento', tokens.contratado, { osId: 'os3', itensForaContrato: [compressor] });
  assert.equal(orc.ok, true, orc.message);
  const ap = await chamar('aprovarOrcamento', tokens.gestor, { orcamentoId: orc.data.id, foraContrato: [{ id: 'fc1', aprovado: false }] });
  assert.equal(ap.code, 'FAILED_PRECONDITION');
  assert.equal((await doc(emp, 'orcamentos', orc.data.id)).situacao, 'Pendente');
});

test('cancelar OS aprovada com item fora do contrato devolve só o separado do contrato', async () => {
  await chamadoComOS('ch4', 'os4');
  const antes = await item(emp);
  const orc = await chamar('criarOrcamento', tokens.contratado, {
    osId: 'os4', itens: [{ itemContratoId: 'i1', quantidade: 5 }], itensForaContrato: [compressor]
  });
  assert.equal(orc.ok, true, orc.message);
  const ap = await chamar('aprovarOrcamento', tokens.gestor, { orcamentoId: orc.data.id, foraContrato: [{ id: 'fc1', aprovado: true }] });
  assert.equal(ap.ok, true, ap.message);
  assert.deepEqual(await item(emp), { ...antes, disp: antes.disp - 5, res: antes.res + 5 });
  const c = await chamar('cancelarChamado', tokens.gestor, { chamadoId: 'ch4' });
  assert.equal(c.ok, true, c.message);
  const depois = await item(emp);
  assert.deepEqual(depois, antes);
  assert.equal(soma(depois), depois.contratada);
});

test('item fora do contrato inválido e orçamento vazio são recusados', async () => {
  await chamadoComOS('ch5', 'os5');
  const preco = await chamar('criarOrcamento', tokens.contratado, { osId: 'os5', itensForaContrato: [{ ...gas, precoUnitario: 0 }] });
  assert.equal(preco.code, 'INVALID_ARGUMENT');
  const vazio = await chamar('criarOrcamento', tokens.contratado, { osId: 'os5', itens: [], itensForaContrato: [] });
  assert.equal(vazio.code, 'INVALID_ARGUMENT');
  // A tela não escolhe o id: um id mandado pela tela é ignorado.
  const ok = await chamar('criarOrcamento', tokens.contratado, { osId: 'os5', itensForaContrato: [{ ...gas, id: 'i1', decisao: 'Aprovado' }] });
  assert.equal(ok.ok, true, ok.message);
  const o = await doc(emp, 'orcamentos', ok.data.id);
  assert.equal(o.itensForaContrato[0].id, 'fc1');
  assert.equal(o.itensForaContrato[0].decisao, undefined);
});
