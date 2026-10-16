// A1: a conta do item (contratada = disponível + reservada + consumida) não
// pode quebrar em nenhum caminho que mexe em saldo: aprovar, executar
// (inteiro ou em parte), cancelar, aditivo e encerramento do contrato.
// Inclui itens que já chegam inconsistentes (dado antigo), para conferir que
// as functions não criam saldo do nada. Roda contra o Emulator Suite.
import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import { cenarioBasico, chamar, item, doc } from './helpers.mjs';

const EMP = 'teste-saldo';
let emp, tokens;

const soma = (i) => i.disp + i.res + i.cons;

async function chamadoComOS(ch, os, extrasOS = {}) {
  await emp.collection('chamados').doc(ch).set({
    id: ch, numero: `CH-${ch}`, titulo: ch, equipamento: 'E', descricao: 'd', unidadeId: 'u1', solicitanteId: 'cl1',
    solicitanteNome: 'cliente', status: 'Em atendimento', dataCriacao: '2026-09-10', possuiFoto: false, ordemServicoId: os
  });
  await emp.collection('ordensServico').doc(os).set({
    id: os, numero: `OS-${os}`, chamadoId: ch, contratoId: 'c1', unidadeId: 'u1', empresaContratadaId: 'ec1',
    situacao: 'Aberta', dataCriacao: '2026-09-10', ...extrasOS
  });
}

async function novoItem(id, campos) {
  await emp.collection('contratos').doc('c1').collection('itens').doc(id).set({
    id, empresaId: EMP, nome: `Item ${id}`, unidadeMedida: 'un', precoUnitario: 10, ...campos
  });
}

before(async () => {
  ({ emp, tokens } = await cenarioBasico(EMP));
});

test('aprovar, executar em parte e conferir a conta a cada passo; aprovação grava a data', async () => {
  const orc = await chamar('criarOrcamento', tokens.tecnico, { osId: 'os1', itens: [{ itemContratoId: 'i1', quantidade: 10 }] });
  assert.equal(orc.ok, true, orc.message);
  const ap = await chamar('aprovarOrcamento', tokens.gestor, { orcamentoId: orc.data.id });
  assert.equal(ap.ok, true, ap.message);
  let i = await item(emp);
  assert.deepEqual(i, { disp: 90, res: 10, cons: 0, contratada: 100 });
  assert.equal(soma(i), i.contratada);
  assert.match((await doc(emp, 'orcamentos', orc.data.id)).dataAprovacao, /^\d{4}-\d{2}-\d{2}$/);

  const ex = await chamar('executarOS', tokens.tecnico, { osId: 'os1', itens: [{ itemContratoId: 'i1', quantidadeExecutada: 7 }] });
  assert.equal(ex.ok, true, ex.message);
  i = await item(emp);
  assert.deepEqual(i, { disp: 93, res: 0, cons: 7, contratada: 100 });
  assert.equal(soma(i), i.contratada);
});

test('orçamento pendente de OS cancelada não pode mais ser aprovado nem recusado', async () => {
  await chamadoComOS('ch2', 'os2');
  const orc = await chamar('criarOrcamento', tokens.contratado, { osId: 'os2', itens: [{ itemContratoId: 'i1', quantidade: 5 }] });
  assert.equal(orc.ok, true, orc.message);
  const cancel = await chamar('cancelarChamado', tokens.gestor, { chamadoId: 'ch2', motivo: 'não precisa mais' });
  assert.equal(cancel.ok, true, cancel.message);
  assert.equal((await doc(emp, 'ordensServico', 'os2')).situacao, 'Cancelada');

  const antes = await item(emp);
  const ap = await chamar('aprovarOrcamento', tokens.gestor, { orcamentoId: orc.data.id });
  assert.equal(ap.code, 'FAILED_PRECONDITION');
  const rej = await chamar('rejeitarOrcamento', tokens.gestor, { orcamentoId: orc.data.id });
  assert.equal(rej.code, 'FAILED_PRECONDITION');
  assert.deepEqual(await item(emp), antes);
  assert.equal((await doc(emp, 'chamados', 'ch2')).status, 'Cancelado');
});

test('executar com item que tem menos separado que o orçado não cria saldo', async () => {
  // Dado antigo: o item tem 2 separados, mas o orçamento aprovado diz 5.
  await novoItem('i2', { quantidadeContratada: 10, quantidadeDisponivel: 8, quantidadeReservada: 2, quantidadeConsumida: 0 });
  await chamadoComOS('ch3', 'os3', { situacao: 'Aprovada', orcamentoId: 'orc3' });
  await emp.collection('orcamentos').doc('orc3').set({
    id: 'orc3', osId: 'os3', empresaContratadaId: 'ec1', situacao: 'Aprovado', dataCriacao: '2026-09-10',
    itens: [{ itemContratoId: 'i2', nome: 'Item i2', quantidade: 5, precoUnitario: 10 }]
  });
  const ex = await chamar('executarOS', tokens.contratado, { osId: 'os3' });
  assert.equal(ex.ok, true, ex.message);
  const i = await item(emp, 'c1', 'i2');
  assert.equal(soma(i), 10);
  assert.deepEqual(i, { disp: 5, res: 0, cons: 5, contratada: 10 });
});

test('cancelar com item que tem menos separado que o orçado devolve só o que estava separado', async () => {
  await novoItem('i3', { quantidadeContratada: 10, quantidadeDisponivel: 9, quantidadeReservada: 1, quantidadeConsumida: 0 });
  await chamadoComOS('ch4', 'os4', { situacao: 'Aprovada', orcamentoId: 'orc4' });
  await emp.collection('chamados').doc('ch4').update({ status: 'A ser finalizado' });
  await emp.collection('orcamentos').doc('orc4').set({
    id: 'orc4', osId: 'os4', empresaContratadaId: 'ec1', situacao: 'Aprovado', dataCriacao: '2026-09-10',
    itens: [{ itemContratoId: 'i3', nome: 'Item i3', quantidade: 4, precoUnitario: 10 }]
  });
  const c = await chamar('cancelarChamado', tokens.gestor, { chamadoId: 'ch4' });
  assert.equal(c.ok, true, c.message);
  assert.deepEqual(await item(emp, 'c1', 'i3'), { disp: 10, res: 0, cons: 0, contratada: 10 });
});

test('aditivo recalcula o livre pela conta e deixa o item fechando, mesmo vindo errado', async () => {
  // Soma errada de antes: 90 + 5 + 10 = 105, contratada 100.
  await novoItem('i4', { quantidadeContratada: 100, quantidadeDisponivel: 90, quantidadeReservada: 5, quantidadeConsumida: 10 });
  const abaixo = await chamar('aditivarContrato', tokens.gestor, {
    contratoId: 'c1', motivo: 'reduz', itens: [{ itemContratoId: 'i4', novaQuantidadeContratada: 14 }]
  });
  assert.equal(abaixo.code, 'FAILED_PRECONDITION');
  assert.match(abaixo.message, /15 separados ou usados/);

  const ok = await chamar('aditivarContrato', tokens.gestor, {
    contratoId: 'c1', motivo: 'Termo aditivo', itens: [{ itemContratoId: 'i4', novaQuantidadeContratada: 120 }]
  });
  assert.equal(ok.ok, true, ok.message);
  const i = await item(emp, 'c1', 'i4');
  assert.deepEqual(i, { disp: 105, res: 5, cons: 10, contratada: 120 });
  assert.equal(soma(i), i.contratada);
});

test('encerrar contrato: o aditivo de encerramento grava a contratada antes e depois', async () => {
  await emp.collection('contratos').doc('c9').set({
    id: 'c9', numero: 'CTR-T-009', fornecedor: 'Contratada Um', empresaContratadaId: 'ec1',
    vigenciaInicio: '2026-01-01', vigenciaFim: '2027-12-31', status: 'Ativo'
  });
  await emp.collection('contratos').doc('c9').collection('itens').doc('i9').set({
    id: 'i9', empresaId: EMP, nome: 'Item i9', unidadeMedida: 'kg', precoUnitario: 1,
    quantidadeContratada: 10, quantidadeDisponivel: 7, quantidadeReservada: 0, quantidadeConsumida: 3
  });
  const r = await chamar('encerrarContrato', tokens.gestor, { contratoId: 'c9', motivo: 'Fim da vigência' });
  assert.equal(r.ok, true, r.message);
  assert.deepEqual(await item(emp, 'c9', 'i9'), { disp: 0, res: 0, cons: 3, contratada: 3 });
  const aditivos = await emp.collection('contratos').doc('c9').collection('aditivos').get();
  assert.equal(aditivos.size, 1);
  assert.deepEqual(aditivos.docs[0].data().itens, [
    { itemContratoId: 'i9', nome: 'Item i9', quantidadeContratada: { de: 10, para: 3 } }
  ]);
});
