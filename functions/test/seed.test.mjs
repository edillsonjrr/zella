// Coerência dos dados de demonstração (functions/src/seedDados.ts). Não usa
// emulador: monta os dados em memória e confere as contas. Roda junto dos
// outros em `npm test`, que compila antes (pretest).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { montarDadosSeed } = require('../lib/functions/src/seedDados.js');

const HOJE = '2026-10-13';
const dados = montarDadosSeed(HOJE);
const itens = dados.contratos.flatMap((c) => c.itens.map((i) => ({ ...i, contratoId: c.id })));
const orcamentoPorId = new Map(dados.orcamentos.map((o) => [o.id, o]));

test('todo item fecha: contratada = disponível + reservada + consumida, sem negativos', () => {
  assert.ok(itens.length > 0);
  for (const i of itens) {
    assert.equal(
      i.quantidadeContratada,
      i.quantidadeDisponivel + i.quantidadeReservada + i.quantidadeConsumida,
      `${i.nome}: ${i.quantidadeContratada} ≠ ${i.quantidadeDisponivel} + ${i.quantidadeReservada} + ${i.quantidadeConsumida}`
    );
    for (const campo of ['quantidadeDisponivel', 'quantidadeReservada', 'quantidadeConsumida']) {
      assert.ok(i[campo] >= 0, `${i.nome}: ${campo} negativo`);
    }
  }
});

test('separado de cada item = soma dos orçamentos aprovados das OS "Aprovada"', () => {
  const esperado = new Map();
  for (const os of dados.ordensServico) {
    if (os.situacao !== 'Aprovada') continue;
    const orc = orcamentoPorId.get(os.orcamentoId);
    assert.equal(orc?.situacao, 'Aprovado', `${os.numero} está Aprovada sem orçamento aprovado`);
    for (const l of orc.itens) esperado.set(l.itemContratoId, (esperado.get(l.itemContratoId) ?? 0) + l.quantidade);
  }
  for (const i of itens) assert.equal(i.quantidadeReservada, esperado.get(i.id) ?? 0, i.nome);
});

test('usado de cada item = soma do executado das OS "Executada" e "Encerrada"', () => {
  const esperado = new Map();
  for (const os of dados.ordensServico) {
    if (os.situacao !== 'Executada' && os.situacao !== 'Encerrada') continue;
    assert.ok(os.itensExecutados?.length, `${os.numero} executada sem itens executados`);
    assert.ok(os.dataExecucao, `${os.numero} executada sem data`);
    for (const e of os.itensExecutados) {
      assert.ok(e.executado <= e.orcado, `${os.numero}: executado acima do orçado`);
      esperado.set(e.itemContratoId, (esperado.get(e.itemContratoId) ?? 0) + e.executado);
    }
  }
  for (const i of itens) assert.equal(i.quantidadeConsumida, esperado.get(i.id) ?? 0, i.nome);
});

test('orçamentos usam itens e preços do contrato da OS', () => {
  const osPorId = new Map(dados.ordensServico.map((o) => [o.id, o]));
  for (const orc of dados.orcamentos) {
    const os = osPorId.get(orc.osId);
    assert.ok(os, `orçamento ${orc.id} sem OS`);
    assert.equal(orc.empresaContratadaId, os.empresaContratadaId);
    for (const l of orc.itens) {
      const item = itens.find((i) => i.id === l.itemContratoId);
      assert.equal(item?.contratoId, os.contratoId, `${orc.id}: item de outro contrato`);
      assert.equal(l.precoUnitario, item.precoUnitario);
      assert.equal(l.nome, item.nome);
    }
  }
});

test('chamado e OS apontam um para o outro; situação da OS combina com o status do chamado', () => {
  const chamadoPorId = new Map(dados.chamados.map((c) => [c.id, c]));
  const situacaoEsperada = {
    'Em atendimento': ['Aberta'],
    'Em orçamento': ['Em vistoria'],
    'Orçamento aprovado': ['Aprovada'],
    'A ser finalizado': ['Aprovada'],
    Executado: ['Executada'],
    Encerrado: ['Encerrada']
  };
  for (const os of dados.ordensServico) {
    const chamado = chamadoPorId.get(os.chamadoId);
    assert.ok(chamado, `${os.numero} sem chamado`);
    assert.equal(chamado.ordemServicoId, os.id);
    assert.equal(chamado.unidadeId, os.unidadeId);
    assert.ok(situacaoEsperada[chamado.status]?.includes(os.situacao), `${chamado.numero} ${chamado.status} × ${os.numero} ${os.situacao}`);
    if (os.situacao === 'Em vistoria') assert.equal(orcamentoPorId.get(os.orcamentoId)?.situacao, 'Pendente');
  }
  for (const c of dados.chamados) {
    if (c.status === 'Aberto') assert.equal(c.ordemServicoId, undefined, c.numero);
    if (c.status === 'Encerrado') assert.ok(c.dataFechamento, c.numero);
    if (c.status === 'Executado') assert.equal(c.dataFechamento, undefined, c.numero);
  }
});

test('técnico da OS é da contratada da OS; solicitante cliente abre na própria unidade', () => {
  const usuarioPorId = new Map(dados.usuarios.map((u) => [u.id, u]));
  for (const os of dados.ordensServico) {
    if (!os.tecnicoId) continue;
    const tecnico = usuarioPorId.get(os.tecnicoId);
    assert.equal(tecnico?.perfil, 'tecnico');
    assert.equal(tecnico.empresaContratadaId, os.empresaContratadaId, os.numero);
  }
  for (const c of dados.chamados) {
    const s = usuarioPorId.get(c.solicitanteId);
    assert.ok(s, `${c.numero}: solicitante sem cadastro`);
    if (s.perfil === 'cliente') assert.equal(s.unidadeId, c.unidadeId, c.numero);
  }
});

test('equipamento escolhido do cadastro é da unidade do chamado; contadores não repetem número', () => {
  const equipamentoPorId = new Map(dados.equipamentos.map((e) => [e.id, e]));
  for (const c of dados.chamados) {
    if (c.equipamentoId) assert.equal(equipamentoPorId.get(c.equipamentoId)?.unidadeId, c.unidadeId, c.numero);
  }
  const ch = dados.contadores.find((c) => c.id === 'CH-2026').valor;
  const os = dados.contadores.find((c) => c.id === 'OS-2026').valor;
  const numero = (n) => Number(n.split('-').pop());
  const numerosCH = dados.chamados.map((c) => numero(c.numero));
  const numerosOS = dados.ordensServico.map((o) => numero(o.numero));
  assert.equal(new Set(numerosCH).size, numerosCH.length, 'número de chamado repetido');
  assert.equal(new Set(numerosOS).size, numerosOS.length, 'número de OS repetido');
  assert.ok(Math.max(...numerosCH) <= ch);
  assert.ok(Math.max(...numerosOS) <= os);
});

test('números seguem a ordem de abertura: o mais antigo tem o menor número', () => {
  for (const lista of [dados.chamados, dados.ordensServico]) {
    const ordenada = [...lista].sort((a, b) => a.numero.localeCompare(b.numero));
    for (let i = 1; i < ordenada.length; i++) {
      assert.ok(ordenada[i - 1].dataCriacao <= ordenada[i].dataCriacao, `${ordenada[i - 1].numero} é posterior a ${ordenada[i].numero}`);
    }
  }
});

test('cada conserto vai para o contrato que cobre aquele equipamento', () => {
  const chamadoPorId = new Map(dados.chamados.map((c) => [c.id, c]));
  const cobre = { c1: /Ar Split|ar-condicionado/i, c2: /Lumin|Lâmpada|Reator|Refletor|Luzes/i, c3: /Bebedouro|Bomba|Torneira|Tubula|Vazamento/i };
  for (const os of dados.ordensServico) {
    const chamado = chamadoPorId.get(os.chamadoId);
    assert.match(`${chamado.equipamento} ${chamado.titulo}`, cobre[os.contratoId], `${chamado.numero} (${chamado.equipamento}) no contrato ${os.contratoId}`);
  }
});

test('Z0.3: na demonstração, chamado e OS caem na mesma situação, e nenhuma OS aprovada fica sem orçamento', () => {
  const { situacaoDoServico } = require('../lib/shared/situacao.js');
  const chamadoPorId = new Map(dados.chamados.map((c) => [c.id, c]));
  for (const os of dados.ordensServico) {
    const chamado = chamadoPorId.get(os.chamadoId);
    const orcamento = orcamentoPorId.get(os.orcamentoId);
    const peloChamado = situacaoDoServico({ chamado });
    const pelaOS = situacaoDoServico({ os, orcamento });
    assert.equal(peloChamado.chave, pelaOS.chave, `${chamado.numero} (${chamado.status}) × ${os.numero} (${os.situacao})`);
    if (os.situacao === 'Aprovada') assert.equal(orcamento?.situacao, 'Aprovado', `${os.numero} aprovada sem orçamento`);
  }
});
