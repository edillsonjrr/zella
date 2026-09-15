// Fotos na execução da OS: sobem pro Storage Emulator e o caminho fica na OS.
import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import { cenarioBasico, chamar, doc } from './helpers.mjs';

const EMP = 'teste-fluxo3';
let emp, tokens;
// PNG 1x1 válido.
const PNG = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==';

before(async () => { ({ emp, tokens } = await cenarioBasico(EMP)); });

test('execução com fotos grava caminhos na OS; mais de 3 ou formato errado é recusado', async () => {
  const orc = await chamar('criarOrcamento', tokens.tecnico, { osId: 'os1', itens: [{ itemContratoId: 'i1', quantidade: 2 }] });
  assert.equal(orc.ok, true, orc.message);
  const ap = await chamar('aprovarOrcamento', tokens.gestor, { orcamentoId: orc.data.id });
  assert.equal(ap.ok, true, ap.message);

  const demais = await chamar('executarOS', tokens.tecnico, { osId: 'os1', fotos: [PNG, PNG, PNG, PNG] });
  assert.equal(demais.code, 'INVALID_ARGUMENT');
  const errado = await chamar('executarOS', tokens.tecnico, { osId: 'os1', fotos: ['data:text/plain;base64,aGVsbG8='] });
  assert.equal(errado.code, 'INVALID_ARGUMENT');
  assert.equal((await doc(emp, 'ordensServico', 'os1')).situacao, 'Aprovada');

  const ok = await chamar('executarOS', tokens.tecnico, { osId: 'os1', fotos: [PNG, PNG], observacao: 'com fotos' });
  assert.equal(ok.ok, true, ok.message);
  const os = await doc(emp, 'ordensServico', 'os1');
  assert.equal(os.situacao, 'Executada');
  assert.deepEqual(os.fotosExecucao, [
    `empresasClientes/${EMP}/ordensServico/os1/execucao-1.png`,
    `empresasClientes/${EMP}/ordensServico/os1/execucao-2.png`
  ]);
});
