// A15–A19: execução parcial, ajuste na aprovação, técnico designado, SLA,
// encerramento de contrato e notificações. Cenário próprio.
import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import { cenarioBasico, chamar, item, doc, criarUsuarioAuth, idToken } from './helpers.mjs';

const EMP = 'teste-fluxo2';
let emp, tokens;

before(async () => {
  ({ emp, tokens } = await cenarioBasico(EMP));
  // Segundo técnico da mesma contratada, para testar a designação.
  await emp.collection('usuarios').doc('t2').set({ id: 't2', nome: 'tecnico2', email: `t2@${EMP}.test`, perfil: 'tecnico', empresaContratadaId: 'ec1' });
  await criarUsuarioAuth(`${EMP}-t2`, `t2@${EMP}.test`, { perfil: 'tecnico', empresaId: EMP, usuarioId: 't2', empresaContratadaId: 'ec1' });
  tokens.tecnico2 = await idToken(`t2@${EMP}.test`);
});

test('SLA: chamado manual nasce com dataVencimento (padrão 5 dias) e notifica o gestor', async () => {
  const r = await chamar('criarChamado', tokens.cliente, { titulo: 'SLA', equipamento: 'Bebedouro', descricao: 'pinga', unidadeId: 'u1', solicitanteNome: 'cliente', possuiFoto: false });
  assert.equal(r.ok, true, r.message);
  const ch = await doc(emp, 'chamados', r.data.id);
  assert.ok(ch.dataVencimento);
  const dias = Math.round((new Date(ch.dataVencimento) - new Date(ch.dataCriacao)) / 86400000);
  assert.equal(dias, 5);
  assert.equal(ch.origem, 'manual');
  const notif = await emp.collection('notificacoes').where('alvo.id', '==', r.data.id).get();
  assert.equal(notif.size, 1);
  assert.equal(notif.docs[0].data().paraPerfil, 'gestor');
});

test('SLA configurável por empresa (slaDias)', async () => {
  await emp.set({ slaDias: 2 }, { merge: true });
  const r = await chamar('criarChamado', tokens.cliente, { titulo: 'SLA2', equipamento: 'Porta', descricao: 'x', unidadeId: 'u1', solicitanteNome: 'cliente', possuiFoto: false });
  const ch = await doc(emp, 'chamados', r.data.id);
  assert.equal(Math.round((new Date(ch.dataVencimento) - new Date(ch.dataCriacao)) / 86400000), 2);
});

test('técnico designado: outro técnico não orça nem executa; gestor contratado redesigna', async () => {
  const d = await chamar('atribuirTecnicoOS', tokens.contratado, { osId: 'os1', tecnicoId: 't2' });
  assert.equal(d.ok, true, d.message);
  assert.equal((await doc(emp, 'ordensServico', 'os1')).tecnicoId, 't2');

  const negado = await chamar('criarOrcamento', tokens.tecnico, { osId: 'os1', itens: [{ itemContratoId: 'i1', quantidade: 3 }] });
  assert.equal(negado.code, 'PERMISSION_DENIED');
  const ok = await chamar('criarOrcamento', tokens.tecnico2, { osId: 'os1', itens: [{ itemContratoId: 'i1', quantidade: 10 }] });
  assert.equal(ok.ok, true, ok.message);

  const errado = await chamar('atribuirTecnicoOS', tokens.contratado, { osId: 'os1', tecnicoId: 'g1' });
  assert.equal(errado.code, 'INVALID_ARGUMENT');
  const cli = await chamar('atribuirTecnicoOS', tokens.cliente, { osId: 'os1', tecnicoId: 't1' });
  assert.equal(cli.code, 'PERMISSION_DENIED');
});

test('aprovação com ajuste: só pra baixo, reserva o ajustado e guarda o original', async () => {
  const orcId = (await doc(emp, 'ordensServico', 'os1')).orcamentoId;
  const acima = await chamar('aprovarOrcamento', tokens.gestor, { orcamentoId: orcId, ajustes: [{ itemContratoId: 'i1', quantidade: 11 }] });
  assert.equal(acima.code, 'FAILED_PRECONDITION');
  const zero = await chamar('aprovarOrcamento', tokens.gestor, { orcamentoId: orcId, ajustes: [{ itemContratoId: 'i1', quantidade: 0 }] });
  assert.equal(zero.code, 'FAILED_PRECONDITION');

  const ok = await chamar('aprovarOrcamento', tokens.gestor, { orcamentoId: orcId, ajustes: [{ itemContratoId: 'i1', quantidade: 6 }], observacao: 'só 6' });
  assert.equal(ok.ok, true, ok.message);
  const orc = await doc(emp, 'orcamentos', orcId);
  assert.equal(orc.itens[0].quantidade, 6);
  assert.equal(orc.itensOriginais[0].quantidade, 10);
  assert.equal(orc.ajustadoPeloGestor, true);
  assert.deepEqual(await item(emp), { disp: 94, res: 6, cons: 0, contratada: 100 });
  const notifs = await emp.collection('notificacoes').where('alvo.id', '==', 'os1').get();
  assert.equal(notifs.docs.some((n) => n.data().paraUsuarioId === 't2'), true);
});

test('execução parcial: consome o executado e devolve a sobra ao disponível', async () => {
  const outro = await chamar('executarOS', tokens.tecnico, { osId: 'os1' });
  assert.equal(outro.code, 'PERMISSION_DENIED');
  const acima = await chamar('executarOS', tokens.tecnico2, { osId: 'os1', itens: [{ itemContratoId: 'i1', quantidadeExecutada: 7 }] });
  assert.equal(acima.code, 'FAILED_PRECONDITION');

  const ok = await chamar('executarOS', tokens.tecnico2, { osId: 'os1', itens: [{ itemContratoId: 'i1', quantidadeExecutada: 4 }], observacao: 'faltou peça' });
  assert.equal(ok.ok, true, ok.message);
  assert.deepEqual(await item(emp), { disp: 96, res: 0, cons: 4, contratada: 100 });
  const os = await doc(emp, 'ordensServico', 'os1');
  assert.equal(os.situacao, 'Executada');
  assert.equal(os.itensExecutados[0].executado, 4);
  assert.equal(os.itensExecutados[0].orcado, 6);
  assert.equal(os.executadoPor, 't2');
});

test('encerrar contrato: bloqueia com OS aprovada, depois zera disponível e cancela OS em orçamento', async () => {
  for (const [ch, os] of [['ch2', 'os2'], ['ch3', 'os3']]) {
    await emp.collection('chamados').doc(ch).set({ id: ch, numero: `CH-${ch}`, titulo: ch, equipamento: 'E', descricao: 'd', unidadeId: 'u1', solicitanteId: 'cl1', solicitanteNome: 'c', status: 'Em atendimento', dataCriacao: '2026-09-05', possuiFoto: false, ordemServicoId: os });
    await emp.collection('ordensServico').doc(os).set({ id: os, numero: `OS-${os}`, chamadoId: ch, contratoId: 'c1', unidadeId: 'u1', empresaContratadaId: 'ec1', situacao: 'Aberta', dataCriacao: '2026-09-05' });
  }
  const orc = await chamar('criarOrcamento', tokens.contratado, { osId: 'os2', itens: [{ itemContratoId: 'i1', quantidade: 5 }] });
  const ap = await chamar('aprovarOrcamento', tokens.gestor, { orcamentoId: orc.data.id });
  assert.equal(ap.ok, true, ap.message);

  const bloqueado = await chamar('encerrarContrato', tokens.gestor, { contratoId: 'c1', motivo: 'fim' });
  assert.equal(bloqueado.code, 'FAILED_PRECONDITION');
  assert.match(bloqueado.message, /OS-os2/);

  const cancel = await chamar('cancelarChamado', tokens.gestor, { chamadoId: 'ch2', motivo: 'encerrando contrato' });
  assert.equal(cancel.ok, true, cancel.message);
  assert.deepEqual(await item(emp), { disp: 96, res: 0, cons: 4, contratada: 100 });

  const negado = await chamar('encerrarContrato', tokens.contratado, { contratoId: 'c1', motivo: 'fim' });
  assert.equal(negado.code, 'PERMISSION_DENIED');

  const ok = await chamar('encerrarContrato', tokens.gestor, { contratoId: 'c1', motivo: 'Vigência encerrada' });
  assert.equal(ok.ok, true, ok.message);
  assert.equal(ok.data.disponivelZerado, 96);
  assert.deepEqual(ok.data.osCanceladas, ['OS-os3']);
  assert.deepEqual(await item(emp), { disp: 0, res: 0, cons: 4, contratada: 4 });
  const c = await doc(emp, 'contratos', 'c1');
  assert.equal(c.status, 'Encerrado');
  assert.equal(c.motivoEncerramento, 'Vigência encerrada');
  assert.equal((await doc(emp, 'chamados', 'ch3')).status, 'Aberto');
  assert.equal((await doc(emp, 'chamados', 'ch3')).ordemServicoId, undefined);
  assert.equal((await doc(emp, 'ordensServico', 'os3')).situacao, 'Cancelada');

  const denovo = await chamar('encerrarContrato', tokens.gestor, { contratoId: 'c1', motivo: 'x' });
  assert.equal(denovo.code, 'FAILED_PRECONDITION');
  const osNova = await chamar('criarOS', tokens.gestor, { chamadoId: 'ch3', contratoId: 'c1' });
  assert.equal(osNova.code, 'FAILED_PRECONDITION');
});
