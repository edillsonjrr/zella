// Z3.5: validação dos itens fora do contrato (functions/src/foraContrato.ts).
// Não usa emulador: confere as funções puras que as callables usam. Roda
// junto dos outros em `npm test` (que compila antes) ou sozinho, depois de
// `npm run build`, com `node --test test/foraContrato.test.mjs`.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const {
  validarItensForaContrato,
  aplicarDecisoes,
  registrarExecucaoForaContrato,
  totalForaContrato,
  MAX_ITENS_FORA_CONTRATO
} = require('../lib/functions/src/foraContrato.js');

const valido = { descricao: '  Troca do   compressor ', quantidade: 1, unidade: 'un', precoUnitario: 1250.456 };

function erro(fn, codigo, texto) {
  try {
    fn();
  } catch (e) {
    assert.equal(e.code, codigo, e.message);
    if (texto) assert.match(e.message, texto);
    return;
  }
  assert.fail('deveria ter recusado');
}

test('itens válidos ganham id, descrição limpa e preço em centavos', () => {
  const itens = validarItensForaContrato([valido, { descricao: 'Gás R-410A', quantidade: 2.5, unidade: 'kg', precoUnitario: 90 }]);
  assert.deepEqual(itens, [
    { id: 'fc1', descricao: 'Troca do compressor', quantidade: 1, unidade: 'un', precoUnitario: 1250.46 },
    { id: 'fc2', descricao: 'Gás R-410A', quantidade: 2.5, unidade: 'kg', precoUnitario: 90 }
  ]);
  assert.equal(itens.some((i) => 'itemContratoId' in i), false);
});

test('sem itens fora do contrato a lista volta vazia', () => {
  assert.deepEqual(validarItensForaContrato(undefined), []);
  assert.deepEqual(validarItensForaContrato(null), []);
  assert.deepEqual(validarItensForaContrato([]), []);
});

test('item fora do contrato inválido é recusado com mensagem em português', () => {
  erro(() => validarItensForaContrato('x'), 'invalid-argument');
  erro(() => validarItensForaContrato([{ ...valido, descricao: 'ab' }]), 'invalid-argument', /descrição/);
  erro(() => validarItensForaContrato([{ ...valido, descricao: 'x'.repeat(201) }]), 'invalid-argument', /200 letras/);
  erro(() => validarItensForaContrato([{ ...valido, unidade: '' }]), 'invalid-argument', /unidade/);
  erro(() => validarItensForaContrato([{ ...valido, quantidade: 0 }]), 'invalid-argument', /quantidade/);
  erro(() => validarItensForaContrato([{ ...valido, quantidade: '2' }]), 'invalid-argument', /quantidade/);
  erro(() => validarItensForaContrato([{ ...valido, precoUnitario: -1 }]), 'invalid-argument', /preço/);
  erro(() => validarItensForaContrato([{ ...valido, precoUnitario: Number.NaN }]), 'invalid-argument', /preço/);
  erro(() => validarItensForaContrato([valido, null]), 'invalid-argument', /item fora do contrato 2/i);
  erro(() => validarItensForaContrato(Array(MAX_ITENS_FORA_CONTRATO + 1).fill(valido)), 'invalid-argument', /No máximo/);
});

test('aprovação exige decisão de cada item e marca aprovado ou recusado', () => {
  const itens = validarItensForaContrato([valido, { ...valido, descricao: 'Andaime' }]);
  erro(() => aplicarDecisoes(itens, undefined), 'invalid-argument', /Decida cada item/);
  erro(() => aplicarDecisoes(itens, [{ id: 'fc1', aprovado: true }]), 'invalid-argument', /Andaime/);
  erro(() => aplicarDecisoes(itens, [{ id: 'fc9', aprovado: true }]), 'invalid-argument');
  erro(() => aplicarDecisoes(itens, [{ id: 'fc1', aprovado: 'sim' }]), 'invalid-argument');

  const r = aplicarDecisoes(itens, [{ id: 'fc1', aprovado: true }, { id: 'fc2', aprovado: false }]);
  assert.equal(r.aprovados, 1);
  assert.equal(r.recusados, 1);
  assert.deepEqual(r.itens.map((i) => i.decisao), ['Aprovado', 'Recusado']);
  assert.equal(totalForaContrato(r.itens), 2500.92);
  assert.equal(totalForaContrato(r.itens, true), 1250.46);
});

test('orçamento sem itens fora do contrato não aceita decisão sobre eles', () => {
  assert.deepEqual(aplicarDecisoes(undefined, undefined), { itens: [], aprovados: 0, recusados: 0 });
  assert.deepEqual(aplicarDecisoes([], []), { itens: [], aprovados: 0, recusados: 0 });
  erro(() => aplicarDecisoes([], [{ id: 'fc1', aprovado: true }]), 'invalid-argument');
});

test('execução registra só os aprovados, até o aprovado', () => {
  const { itens } = aplicarDecisoes(
    validarItensForaContrato([{ ...valido, quantidade: 3 }, { ...valido, descricao: 'Andaime' }]),
    [{ id: 'fc1', aprovado: true }, { id: 'fc2', aprovado: false }]
  );
  assert.deepEqual(registrarExecucaoForaContrato(itens, undefined), [
    { id: 'fc1', descricao: 'Troca do compressor', unidade: 'un', aprovado: 3, executado: 3 }
  ]);
  assert.deepEqual(registrarExecucaoForaContrato(itens, [{ id: 'fc1', quantidadeExecutada: 2 }])[0].executado, 2);
  erro(() => registrarExecucaoForaContrato(itens, [{ id: 'fc1', quantidadeExecutada: 4 }]), 'failed-precondition', /máximo 3/);
  erro(() => registrarExecucaoForaContrato(itens, [{ id: 'fc2', quantidadeExecutada: 1 }]), 'invalid-argument', /aprovado/);
  erro(() => registrarExecucaoForaContrato(itens, [{ id: 'fc1', quantidadeExecutada: -1 }]), 'invalid-argument');
  // O que foi registrado não leva preço: a OS é lida pela solicitante.
  assert.equal('precoUnitario' in registrarExecucaoForaContrato(itens, undefined)[0], false);
  assert.deepEqual(registrarExecucaoForaContrato(undefined, undefined), []);
});
