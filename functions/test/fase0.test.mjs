// Fase 0 do plano de ação (Z0.3, Z0.4, Z0.6 e Z0.7) nas callables. Roda
// contra o Emulator Suite.
import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import { cenarioBasico, chamar, doc } from './helpers.mjs';

const EMP = 'teste-fase0';
let emp, tokens;

const pedido = { titulo: 'Porta', equipamento: 'Porta do banheiro', descricao: 'não fecha', unidadeId: 'u1', solicitanteNome: 'x', possuiFoto: false };

async function novoChamado(id) {
  await emp.collection('chamados').doc(id).set({
    id, numero: `CH-T-${id}`, titulo: id, equipamento: 'Bebedouro', descricao: 'pinga', unidadeId: 'u1', solicitanteId: 'cl1',
    solicitanteNome: 'cliente', status: 'Aberto', dataCriacao: '2026-10-01', possuiFoto: false
  });
}

async function avisos(filtro) {
  const snap = await emp.collection('notificacoes').get();
  return snap.docs.map((d) => d.data()).filter(filtro);
}

before(async () => {
  ({ emp, tokens } = await cenarioBasico(EMP));
  // Segunda contratada, só com técnico (sem responsável): o técnico orça.
  await emp.collection('empresasContratadas').doc('ec2').set({ id: 'ec2', nome: 'Contratada Dois' });
  await emp.collection('usuarios').doc('t2').set({ id: 't2', nome: 'Técnico Dois', email: 't2@x.test', perfil: 'tecnico', empresaContratadaId: 'ec2' });
  await emp.collection('contratos').doc('c2').set({
    id: 'c2', numero: 'CTR-T-002', fornecedor: 'Contratada Dois', empresaContratadaId: 'ec2',
    vigenciaInicio: '2026-01-01', vigenciaFim: '2027-12-31', status: 'Ativo'
  });
  await emp.collection('contratos').doc('c2').collection('itens').doc('i9').set({
    id: 'i9', empresaId: EMP, nome: 'Carga de gás', unidadeMedida: 'kg',
    quantidadeContratada: 3, quantidadeDisponivel: 3, quantidadeReservada: 0, quantidadeConsumida: 0, precoUnitario: 120
  });
});

test('Z0.4: a Nova OS só aceita técnico da contratada do contrato', async () => {
  await novoChamado('a1');
  const outra = await chamar('criarOS', tokens.gestor, { chamadoId: 'a1', contratoId: 'c1', tecnicoId: 't2' });
  assert.equal(outra.code, 'FAILED_PRECONDITION');
  assert.match(outra.message, /empresa contratada do contrato/);
  const naoTecnico = await chamar('criarOS', tokens.gestor, { chamadoId: 'a1', contratoId: 'c1', tecnicoId: 'gc1' });
  assert.equal(naoTecnico.code, 'INVALID_ARGUMENT');
  assert.equal((await doc(emp, 'chamados', 'a1')).ordemServicoId, undefined);
  const semTecnico = await chamar('criarOS', tokens.gestor, { chamadoId: 'a1', contratoId: 'c1' });
  assert.equal(semTecnico.ok, true, semTecnico.message);
});

test('Z0.4: o técnico só recebe "envie o orçamento" quando é ele quem orça', async () => {
  // Contratada Um tem responsável (gc1): quem orça é a prestadora.
  await novoChamado('a2');
  const comResponsavel = await chamar('criarOS', tokens.gestor, { chamadoId: 'a2', contratoId: 'c1', tecnicoId: 't1' });
  assert.equal(comResponsavel.ok, true, comResponsavel.message);
  const [paraT1] = await avisos((n) => n.paraUsuarioId === 't1' && n.alvo?.id === comResponsavel.data.id);
  assert.equal(paraT1.titulo, `${comResponsavel.data.numero} designada a você`);
  assert.doesNotMatch(paraT1.texto, /envie o orçamento/i);
  assert.match(paraT1.texto, /Sua empresa manda o orçamento/);

  // Contratada Dois não tem responsável: o técnico é quem orça.
  await novoChamado('a3');
  const soTecnico = await chamar('criarOS', tokens.gestor, { chamadoId: 'a3', contratoId: 'c2', tecnicoId: 't2' });
  assert.equal(soTecnico.ok, true, soTecnico.message);
  const [paraT2] = await avisos((n) => n.paraUsuarioId === 't2' && n.alvo?.id === soTecnico.data.id);
  assert.match(paraT2.texto, /envie o orçamento/i);

  // Recusa: com responsável, o aviso de refazer vai para ele, não para o técnico.
  const orc = await chamar('criarOrcamento', tokens.contratado, { osId: comResponsavel.data.id, itens: [{ itemContratoId: 'i1', quantidade: 1 }] });
  assert.equal(orc.ok, true, orc.message);
  const rej = await chamar('rejeitarOrcamento', tokens.gestor, { orcamentoId: orc.data.id });
  assert.equal(rej.ok, true, rej.message);
  const recusa = await avisos((n) => n.alvo?.id === comResponsavel.data.id && /recusado/.test(n.titulo));
  assert.deepEqual(recusa.map((n) => n.paraPerfil ?? n.paraUsuarioId), ['gestor_contratado']);
});

test('Z0.3: a OS só fica "Aprovada" pelo orçamento atual, e sem orçamento aprovado não registra serviço', async () => {
  await novoChamado('a4');
  const os = await chamar('criarOS', tokens.gestor, { chamadoId: 'a4', contratoId: 'c1' });
  assert.equal(os.ok, true, os.message);
  const primeiro = await chamar('criarOrcamento', tokens.contratado, { osId: os.data.id, itens: [{ itemContratoId: 'i1', quantidade: 1 }] });
  assert.equal(primeiro.ok, true, primeiro.message);
  // Dado antigo: um orçamento pendente que não é o atual da OS.
  await emp.collection('orcamentos').doc('velho').set({
    id: 'velho', osId: os.data.id, empresaContratadaId: 'ec1', situacao: 'Pendente', dataCriacao: '2026-09-01',
    itens: [{ itemContratoId: 'i1', nome: 'Item A', quantidade: 1, precoUnitario: 10 }]
  });
  const errado = await chamar('aprovarOrcamento', tokens.gestor, { orcamentoId: 'velho' });
  assert.equal(errado.code, 'FAILED_PRECONDITION');
  assert.match(errado.message, /não é o orçamento atual/);
  assert.equal((await doc(emp, 'ordensServico', os.data.id)).situacao, 'Em vistoria');

  const certo = await chamar('aprovarOrcamento', tokens.gestor, { orcamentoId: primeiro.data.id });
  assert.equal(certo.ok, true, certo.message);
  const aprovada = await doc(emp, 'ordensServico', os.data.id);
  assert.equal(aprovada.situacao, 'Aprovada');
  assert.equal(aprovada.orcamentoId, primeiro.data.id);

  // OS "Aprovada" sem orçamento (dado antigo): o serviço não é registrado.
  await novoChamado('a5');
  await emp.collection('ordensServico').doc('os-sem-orc').set({
    id: 'os-sem-orc', numero: 'OS-T-0099', chamadoId: 'a5', contratoId: 'c1', unidadeId: 'u1', empresaContratadaId: 'ec1',
    situacao: 'Aprovada', dataCriacao: '2026-10-01'
  });
  const ex = await chamar('executarOS', tokens.contratado, { osId: 'os-sem-orc' });
  assert.equal(ex.code, 'FAILED_PRECONDITION');
  assert.match(ex.message, /não tem orçamento aprovado/);
  assert.equal((await doc(emp, 'ordensServico', 'os-sem-orc')).situacao, 'Aprovada');
});

test('Z0.6: saldo insuficiente diz a unidade e usa "livre"; nenhum aviso com "OS OS-"', async () => {
  await novoChamado('a6');
  const os = await chamar('criarOS', tokens.gestor, { chamadoId: 'a6', contratoId: 'c2', tecnicoId: 't2' });
  assert.equal(os.ok, true, os.message);
  await emp.collection('ordensServico').doc(os.data.id).update({ situacao: 'Aberta' });
  // Orça direto no banco (o técnico Dois não tem login no cenário).
  await emp.collection('orcamentos').doc('orc-gas').set({
    id: 'orc-gas', osId: os.data.id, empresaContratadaId: 'ec2', situacao: 'Pendente', dataCriacao: '2026-10-02',
    itens: [{ itemContratoId: 'i9', nome: 'Carga de gás', quantidade: 5, precoUnitario: 120 }]
  });
  await emp.collection('ordensServico').doc(os.data.id).update({ situacao: 'Em vistoria', orcamentoId: 'orc-gas' });
  const ap = await chamar('aprovarOrcamento', tokens.gestor, { orcamentoId: 'orc-gas' });
  assert.equal(ap.code, 'FAILED_PRECONDITION');
  assert.match(ap.message, /pede 5 kg, e o contrato só tem 3 kg livres/);
  assert.doesNotMatch(ap.message, /dispon[ií]vel|solicitado/);

  const todos = await avisos(() => true);
  assert.ok(todos.length > 0);
  for (const n of todos) {
    assert.doesNotMatch(`${n.titulo} ${n.texto}`, /\bOS OS-|\(s\)/, `${n.titulo} — ${n.texto}`);
  }
});

test('Z0.6: a validação da importação fala a língua de quem usa planilha', async () => {
  const csv = [
    'contrato;fornecedor;vigencia_inicio;vigencia_fim;item;quantidade',
    'A;B;31/12/2026;01/01/2026;I;1',
    'C;D;2026-01-01;31/12/2026;I;1',
    'E;F;01/01/2026;31/12/2026;I',
    'G;H;01/01/2026;31/12/2026;I;0'
  ].join('\n');
  const v = await chamar('validarImportacaoContratos', tokens.gestor, { csv });
  assert.equal(v.ok, true, v.message);
  const msgs = v.data.erros.map((e) => e.mensagem);
  assert.match(msgs[0], /termina antes de começar/);
  assert.match(msgs[1], /dia\/mês\/ano, como 01\/03\/2026/);
  assert.match(msgs[2], /a linha tem 5 colunas, e o modelo tem 6/);
  assert.match(msgs[3], /quantidade contratada precisa ser um número maior que zero/);
  for (const m of msgs) assert.doesNotMatch(m, /campos, encontrado|vigência início|dd\/mm\/aaaa/);

  const imp = await chamar('importarContratos', tokens.gestor, { csv });
  assert.equal(imp.code, 'INVALID_ARGUMENT');
  assert.match(imp.message, /^Nada foi importado\. Corrija a planilha: linha 2: /);
});

test('Z0.7: a contratada e o técnico não abrem chamado; solicitante e gestão abrem', async () => {
  for (const perfil of ['tecnico', 'contratado']) {
    const r = await chamar('criarChamado', tokens[perfil], pedido);
    assert.equal(r.code, 'PERMISSION_DENIED', perfil);
  }
  const doGestor = await chamar('criarChamado', tokens.gestor, pedido);
  assert.equal(doGestor.ok, true, doGestor.message);
  const doCliente = await chamar('criarChamado', tokens.cliente, pedido);
  assert.equal(doCliente.ok, true, doCliente.message);
});

// Rodada 3: a contratada só vê os chamados dos próprios contratos. A criação
// da OS copia a empresa contratada para o chamado (é o campo da regra), só o
// gestor cria OS, e a contratada não cancela chamado de outra empresa.
test('Rodada 3: chamado leva a contratada da OS; contratada não cria OS nem cancela chamado de outra', async () => {
  await novoChamado('r1');
  const pelaContratada = await chamar('criarOS', tokens.contratado, { chamadoId: 'r1', contratoId: 'c1' });
  assert.equal(pelaContratada.code, 'PERMISSION_DENIED');
  assert.equal((await doc(emp, 'chamados', 'r1')).empresaContratadaId, undefined);

  const os = await chamar('criarOS', tokens.gestor, { chamadoId: 'r1', contratoId: 'c2' });
  assert.equal(os.ok, true, os.message);
  assert.equal((await doc(emp, 'chamados', 'r1')).empresaContratadaId, 'ec2');

  const cancelarDeOutra = await chamar('cancelarChamado', tokens.contratado, { chamadoId: 'r1' });
  assert.equal(cancelarDeOutra.code, 'PERMISSION_DENIED');

  const cancelar = await chamar('cancelarChamado', tokens.gestor, { chamadoId: 'r1' });
  assert.equal(cancelar.ok, true, cancelar.message);
  const reabrir = await chamar('reabrirChamado', tokens.gestor, { chamadoId: 'r1' });
  assert.equal(reabrir.ok, true, reabrir.message);
  const reaberto = await doc(emp, 'chamados', 'r1');
  assert.equal(reaberto.status, 'Aberto');
  assert.equal(reaberto.empresaContratadaId, undefined);
});
