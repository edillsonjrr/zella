// Z0.3 e Z0.6, sem emulador: a máquina de situações (shared/situacao.ts) e
// os textos do histórico (shared/historico.ts) que a tela mostra. Roda junto
// dos outros em `npm test`, que compila antes (pretest).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { descreverDetalhes, limparTexto, rotuloOS, plural, dataBr, montarLinhaDoTempo } = require('../lib/shared/historico.js');
const { situacaoDoServico, EXPLICACAO_FIM } = require('../lib/shared/situacao.js');

test('Z0.3: chamado e OS no mesmo vocabulário, e cada situação diz quem age', () => {
  const casos = [
    [{ chamado: { status: 'Aberto' } }, 'novo', 'gestao'],
    [{ chamado: { status: 'Em atendimento' }, os: { situacao: 'Aberta' } }, 'aguardando-orcamento', 'contratada'],
    // "Em vistoria" sem orçamento pendente: falta o orçamento.
    [{ chamado: { status: 'Em orçamento' }, os: { situacao: 'Em vistoria' }, orcamento: { situacao: 'Substituído' } }, 'aguardando-orcamento', 'contratada'],
    [{ os: { situacao: 'Em vistoria' } }, 'aguardando-orcamento', 'contratada'],
    // "Em vistoria" com orçamento pendente: a gestão decide.
    [{ chamado: { status: 'Em orçamento' }, os: { situacao: 'Em vistoria' }, orcamento: { situacao: 'Pendente' } }, 'aguardando-aprovacao', 'gestao'],
    // Sem acesso ao orçamento, a OS que aponta um em "Em vistoria" está pendente.
    [{ os: { situacao: 'Em vistoria', orcamentoId: 'o1' } }, 'aguardando-aprovacao', 'gestao'],
    [{ chamado: { status: 'Em atendimento' }, os: { situacao: 'Rejeitada' }, orcamento: { situacao: 'Rejeitado' } }, 'orcamento-recusado', 'contratada'],
    // "Orçamento aprovado" e "A ser finalizado" são a mesma etapa.
    [{ chamado: { status: 'Orçamento aprovado' } }, 'aprovado', 'tecnico'],
    [{ chamado: { status: 'A ser finalizado' }, os: { situacao: 'Aprovada' } }, 'aprovado', 'tecnico'],
    [{ chamado: { status: 'Executado' }, os: { situacao: 'Executada' } }, 'servico-feito', 'gestao'],
    [{ chamado: { status: 'Encerrado' }, os: { situacao: 'Encerrada' } }, 'encerrado', 'ninguem'],
    [{ chamado: { status: 'Cancelado' }, os: { situacao: 'Cancelada' } }, 'cancelado', 'ninguem']
  ];
  for (const [entrada, chave, quem] of casos) {
    const s = situacaoDoServico(entrada);
    assert.equal(s.chave, chave, JSON.stringify(entrada));
    assert.equal(s.quemAge, quem, JSON.stringify(entrada));
    assert.match(s.agora, /^(Agora|Encerrado|Cancelado): /);
  }
  assert.equal(situacaoDoServico({ chamado: { status: 'Orçamento aprovado' } }).rotulo, situacaoDoServico({ chamado: { status: 'A ser finalizado' } }).rotulo);
});

test('Z0.3: quem age lê o texto falando com ela', () => {
  const pendente = { os: { situacao: 'Em vistoria' }, orcamento: { situacao: 'Pendente' } };
  assert.equal(situacaoDoServico(pendente).rotulo, 'Aguardando aprovação da gestão');
  assert.equal(situacaoDoServico({ ...pendente, perfil: 'gestor' }).rotulo, 'Aguardando sua aprovação');
  assert.equal(situacaoDoServico({ ...pendente, perfil: 'tecnico' }).rotulo, 'Aguardando aprovação da gestão');
  assert.match(situacaoDoServico({ os: { situacao: 'Aprovada' }, perfil: 'tecnico' }).agora, /você faz o serviço/);
  // Executado x Encerrado: a diferença numa frase.
  assert.match(EXPLICACAO_FIM, /Serviço feito: .*falta a gestão conferir\. Encerrado: a gestão conferiu/);
});

test('Z0.6: "OS OS-..." some, com e sem prefixo gravado', () => {
  assert.equal(rotuloOS('OS-2026-0096'), 'OS-2026-0096');
  assert.equal(rotuloOS('0096'), 'OS 0096');
  assert.equal(limparTexto('Orçamento pendente na OS OS-2026-0096'), 'Orçamento pendente na OS-2026-0096');
  assert.equal(limparTexto('OS OS-2026-0096 designada a você'), 'OS-2026-0096 designada a você');
  assert.equal(limparTexto('Chamado CH-2026-0102 aberto'), 'Chamado CH-2026-0102 aberto');
  assert.equal(plural(1, 'item', 'itens'), '1 item');
  assert.equal(plural(3, 'item', 'itens'), '3 itens');
});

test('Z0.6: detalhes do Histórico de ações em português, sem campo cru nem data ISO', () => {
  const plano = descreverDetalhes({ equipamento: 'Ar Split', periodicidadeDias: 30, proximaExecucao: '2026-10-20', ativo: true });
  assert.deepEqual(plano, ['Equipamento: Ar Split', 'Repete a cada: 30 dias', 'Próxima execução: 20/10/2026', 'Ativo: sim']);

  const preventiva = descreverDetalhes({ plano: 'Filtro', vencimento: '2026-10-13', proximaExecucao: '2026-11-12' });
  assert.deepEqual(preventiva, ['Plano: Filtro', 'Vencimento: 13/10/2026', 'Próxima execução: 12/11/2026']);

  const nomes = (campo, id) => ({ t1: 'Eduardo Nunes', u1: 'Senai Santa Maria' })[id];
  const tecnico = descreverDetalhes({ tecnico: { de: null, para: 't1' } }, nomes);
  assert.deepEqual(tecnico, ['Técnico: nenhum → Eduardo Nunes']);
  // Id sem nome conhecido não aparece.
  assert.deepEqual(descreverDetalhes({ contratoId: 'abc123', osAnterior: 'xyz' }, nomes), []);

  const orcamento = descreverDetalhes({ os: 'OS-2026-0096', itens: 2, total: 220, substituiu: null });
  // O Intl separa "R$" do valor com espaço sem quebra.
  assert.deepEqual(orcamento.map((l) => l.replace(/\s/g, ' ')), ['OS: OS-2026-0096', 'Itens: 2', 'Total: R$ 220,00']);

  const chamado = descreverDetalhes({ status: { de: 'Executado', para: 'Encerrado' }, urgencia: 'alta', slaDias: 1 });
  assert.deepEqual(chamado, ['Situação: Executado → Encerrado', 'Urgência: Urgente', 'Prazo: 1 dia']);

  const execucao = descreverDetalhes({ itens: [{ itemContratoId: 'i1', nome: 'Filtro de ar', orcado: 3, executado: 2 }], devolvidoAoContrato: 1 });
  assert.deepEqual(execucao, ['Itens: Filtro de ar: feito 2 de 3', 'Voltou ao saldo livre: 1']);

  const usuario = descreverDetalhes({ perfilAnterior: 'cliente', perfilNovo: 'gestor_contratado' });
  assert.deepEqual(usuario, ['Perfil anterior: Solicitante', 'Perfil novo: Responsável da contratada']);

  // Campo novo sem rótulo: vira palavras, nunca camelCase.
  assert.deepEqual(descreverDetalhes({ campoNovoQualquer: 'x' }), ['Campo novo qualquer: x']);

  for (const linha of [...plano, ...preventiva, ...tecnico, ...orcamento, ...chamado, ...execucao, ...usuario]) {
    assert.doesNotMatch(linha, /\b[a-z]+[A-Z][a-zA-Z]*\b/, linha);
    assert.doesNotMatch(linha, /\d{4}-\d{2}-\d{2}/, linha);
  }
  assert.match(dataBr('2026-10-13T14:05:00.000Z'), /^13\/10\/2026 às \d{2}:\d{2}$/);
});

test('Z0.2: linha do tempo com recusa e reabertura, na ordem do fluxo', () => {
  const chamado = { id: 'ch', numero: 'CH-1', equipamento: 'Ar', solicitanteNome: 'Ana', status: 'Em orçamento', dataCriacao: '2026-10-01', ordemServicoId: 'os' };
  const ordens = [{ id: 'os', numero: 'OS-1', chamadoId: 'ch', contratoId: 'c', situacao: 'Em vistoria', orcamentoId: 'o2', dataCriacao: '2026-10-01' }];
  const orcamentos = [
    { id: 'o1', osId: 'os', situacao: 'Rejeitado', itens: [{ itemContratoId: 'i', nome: 'I', quantidade: 1, precoUnitario: 1 }], dataCriacao: '2026-10-02' },
    { id: 'o2', osId: 'os', situacao: 'Pendente', itens: [], itensForaContrato: [{ id: 'f' }, { id: 'g' }], dataCriacao: '2026-10-03' }
  ];
  const linha = montarLinhaDoTempo({ chamado, ordens, orcamentos });
  assert.deepEqual(linha.map((e) => e.tipo), ['aberto', 'os', 'orcamento', 'recusado', 'orcamento']);
  // A recusa não guarda data no orçamento: aparece sem data, logo depois dele.
  assert.equal(linha[3].quandoTexto, '');
  assert.equal(linha[4].detalhe, '2 itens fora do contrato');

  const logs = [
    { id: 'l1', acao: 'orcamento.transicao', alvo: 'orcamento', operacao: 'transicao', descricao: 'Recusou', data: '2026-10-02T15:00:00.000Z',
      usuarioUid: 'u', usuarioNome: 'Carla', usuarioEmail: '', alvoId: 'o1', alvoRotulo: 'OS-1', alvoPaiId: 'os', origem: 'backend',
      detalhes: { situacao: { de: 'Pendente', para: 'Rejeitado' } } },
    { id: 'l2', acao: 'ordemServico.editar', alvo: 'ordemServico', operacao: 'editar', descricao: 'Designou a OS OS-1 a Eduardo', data: '2026-10-01T18:00:00.000Z',
      usuarioUid: 'u', usuarioNome: 'Carla', usuarioEmail: '', alvoId: 'os', alvoRotulo: 'OS-1', alvoPaiId: 'os', origem: 'backend', detalhes: null }
  ];
  const comLog = montarLinhaDoTempo({ chamado, ordens, orcamentos, logs });
  assert.deepEqual(comLog.map((e) => e.tipo), ['aberto', 'os', 'outro', 'orcamento', 'recusado', 'orcamento']);
  assert.equal(comLog[2].detalhe, 'Designou a OS-1 a Eduardo');
  assert.equal(comLog[4].autor, 'Carla');
  assert.match(comLog[4].quandoTexto, /^02\/10\/2026 às/);
});
