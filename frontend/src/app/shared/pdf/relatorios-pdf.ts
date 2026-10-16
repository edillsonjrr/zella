import { COR, DocumentoPdf, dataBr, hojeBr, nomeDeArquivo, num, reais, type Celula } from './documento-pdf';
import { LEGENDA_SALDO, rotuloPatrimonio } from '../rotulos';
import type { HistoricoEquipamento, RelatorioMensal } from '../relatorios';
import type { LinhaServico } from '../servico-os';

/**
 * Desenho em PDF do relatório do mês e do histórico do equipamento (Z3.2).
 * Os números vêm prontos de shared/relatorios.ts.
 */

export interface Autoria {
  empresa?: string;
  pessoa?: string;
}

function linhaInfo(autoria: Autoria): string {
  return [autoria.empresa, `Gerado em ${hojeBr()}${autoria.pessoa ? ` por ${autoria.pessoa}` : ''}`].filter(Boolean).join(' · ');
}

const FORA: Celula = { texto: '', cor: COR.alerta };

/** "7 un Lâmpada LED" ou "1 un Troca do compressor (fora do contrato)". */
function textoLinha(l: LinhaServico): string {
  const qtd = `${num(l.usado)}${l.unidade ? ` ${l.unidade}` : ''}`;
  const de = l.usado !== l.aprovado ? ` (de ${num(l.aprovado)} aprovados)` : '';
  return `${qtd} ${l.nome}${de}${l.foraDoContrato ? ' [fora do contrato]' : ''}`;
}

export async function gerarRelatorioMensalPdf(r: RelatorioMensal, autoria: Autoria): Promise<{ blob: Blob; nome: string }> {
  const titulo = `Relatório de manutenção de ${r.periodo.rotulo}`;
  const pdf = await DocumentoPdf.criar({
    titulo,
    subtitulo: r.contrato ? `Contrato ${r.contrato.numero} · ${r.contrato.fornecedor}` : 'Todos os contratos',
    linhaInfo: linhaInfo(autoria),
    rodape: `Zella · ${titulo}`
  });

  /* Resumo */
  const resumo = [
    `Serviços feitos no mês: ${r.servicos.length}. Custo: ${reais(r.custo.total)}` +
      (r.custo.foraContrato ? ` (${reais(r.custo.contrato)} do contrato + ${reais(r.custo.foraContrato)} fora do contrato).` : '.'),
    `Preventivas previstas no mês: ${r.preventivas.length}; feitas: ${r.preventivasFeitas}.`,
    `Chamados abertos no mês: ${r.chamadosAbertosNoMes}. Em aberto em ${dataBr(r.dataCorte)}: ${r.emAberto.length}, ${r.emAtraso} em atraso.`
  ];
  pdf.caixa(resumo, { tamanho: 9.5 });
  for (const obs of r.observacoes) pdf.paragrafo(obs, { tamanho: 8, cor: COR.suave });

  /* 1. Saldo dos contratos */
  pdf.secao(
    r.posicaoDeHoje ? `1. Saldo dos contratos hoje, ${dataBr(r.dataCorte)}` : `1. Saldo dos contratos em ${dataBr(r.dataCorte)}`,
    (r.posicaoDeHoje ? 'O mês ainda não acabou: vale a posição de hoje. ' : 'Posição no último dia do mês, refeita a partir das OS, orçamentos e aditivos registrados. ') +
      `Contratado = Usado + Separado + Livre. ${LEGENDA_SALDO}.`
  );
  if (!r.saldos.length) pdf.paragrafo('Nenhum contrato vigente no mês.', { cor: COR.suave });
  for (const s of r.saldos) {
    pdf.subtitulo(`Contrato ${s.numero} · ${s.fornecedor}${s.encerrado ? ' · encerrado' : ''}`);
    if (s.vigencia) pdf.paragrafo(`Vigência: ${s.vigencia}`, { tamanho: 8, cor: COR.suave });
    pdf.tabela({
      colunas: [
        { titulo: 'Item', largura: 0.3 },
        { titulo: 'A conta (quantidade)', largura: 0.52 },
        { titulo: 'Livre em R$', largura: 0.18, alinhar: 'right' }
      ],
      linhas: s.itens.map(i => [i.nome, i.conta, reais(i.livre * i.preco)]),
      vazio: 'Contrato sem itens.'
    });
    const v = s.valores;
    pdf.paragrafo(
      `Em reais: Contratado ${reais(v.contratado)} = Usado ${reais(v.usado)} + Separado ${reais(v.separado)} + Livre ${reais(v.livre)}`,
      { tamanho: 9, negrito: true }
    );
    pdf.espaco(2);
  }

  /* 2. Serviços feitos */
  pdf.secao('2. Serviços feitos no mês', 'OS com o serviço registrado no mês (executadas ou já encerradas). Custo = quantidade usada × preço do orçamento aprovado.');
  pdf.tabela({
    colunas: [
      { titulo: 'OS e data', largura: 0.14 },
      { titulo: 'Equipamento e local', largura: 0.25 },
      { titulo: 'Técnico', largura: 0.14 },
      { titulo: 'O que foi usado', largura: 0.32 },
      { titulo: 'Custo', largura: 0.15, alinhar: 'right' }
    ],
    linhas: r.servicos.map(s => [
      `${s.osNumero}\n${dataBr(s.data)}${s.preventiva ? '\nPreventiva' : ''}`,
      [s.equipamento, s.local].filter(Boolean).join('\n'),
      s.tecnico,
      s.linhas.filter(l => l.usado > 0).map(textoLinha).join('\n') || 'Nenhum item registrado',
      { texto: `${reais(s.custo.total)}${s.custo.foraContrato ? `\ninclui ${reais(s.custo.foraContrato)} fora do contrato` : ''}`, negrito: true }
    ]),
    vazio: 'Nenhum serviço registrado no mês.'
  });
  if (r.servicos.length) {
    pdf.paragrafo(`Total do mês: ${reais(r.custo.total)}`, { negrito: true });
  }

  if (r.foraContrato.length) {
    pdf.subtitulo('Itens fora do contrato usados no mês');
    pdf.paragrafo('Aprovados à parte pela gestão. Não saem do saldo de nenhum item do contrato.', { tamanho: 8, cor: COR.suave });
    pdf.tabela({
      colunas: [
        { titulo: 'OS', largura: 0.16 },
        { titulo: 'Descrição', largura: 0.38 },
        { titulo: 'Usado', largura: 0.14, alinhar: 'right' },
        { titulo: 'Preço unit.', largura: 0.15, alinhar: 'right' },
        { titulo: 'Total', largura: 0.17, alinhar: 'right' }
      ],
      linhas: r.foraContrato.map(f => [`${f.osNumero}\n${dataBr(f.data)}`, f.descricao, `${num(f.usado)} ${f.unidade}`, reais(f.preco), { ...FORA, texto: reais(f.total), negrito: true }]),
      fundo: () => COR.alertaClara
    });
    pdf.paragrafo(`Total fora do contrato: ${reais(r.custo.foraContrato)}`, { negrito: true });
  }

  /* 3. Preventivas */
  pdf.secao('3. Manutenção preventiva', `Previstas para o mês: ${r.preventivas.length}. Feitas: ${r.preventivasFeitas}.`);
  pdf.tabela({
    colunas: [
      { titulo: 'Data prevista', largura: 0.15 },
      { titulo: 'Plano', largura: 0.3 },
      { titulo: 'Equipamento', largura: 0.3 },
      { titulo: 'Situação', largura: 0.25 }
    ],
    linhas: r.preventivas.map(p => [
      dataBr(p.dataPrevista),
      p.plano,
      p.equipamento,
      { texto: p.situacao, negrito: p.feita, cor: p.feita ? COR.marca : p.situacao.startsWith('Atrasada') ? COR.perigo : COR.texto }
    ]),
    vazio: 'Nenhuma preventiva prevista no mês.'
  });

  /* 4. Chamados */
  pdf.secao(
    `4. Chamados em aberto em ${dataBr(r.dataCorte)}`,
    `Abertos no mês: ${r.chamadosAbertosNoMes}. Em aberto nessa data: ${r.emAberto.length}, ${r.emAtraso} em atraso (prazo vencido sem o serviço feito).`
  );
  pdf.tabela({
    colunas: [
      { titulo: 'Chamado', largura: 0.14 },
      { titulo: 'Pedido e equipamento', largura: 0.34 },
      { titulo: 'Aberto em', largura: 0.12 },
      { titulo: 'Prazo', largura: 0.14 },
      { titulo: 'Situação hoje', largura: 0.26 }
    ],
    linhas: r.emAberto.map(c => [
      c.numero,
      [c.titulo, c.equipamento, c.local].filter(Boolean).join('\n'),
      dataBr(c.abertoEm),
      c.prazo ? { texto: `${dataBr(c.prazo)}${c.emAtraso ? '\nem atraso' : ''}`, negrito: c.emAtraso, cor: c.emAtraso ? COR.perigo : COR.texto } : 'Sem prazo',
      c.situacaoHoje
    ]),
    vazio: 'Nenhum chamado em aberto nessa data.'
  });

  pdf.finalizar();
  const nome = `relatorio-manutencao-${r.periodo.ano}-${String(r.periodo.mes).padStart(2, '0')}${r.contrato ? '-' + nomeDeArquivo(r.contrato.numero) : ''}.pdf`;
  return { blob: pdf.blob(), nome };
}

export async function gerarHistoricoEquipamentoPdf(h: HistoricoEquipamento, autoria: Autoria): Promise<{ blob: Blob; nome: string }> {
  const e = h.equipamento;
  const pdf = await DocumentoPdf.criar({
    titulo: `Histórico de manutenção: ${e.nome}`,
    subtitulo: h.local,
    linhaInfo: linhaInfo(autoria),
    rodape: `Zella · Histórico de manutenção de ${e.nome}`
  });

  pdf.dados([
    ['Equipamento', e.nome],
    // "Patrimônio nº 0021" já diz o que é; no rótulo ao lado sai só "nº 0021".
    ['Patrimônio', rotuloPatrimonio(e.patrimonio).replace(/^Patrimônios*/, '')],
    ['Fabricante', e.fabricante],
    ['Modelo', e.modelo],
    ['Onde fica', h.local]
  ]);

  const t = h.totais;
  pdf.caixa([
    `Chamados: ${t.chamados} (${t.corretivas} ${t.corretivas === 1 ? 'corretivo' : 'corretivos'}, ${t.preventivas} de preventiva). Com serviço feito: ${t.feitos}.`,
    `Custo total registrado: ${reais(t.custo.total)}${t.custo.foraContrato ? ` (${reais(t.custo.contrato)} do contrato + ${reais(t.custo.foraContrato)} fora do contrato)` : ''}.`
  ]);

  pdf.secao('Planos de manutenção preventiva');
  pdf.tabela({
    colunas: [
      { titulo: 'Plano', largura: 0.34 },
      { titulo: 'Periodicidade', largura: 0.2 },
      { titulo: 'Última', largura: 0.15 },
      { titulo: 'Próxima', largura: 0.15 },
      { titulo: 'Situação', largura: 0.16 }
    ],
    linhas: h.planos.map(p => [p.nome, p.periodicidade, dataBr(p.ultima) || '—', dataBr(p.proxima), p.ativo ? 'Ativo' : 'Pausado']),
    vazio: 'Nenhum plano preventivo para este equipamento.'
  });

  pdf.secao('Tudo o que já foi feito', 'Do mais recente para o mais antigo. Preventivas e corretivas.');
  if (!h.servicos.length) pdf.paragrafo('Nenhum chamado registrado para este equipamento.', { cor: COR.suave });
  for (const s of h.servicos) {
    pdf.garantirEspaco(30);
    pdf.subtitulo(`${dataBr(s.abertoEm)} · ${s.chamadoNumero} · ${s.tipo}${s.plano ? ` (${s.plano})` : ''}`);
    pdf.dados([
      ['Pedido', s.titulo],
      ['Descrição', s.descricao !== s.titulo ? s.descricao : ''],
      ['Situação', s.situacao],
      ['OS', s.ordens],
      ['Contrato', s.contrato],
      ['Feito em', dataBr(s.feitoEm)],
      ['Técnico', s.tecnico],
      ['Observação', s.observacao]
    ], 8.5);
    const usadas = s.linhas.filter(l => l.usado > 0);
    if (usadas.length) {
      pdf.tabela({
        colunas: [
          { titulo: 'O que foi usado', largura: 0.5 },
          { titulo: 'Quantidade', largura: 0.16, alinhar: 'right' },
          { titulo: 'Preço unit.', largura: 0.16, alinhar: 'right' },
          { titulo: 'Total', largura: 0.18, alinhar: 'right' }
        ],
        linhas: usadas.map(l => [
          l.foraDoContrato ? `${l.nome} [fora do contrato]` : l.nome,
          `${num(l.usado)}${l.unidade ? ` ${l.unidade}` : ''}`,
          reais(l.precoUnitario),
          reais(l.usado * l.precoUnitario)
        ]),
        fundo: i => (usadas[i].foraDoContrato ? COR.alertaClara : undefined),
        tamanho: 7.5
      });
      pdf.paragrafo(
        `Custo: ${reais(s.custo.total)}${s.custo.foraContrato ? ` (inclui ${reais(s.custo.foraContrato)} fora do contrato)` : ''}`,
        { tamanho: 8.5, negrito: true }
      );
    }
    pdf.espaco(2);
  }

  pdf.finalizar();
  return { blob: pdf.blob(), nome: `historico-${nomeDeArquivo(e.nome)}${e.patrimonio ? '-' + nomeDeArquivo(e.patrimonio) : ''}.pdf` };
}
