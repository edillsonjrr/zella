// Z2.3 e Z2.4: o pedido da solicitante leva "onde fica", urgência e o
// equipamento do cadastro (todos opcionais), e quem abriu o chamado recebe
// aviso a cada etapa (OS criada, aprovado, serviço feito, encerrado ou
// cancelado). Roda contra o Emulator Suite.
import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import { Timestamp } from 'firebase-admin/firestore';
import { cenarioBasico, chamar, doc, db } from './helpers.mjs';

const EMP = 'teste-solicitante';
const AUTH_HOST = process.env.FIREBASE_AUTH_EMULATOR_HOST ?? '127.0.0.1:9099';
let emp, tokens;

const pedidoBase = { titulo: 'Ar', equipamento: 'Ar Split', descricao: 'não liga', unidadeId: 'u1', solicitanteNome: 'cliente', possuiFoto: false };

async function avisosPara(usuarioId, chamadoId) {
  const snap = await emp.collection('notificacoes').where('paraUsuarioId', '==', usuarioId).get();
  return snap.docs.map((d) => d.data()).filter((n) => n.alvo?.id === chamadoId);
}

before(async () => {
  ({ emp, tokens } = await cenarioBasico(EMP));
  await emp.collection('unidades').doc('u2').set({ id: 'u2', nome: 'Unidade 2', sigla: 'U2' });
  await emp.collection('salas').doc('s1').set({ id: 's1', unidadeId: 'u1', nome: 'Sala 1' });
  await emp.collection('equipamentos').doc('e1').set({ id: 'e1', unidadeId: 'u1', salaId: 's1', nome: 'Ar Split' });
  await emp.collection('equipamentos').doc('e2').set({ id: 'e2', unidadeId: 'u2', salaId: 's9', nome: 'Bebedouro' });
});

test('pedido com onde fica, urgência e equipamento do cadastro guarda os três', async () => {
  const r = await chamar('criarChamado', tokens.cliente, { ...pedidoBase, local: '  Bloco B, sala 12  ', urgencia: 'alta', equipamentoId: 'e1' });
  assert.equal(r.ok, true, r.message);
  assert.match(r.data.numero, /^CH-/);
  const ch = await doc(emp, 'chamados', r.data.id);
  assert.equal(ch.local, 'Bloco B, sala 12');
  assert.equal(ch.urgencia, 'alta');
  assert.equal(ch.equipamentoId, 'e1');
  const gestor = await emp.collection('notificacoes').where('alvo.id', '==', r.data.id).get();
  assert.equal(gestor.size, 1);
  assert.match(gestor.docs[0].data().texto, /Urgência: urgente/);
  assert.equal(gestor.docs[0].data().link, `/dashboard?chamado=${r.data.id}`);
});

test('pedido no formato antigo (sem os campos novos) continua funcionando', async () => {
  const r = await chamar('criarChamado', tokens.cliente, pedidoBase);
  assert.equal(r.ok, true, r.message);
  const ch = await doc(emp, 'chamados', r.data.id);
  assert.equal(ch.local, undefined);
  assert.equal(ch.urgencia, undefined);
  assert.equal(ch.equipamentoId, undefined);
});

test('campos novos inválidos são recusados', async () => {
  const urgencia = await chamar('criarChamado', tokens.cliente, { ...pedidoBase, urgencia: 'altissima' });
  assert.equal(urgencia.code, 'INVALID_ARGUMENT');
  const local = await chamar('criarChamado', tokens.cliente, { ...pedidoBase, local: 'x'.repeat(121) });
  assert.equal(local.code, 'INVALID_ARGUMENT');
  const localNumero = await chamar('criarChamado', tokens.cliente, { ...pedidoBase, local: 12 });
  assert.equal(localNumero.code, 'INVALID_ARGUMENT');
  const outraUnidade = await chamar('criarChamado', tokens.cliente, { ...pedidoBase, equipamentoId: 'e2' });
  assert.equal(outraUnidade.code, 'INVALID_ARGUMENT');
  const inexistente = await chamar('criarChamado', tokens.cliente, { ...pedidoBase, equipamentoId: 'nao-existe' });
  assert.equal(inexistente.code, 'INVALID_ARGUMENT');
});

test('QR colado no equipamento: o equipamento vem do token, não do corpo', async () => {
  const token = `qr-teste-${Date.now()}`;
  await db.collection('qrLinks').doc(token).set({
    empresaId: EMP, tipo: 'equipamento', id: 'e1', unidadeId: 'u1', unidadeNome: 'Unidade 1', nome: 'Ar Split',
    criadoEm: Timestamp.now(), expiraEm: Timestamp.fromMillis(Date.now() + 3 * 60 * 1000)
  });
  // Sessão anônima, como a de quem escaneia.
  const r = await fetch(`http://${AUTH_HOST}/identitytoolkit.googleapis.com/v1/accounts:signUp?key=fake`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ returnSecureToken: true })
  });
  const anonimo = (await r.json()).idToken;
  const criado = await chamar('criarChamado', anonimo, {
    titulo: 'Ar', equipamento: 'Ar Split', descricao: 'pinga', solicitanteNome: 'Visitante', possuiFoto: false,
    qrToken: token, equipamentoId: 'e2', urgencia: 'baixa'
  });
  assert.equal(criado.ok, true, criado.message);
  const ch = await doc(emp, 'chamados', criado.data.id);
  assert.equal(ch.equipamentoId, 'e1');
  assert.equal(ch.unidadeId, 'u1');
  assert.equal(ch.urgencia, 'baixa');
});

test('quem abriu é avisado em cada etapa: OS criada, aprovado, serviço feito e encerrado', async () => {
  const r = await chamar('criarChamado', tokens.cliente, { ...pedidoBase, local: 'Sala 1' });
  assert.equal(r.ok, true, r.message);
  const chamadoId = r.data.id;

  const os = await chamar('criarOS', tokens.gestor, { chamadoId, contratoId: 'c1' });
  assert.equal(os.ok, true, os.message);
  let avisos = await avisosPara('cl1', chamadoId);
  assert.equal(avisos.length, 1);
  assert.match(avisos[0].titulo, /encaminhado/);
  assert.equal(avisos[0].link, `/meus-pedidos?pedido=${chamadoId}`);
  assert.equal(avisos[0].alvo.tipo, 'chamado');

  // Enviar orçamento não é etapa para quem pediu: nenhum aviso novo.
  const orc = await chamar('criarOrcamento', tokens.tecnico, { osId: os.data.id, itens: [{ itemContratoId: 'i1', quantidade: 2 }] });
  assert.equal(orc.ok, true, orc.message);
  assert.equal((await avisosPara('cl1', chamadoId)).length, 1);

  const ap = await chamar('aprovarOrcamento', tokens.gestor, { orcamentoId: orc.data.id });
  assert.equal(ap.ok, true, ap.message);
  const ex = await chamar('executarOS', tokens.tecnico, { osId: os.data.id, observacao: 'trocado' });
  assert.equal(ex.ok, true, ex.message);
  const enc = await chamar('encerrarChamado', tokens.gestor, { chamadoId });
  assert.equal(enc.ok, true, enc.message);

  avisos = await avisosPara('cl1', chamadoId);
  const titulos = avisos.map((a) => a.titulo).sort();
  assert.equal(avisos.length, 4, titulos.join(' | '));
  assert.ok(titulos.some((t) => /aprovado/.test(t)));
  assert.ok(titulos.some((t) => /Serviço feito/.test(t)));
  assert.ok(titulos.some((t) => /concluído/.test(t)));
});

test('cancelar avisa quem abriu; quem faz a ação não avisa a si mesmo', async () => {
  const doCliente = await chamar('criarChamado', tokens.cliente, pedidoBase);
  const c1 = await chamar('cancelarChamado', tokens.gestor, { chamadoId: doCliente.data.id, motivo: 'duplicado' });
  assert.equal(c1.ok, true, c1.message);
  const avisos = await avisosPara('cl1', doCliente.data.id);
  assert.equal(avisos.length, 1);
  assert.match(avisos[0].texto, /duplicado/);

  const doGestor = await chamar('criarChamado', tokens.gestor, { ...pedidoBase, solicitanteNome: 'gestor' });
  assert.equal(doGestor.ok, true, doGestor.message);
  const c2 = await chamar('cancelarChamado', tokens.gestor, { chamadoId: doGestor.data.id });
  assert.equal(c2.ok, true, c2.message);
  assert.equal((await avisosPara('g1', doGestor.data.id)).length, 0);
});
