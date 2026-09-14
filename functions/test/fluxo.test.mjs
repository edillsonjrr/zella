// Fluxo OS → orçamento → aprovação → execução/cancelamento, com o saldo do
// contrato conferido em cada passo. Roda contra o Emulator Suite.
import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import { cenarioBasico, chamar, item, doc } from './helpers.mjs';

const EMP = 'teste-fluxo';
let emp, tokens;

before(async () => {
  ({ emp, tokens } = await cenarioBasico(EMP));
});

test('técnico cria orçamento: preço vem do contrato, não do corpo', async () => {
  const r = await chamar('criarOrcamento', tokens.tecnico, {
    osId: 'os1',
    itens: [{ itemContratoId: 'i1', quantidade: 5, precoUnitario: 999, nome: 'forjado' }]
  });
  assert.equal(r.ok, true, r.message);
  const orc = await doc(emp, 'orcamentos', r.data.id);
  assert.equal(orc.situacao, 'Pendente');
  assert.equal(orc.itens[0].precoUnitario, 10);
  assert.equal(orc.itens[0].nome, 'Item A');
  assert.equal((await doc(emp, 'ordensServico', 'os1')).situacao, 'Em vistoria');
  assert.equal((await doc(emp, 'chamados', 'ch1')).status, 'Em orçamento');
  assert.deepEqual(await item(emp), { disp: 100, res: 0, cons: 0, contratada: 100 });
});

test('orçamento com item de outro contrato ou quantidade zero é recusado', async () => {
  const outro = await chamar('criarOrcamento', tokens.tecnico, { osId: 'os1', itens: [{ itemContratoId: 'nao-existe', quantidade: 1 }] });
  assert.equal(outro.ok, false);
  assert.equal(outro.code, 'NOT_FOUND');
  const zero = await chamar('criarOrcamento', tokens.tecnico, { osId: 'os1', itens: [{ itemContratoId: 'i1', quantidade: 0 }] });
  assert.equal(zero.ok, false);
  assert.equal(zero.code, 'INVALID_ARGUMENT');
});

test('reenvio do orçamento pendente marca o anterior como Substituído', async () => {
  const antes = (await doc(emp, 'ordensServico', 'os1')).orcamentoId;
  const r = await chamar('criarOrcamento', tokens.tecnico, { osId: 'os1', itens: [{ itemContratoId: 'i1', quantidade: 8 }] });
  assert.equal(r.ok, true, r.message);
  assert.equal((await doc(emp, 'orcamentos', antes)).situacao, 'Substituído');
  assert.equal((await doc(emp, 'ordensServico', 'os1')).orcamentoId, r.data.id);
});

test('gestor contratado não aprova orçamento', async () => {
  const orcId = (await doc(emp, 'ordensServico', 'os1')).orcamentoId;
  const r = await chamar('aprovarOrcamento', tokens.contratado, { orcamentoId: orcId });
  assert.equal(r.ok, false);
  assert.equal(r.code, 'PERMISSION_DENIED');
});

test('gestor aprova: reserva o saldo', async () => {
  const orcId = (await doc(emp, 'ordensServico', 'os1')).orcamentoId;
  const r = await chamar('aprovarOrcamento', tokens.gestor, { orcamentoId: orcId });
  assert.equal(r.ok, true, r.message);
  assert.deepEqual(await item(emp), { disp: 92, res: 8, cons: 0, contratada: 100 });
  assert.equal((await doc(emp, 'ordensServico', 'os1')).situacao, 'Aprovada');
  assert.equal((await doc(emp, 'chamados', 'ch1')).status, 'A ser finalizado');
});

test('orçamento novo em OS aprovada é recusado (reserva não vaza)', async () => {
  const r = await chamar('criarOrcamento', tokens.tecnico, { osId: 'os1', itens: [{ itemContratoId: 'i1', quantidade: 1 }] });
  assert.equal(r.ok, false);
  assert.equal(r.code, 'FAILED_PRECONDITION');
  assert.deepEqual(await item(emp), { disp: 92, res: 8, cons: 0, contratada: 100 });
});

test('encerrar antes de executar é recusado', async () => {
  const r = await chamar('encerrarChamado', tokens.gestor, { chamadoId: 'ch1' });
  assert.equal(r.ok, false);
  assert.equal(r.code, 'FAILED_PRECONDITION');
});

test('técnico executa: reservado vira consumido', async () => {
  const r = await chamar('executarOS', tokens.tecnico, { osId: 'os1' });
  assert.equal(r.ok, true, r.message);
  assert.deepEqual(await item(emp), { disp: 92, res: 0, cons: 8, contratada: 100 });
  assert.equal((await doc(emp, 'chamados', 'ch1')).status, 'Executado');
});

test('gestor encerra depois de executado', async () => {
  const contratado = await chamar('encerrarChamado', tokens.contratado, { chamadoId: 'ch1' });
  assert.equal(contratado.code, 'PERMISSION_DENIED');
  const r = await chamar('encerrarChamado', tokens.gestor, { chamadoId: 'ch1' });
  assert.equal(r.ok, true, r.message);
  assert.equal((await doc(emp, 'chamados', 'ch1')).status, 'Encerrado');
  assert.equal((await doc(emp, 'ordensServico', 'os1')).situacao, 'Encerrada');
});

test('cancelar chamado com orçamento aprovado devolve a reserva', async () => {
  // Segundo chamado/OS no mesmo contrato.
  await emp.collection('chamados').doc('ch2').set({
    id: 'ch2', numero: 'CH-T-0002', titulo: 'T2', equipamento: 'E', descricao: 'd', unidadeId: 'u1',
    solicitanteId: 'cl1', solicitanteNome: 'cliente', status: 'Em atendimento', dataCriacao: '2026-09-03', possuiFoto: false, ordemServicoId: 'os2'
  });
  await emp.collection('ordensServico').doc('os2').set({
    id: 'os2', numero: 'OS-T-0002', chamadoId: 'ch2', contratoId: 'c1', unidadeId: 'u1', empresaContratadaId: 'ec1', situacao: 'Aberta', dataCriacao: '2026-09-03'
  });
  const orc = await chamar('criarOrcamento', tokens.contratado, { osId: 'os2', itens: [{ itemContratoId: 'i1', quantidade: 20 }] });
  assert.equal(orc.ok, true, orc.message);
  const ap = await chamar('aprovarOrcamento', tokens.gestor, { orcamentoId: orc.data.id });
  assert.equal(ap.ok, true, ap.message);
  assert.deepEqual(await item(emp), { disp: 72, res: 20, cons: 8, contratada: 100 });

  const c = await chamar('cancelarChamado', tokens.gestor, { chamadoId: 'ch2', motivo: 'teste' });
  assert.equal(c.ok, true, c.message);
  assert.deepEqual(await item(emp), { disp: 92, res: 0, cons: 8, contratada: 100 });
  assert.equal((await doc(emp, 'ordensServico', 'os2')).situacao, 'Cancelada');
  assert.equal((await doc(emp, 'chamados', 'ch2')).status, 'Cancelado');
});

test('aprovação com saldo insuficiente é recusada sem mexer no item', async () => {
  await emp.collection('chamados').doc('ch3').set({
    id: 'ch3', numero: 'CH-T-0003', titulo: 'T3', equipamento: 'E', descricao: 'd', unidadeId: 'u1',
    solicitanteId: 'cl1', solicitanteNome: 'cliente', status: 'Em atendimento', dataCriacao: '2026-09-04', possuiFoto: false, ordemServicoId: 'os3'
  });
  await emp.collection('ordensServico').doc('os3').set({
    id: 'os3', numero: 'OS-T-0003', chamadoId: 'ch3', contratoId: 'c1', unidadeId: 'u1', empresaContratadaId: 'ec1', situacao: 'Aberta', dataCriacao: '2026-09-04'
  });
  // A tela barra quantidade acima do saldo, mas a function precisa barrar
  // sozinha: dois orçamentos aprovados em sequência podem estourar.
  const orc = await chamar('criarOrcamento', tokens.tecnico, { osId: 'os3', itens: [{ itemContratoId: 'i1', quantidade: 93 }] });
  assert.equal(orc.ok, true, orc.message);
  const ap = await chamar('aprovarOrcamento', tokens.gestor, { orcamentoId: orc.data.id });
  assert.equal(ap.ok, false);
  assert.equal(ap.code, 'FAILED_PRECONDITION');
  assert.deepEqual(await item(emp), { disp: 92, res: 0, cons: 8, contratada: 100 });
});

test('aditivo: só gestor, respeita o mínimo, move o disponível e registra', async () => {
  const negado = await chamar('aditivarContrato', tokens.contratado, { contratoId: 'c1', motivo: 'x', itens: [{ itemContratoId: 'i1', novaQuantidadeContratada: 200 }] });
  assert.equal(negado.code, 'PERMISSION_DENIED');

  // 8 consumidos: reduzir para 5 não pode.
  const abaixo = await chamar('aditivarContrato', tokens.gestor, { contratoId: 'c1', motivo: 'reduz', itens: [{ itemContratoId: 'i1', novaQuantidadeContratada: 5 }] });
  assert.equal(abaixo.code, 'FAILED_PRECONDITION');

  const encurta = await chamar('aditivarContrato', tokens.gestor, { contratoId: 'c1', motivo: 'encurta', novaVigenciaFim: '2026-10-01' });
  assert.equal(encurta.code, 'FAILED_PRECONDITION');

  const ok = await chamar('aditivarContrato', tokens.gestor, {
    contratoId: 'c1', motivo: 'Termo aditivo 01', novaVigenciaFim: '2028-06-30',
    itens: [{ itemContratoId: 'i1', novaQuantidadeContratada: 150 }]
  });
  assert.equal(ok.ok, true, ok.message);
  assert.equal(ok.data.numero, 1);
  assert.deepEqual(await item(emp), { disp: 142, res: 0, cons: 8, contratada: 150 });
  const contrato = await doc(emp, 'contratos', 'c1');
  assert.equal(contrato.vigenciaFim, '2028-06-30');
  assert.equal(contrato.totalAditivos, 1);
  const aditivos = await emp.collection('contratos').doc('c1').collection('aditivos').get();
  assert.equal(aditivos.size, 1);
  assert.equal(aditivos.docs[0].data().itens[0].quantidadeContratada.para, 150);
});

test('importação de contratos: valida, recusa duplicado e grava com log', async () => {
  const csv = [
    'contrato;fornecedor;vigencia_inicio;vigencia_fim;item;quantidade;unidade;preco_unitario',
    'CTR-IMP-1;Contratada Um;01/01/2026;31/12/2026;Item X;10;un;12,50',
    'CTR-IMP-1;Contratada Um;01/01/2026;31/12/2026;Item Y;4;h;80',
    'CTR-IMP-2;Fornecedor Novo;01/02/2026;31/01/2027;Item Z;7'
  ].join('\n');
  const v = await chamar('validarImportacaoContratos', tokens.gestor, { csv });
  assert.equal(v.ok, true, v.message);
  assert.equal(v.data.valido, true);
  assert.deepEqual(v.data.fornecedoresSemCadastro, ['Fornecedor Novo']);

  const ruim = await chamar('validarImportacaoContratos', tokens.gestor, { csv: 'contrato;fornecedor;vigencia_inicio;vigencia_fim;item;quantidade\nA;B;31/12/2026;01/01/2026;I;0' });
  assert.equal(ruim.data.valido, false);
  assert.equal(ruim.data.erros[0].linha, 2);

  const imp = await chamar('importarContratos', tokens.gestor, { csv });
  assert.equal(imp.ok, true, imp.message);
  assert.deepEqual(imp.data, { contratosCriados: 2, itensCriados: 3 });
  const criados = await emp.collection('contratos').where('numero', '==', 'CTR-IMP-1').get();
  assert.equal(criados.size, 1);
  assert.equal(criados.docs[0].data().empresaContratadaId, 'ec1');
  const itens = await criados.docs[0].ref.collection('itens').get();
  assert.equal(itens.size, 2);
  assert.equal(itens.docs.find(d => d.data().nome === 'Item X').data().precoUnitario, 12.5);
  const logs = await emp.collection('logs').where('acao', '==', 'contrato.importar').get();
  assert.equal(logs.size, 2);

  const dup = await chamar('importarContratos', tokens.gestor, { csv });
  assert.equal(dup.code, 'INVALID_ARGUMENT');
  const semPerfil = await chamar('importarContratos', tokens.contratado, { csv });
  assert.equal(semPerfil.code, 'PERMISSION_DENIED');
});
