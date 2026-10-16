import { dataCsv, montarCsv, numeroCsv } from './csv';
import { contaSaldo } from './saldo';
import { custoDoServico, linhasDoServico, servicoFeito } from './servico-os';
import { nomeTecnico, rotuloStatusChamado, type FonteRelatorio } from './relatorios';
import { nomeUnidade, rotuloUrgencia } from './rotulos';
import type { AditivoContrato, Bloco, EmpresaContratada, Orcamento, Sala, Unidade, Usuario } from './models';

/**
 * Exportação completa (Z3.3): um .zip com uma planilha CSV por coleção,
 * legível sem o Zella. Datas em dd/mm/aaaa, números com vírgula e nomes no
 * lugar dos ids (unidade, sala, contrato, técnico...).
 *
 * A planilha de equipamentos sai nas mesmas colunas do modelo de
 * importação: dá para levar o cadastro de volta.
 *
 * O .zip é montado no navegador com o fflate, carregado só aqui.
 */

export interface FonteExportacao extends FonteRelatorio {
  unidades(): Unidade[];
  blocos(): Bloco[];
  salas(): Sala[];
  usuarios(): Usuario[];
  empresasContratadas(): EmpresaContratada[];
  orcamentos(): Orcamento[];
  lerAditivos(contratoId: string): Promise<AditivoContrato[]>;
}

export interface ArquivoExportado {
  nome: string;
  linhas: number;
  conteudo: string;
}

export async function montarArquivosExportacao(ds: FonteExportacao, empresaNome = ''): Promise<ArquivoExportado[]> {
  const unidade = (id: string | undefined) => nomeUnidade(id ? ds.getUnidadeById(id) : undefined, '');
  const bloco = (id: string | undefined) => (id ? ds.getBlocoById(id)?.nome ?? '' : '');
  const sala = (id: string | undefined) => (id ? ds.getSalaById(id)?.nome ?? '' : '');
  const pessoa = (id: string | undefined) => (id ? ds.getUsuarioById(id)?.nome ?? '' : '');
  const contratada = (id: string | undefined) => ds.getEmpresaContratadaById(id)?.nome ?? '';
  const contrato = (id: string | undefined) => (id ? ds.getContratoById(id)?.numero ?? '' : '');
  const equipamento = (id: string | undefined) => (id ? ds.getEquipamentoById(id) : undefined);
  const porNome = <T>(lista: T[], chave: (t: T) => string) => [...lista].sort((a, b) => chave(a).localeCompare(chave(b), 'pt-BR'));
  const chamadoPorId = new Map(ds.chamados().map(c => [c.id, c]));
  const osPorId = new Map(ds.ordensServico().map(o => [o.id, o]));

  const arquivos: ArquivoExportado[] = [];
  const adicionar = (nome: string, cabecalho: string[], linhas: (string | number | boolean | null | undefined)[][]) =>
    arquivos.push({ nome, linhas: linhas.length, conteudo: montarCsv(cabecalho, linhas) });

  adicionar('unidades.csv', ['Unidade', 'Sigla'], porNome(ds.unidades(), u => u.nome).map(u => [u.nome, u.sigla]));

  adicionar('blocos.csv', ['Unidade', 'Bloco'], porNome(ds.blocos(), b => `${unidade(b.unidadeId)} ${b.nome}`).map(b => [unidade(b.unidadeId), b.nome]));

  adicionar(
    'salas.csv',
    ['Unidade', 'Bloco', 'Sala'],
    porNome(ds.salas(), s => `${unidade(s.unidadeId)} ${bloco(s.blocoId)} ${s.nome}`).map(s => [unidade(s.unidadeId), bloco(s.blocoId), s.nome])
  );

  // Mesmas colunas do modelo de importação (shared/importar-equipamentos.ts).
  adicionar(
    'equipamentos.csv',
    ['unidade', 'bloco', 'sala', 'nome', 'patrimonio', 'fabricante', 'modelo'],
    porNome(ds.equipamentos(), e => `${unidade(e.unidadeId)} ${bloco(e.blocoId)} ${sala(e.salaId)} ${e.nome}`).map(e => [
      unidade(e.unidadeId), bloco(e.blocoId), sala(e.salaId), e.nome, e.patrimonio, e.fabricante, e.modelo
    ])
  );

  adicionar(
    'chamados.csv',
    ['Número', 'Aberto em', 'Título', 'Descrição', 'Equipamento', 'Patrimônio', 'Unidade', 'Onde fica', 'Urgência', 'Quem pediu',
      'Origem', 'Plano preventivo', 'Situação', 'Prazo', 'Fechado em', 'OS'],
    [...ds.chamados()].sort((a, b) => a.dataCriacao.localeCompare(b.dataCriacao) || a.numero.localeCompare(b.numero)).map(c => [
      c.numero, dataCsv(c.dataCriacao), c.titulo, c.descricao, c.equipamento, equipamento(c.equipamentoId)?.patrimonio,
      unidade(c.unidadeId), c.local, rotuloUrgencia(c.urgencia), c.solicitanteNome,
      c.origem === 'preventiva' ? 'Preventiva' : 'Pedido', c.planoId ? ds.getPlanoById(c.planoId)?.nome ?? '' : '',
      rotuloStatusChamado(c.status), dataCsv(c.dataVencimento), dataCsv(c.dataFechamento),
      c.ordemServicoId ? osPorId.get(c.ordemServicoId)?.numero ?? '' : ''
    ])
  );

  adicionar(
    'ordens-de-servico.csv',
    ['Número', 'Aberta em', 'Chamado', 'Equipamento', 'Contrato', 'Empresa contratada', 'Técnico', 'Situação', 'Executada em',
      'Executada por', 'Observação da execução', 'Usado do contrato', 'Usado fora do contrato', 'Custo do contrato (R$)',
      'Custo fora do contrato (R$)', 'Custo total (R$)'],
    [...ds.ordensServico()].sort((a, b) => a.dataCriacao.localeCompare(b.dataCriacao) || a.numero.localeCompare(b.numero)).map(os => {
      const ch = chamadoPorId.get(os.chamadoId);
      const feito = servicoFeito(os);
      const linhas = feito ? linhasDoServico(os, ds.getOrcamentoByOS(os.id)) : [];
      const custo = custoDoServico(linhas);
      const lista = (fora: boolean) => linhas.filter(l => l.foraDoContrato === fora && l.usado > 0).map(l => `${numeroCsv(l.usado)}${l.unidade ? ' ' + l.unidade : ''} ${l.nome}`).join(' | ');
      return [
        os.numero, dataCsv(os.dataCriacao), ch?.numero, ch?.equipamento, contrato(os.contratoId), contratada(os.empresaContratadaId),
        pessoa(os.tecnicoId), os.situacao, dataCsv(os.dataExecucao), feito ? nomeTecnico(ds, os) : '', os.observacaoExecucao,
        lista(false), lista(true),
        feito ? numeroCsv(custo.contrato, 2) : '', feito ? numeroCsv(custo.foraContrato, 2) : '', feito ? numeroCsv(custo.total, 2) : ''
      ];
    })
  );

  // Uma linha por item do orçamento: do contrato e fora do contrato.
  const linhasOrcamento: (string | number | undefined)[][] = [];
  for (const o of [...ds.orcamentos()].sort((a, b) => a.dataCriacao.localeCompare(b.dataCriacao))) {
    const os = osPorId.get(o.osId);
    const base = [os?.numero ?? '', o.situacao, dataCsv(o.dataCriacao), dataCsv(o.dataAprovacao)];
    const fim = [o.ajustadoPeloGestor ? 'Sim' : '', o.observacaoAprovacao ?? ''];
    for (const i of o.itens) {
      const un = os ? ds.getContratoById(os.contratoId)?.itens.find(x => x.id === i.itemContratoId)?.unidadeMedida : '';
      linhasOrcamento.push([...base, 'Contrato', i.nome, numeroCsv(i.quantidade), un, numeroCsv(i.precoUnitario, 2), numeroCsv(i.quantidade * i.precoUnitario, 2), '', ...fim]);
    }
    for (const f of o.itensForaContrato ?? []) {
      linhasOrcamento.push([...base, 'Fora do contrato', f.descricao, numeroCsv(f.quantidade), f.unidade, numeroCsv(f.precoUnitario, 2), numeroCsv(f.quantidade * f.precoUnitario, 2), f.decisao ?? '', ...fim]);
    }
  }
  adicionar(
    'orcamentos.csv',
    ['OS', 'Situação do orçamento', 'Criado em', 'Aprovado em', 'Tipo', 'Item', 'Quantidade', 'Unidade', 'Preço unitário (R$)', 'Total (R$)',
      'Decisão (fora do contrato)', 'Ajustado pelo gestor', 'Observação da aprovação'],
    linhasOrcamento
  );

  const contratos = porNome(ds.contratos(), c => c.numero);
  adicionar(
    'contratos.csv',
    ['Número', 'Fornecedor', 'Empresa contratada', 'Vigência de', 'Vigência até', 'Situação', 'Aditivos', 'Encerrado em', 'Motivo do encerramento'],
    contratos.map(c => [
      c.numero, c.fornecedor, contratada(c.empresaContratadaId), dataCsv(c.vigenciaInicio), dataCsv(c.vigenciaFim), c.status,
      c.totalAditivos ?? 0, dataCsv(c.encerradoEm), c.motivoEncerramento
    ])
  );

  adicionar(
    'itens-de-contrato.csv',
    ['Contrato', 'Item', 'Unidade', 'Preço unitário (R$)', 'Contratado', 'Usado', 'Separado', 'Livre', 'Conta'],
    contratos.flatMap(c =>
      porNome(c.itens, i => i.nome).map(i => [
        c.numero, i.nome, i.unidadeMedida, numeroCsv(i.precoUnitario, 2), numeroCsv(i.quantidadeContratada), numeroCsv(i.quantidadeConsumida),
        numeroCsv(i.quantidadeReservada), numeroCsv(i.quantidadeDisponivel), contaSaldo(i)
      ])
    )
  );

  const aditivos: (string | number | undefined)[][] = [];
  for (const c of contratos) {
    const lista = (await ds.lerAditivos(c.id)).sort((a, b) => a.numero - b.numero);
    for (const a of lista) {
      const base = [c.numero, a.numero, dataCsv(a.data), a.motivo, a.vigenciaFim ? `${dataCsv(a.vigenciaFim.de)} para ${dataCsv(a.vigenciaFim.para)}` : '', a.autorNome];
      if (!a.itens?.length) aditivos.push([...base, '', '', '']);
      for (const i of a.itens ?? []) aditivos.push([...base, i.nome, numeroCsv(i.quantidadeContratada.de), numeroCsv(i.quantidadeContratada.para)]);
    }
  }
  adicionar('aditivos.csv', ['Contrato', 'Aditivo nº', 'Data', 'Motivo', 'Vigência até (de / para)', 'Quem registrou', 'Item', 'Contratado antes', 'Contratado depois'], aditivos);

  adicionar(
    'planos-preventivos.csv',
    ['Plano', 'Equipamento', 'Patrimônio', 'Unidade', 'A cada (dias)', 'Abre o chamado (dias antes)', 'Próxima', 'Última', 'Contrato', 'Item do contrato',
      'Quantidade prevista', 'Ativo'],
    porNome(ds.planosManutencao(), p => p.nome).map(p => {
      const e = equipamento(p.equipamentoId);
      const c = p.contratoId ? ds.getContratoById(p.contratoId) : undefined;
      return [
        p.nome, e?.nome ?? '', e?.patrimonio, unidade(e?.unidadeId), p.periodicidadeDias, p.antecedenciaDias, dataCsv(p.proximaExecucao),
        dataCsv(p.ultimaExecucao), c?.numero ?? '', c?.itens.find(i => i.id === p.itemContratoId)?.nome ?? '', numeroCsv(p.quantidadePrevista), p.ativo
      ];
    })
  );

  const agora = new Date();
  const leia = [
    `Exportação completa do Zella${empresaNome ? ` - ${empresaNome}` : ''}`,
    `Gerada em ${agora.toLocaleDateString('pt-BR')} às ${agora.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}.`,
    '',
    'Cada arquivo .csv abre no Excel, no LibreOffice ou no Google Planilhas.',
    'Separador: ponto e vírgula. Datas em dd/mm/aaaa. Valores em reais com vírgula.',
    'Saldo dos itens: Contratado = Usado + Separado + Livre.',
    'equipamentos.csv usa as colunas do modelo de importação e pode ser importado de volta.',
    '',
    'Arquivos:',
    ...arquivos.map(a => `- ${a.nome}: ${a.linhas} ${a.linhas === 1 ? 'linha' : 'linhas'}`)
  ].join('\r\n');
  arquivos.unshift({ nome: 'LEIA-ME.txt', linhas: 0, conteudo: '﻿' + leia + '\r\n' });
  return arquivos;
}

/** Compacta os arquivos num .zip (fflate, carregado sob demanda). */
export async function compactar(arquivos: ArquivoExportado[]): Promise<Blob> {
  const { zipSync, strToU8 } = await import('fflate');
  const entrada: Record<string, Uint8Array> = {};
  for (const a of arquivos) entrada[a.nome] = strToU8(a.conteudo);
  const zip = zipSync(entrada, { level: 6 });
  return new Blob([zip as BlobPart], { type: 'application/zip' });
}
