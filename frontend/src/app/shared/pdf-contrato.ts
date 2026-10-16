/**
 * Leitura de contrato em PDF (Termo de Registro de Preços e suas
 * prorrogações, no formato que o Sistema Fibra/TOTVS emite).
 *
 * Por que ler por coordenada e não pelo texto corrido: nesses documentos a
 * descrição do item quebra em até três linhas, e o número do item às vezes
 * cai na linha de baixo, junto com o valor total da linha. Lendo o texto
 * como fluxo, "TUBO DE COBRE FLEXIVEL, D = 1/2 ", E = 0,79 MM, PARA AR-" e
 * "CONDICIONADO" viram coisas diferentes. Agrupando palavra por palavra pela
 * coordenada vertical, a linha física é reconstruída antes de qualquer
 * interpretação.
 *
 * A conferência que vale: todo item tem quantidade e preço unitário, e o
 * documento imprime o total de cada tabela. Se a soma de quantidade × preço
 * não bater com o total impresso, a leitura está errada e a tela avisa — é
 * mais confiável que qualquer heurística de layout.
 */

// pdfjs é carregado sob demanda: a tela de importação é a única que precisa
// dele, e são ~350 kB que não devem entrar no pacote inicial.
type PdfJs = typeof import('pdfjs-dist');

let pdfjsPromise: Promise<PdfJs> | null = null;

async function carregarPdfJs(): Promise<PdfJs> {
  if (!pdfjsPromise) {
    pdfjsPromise = import('pdfjs-dist').then((lib) => {
      // O worker e copiado para a raiz dos assets pelo angular.json. Tentar
      // resolver `new URL('pdfjs-dist/build/pdf.worker.mjs', import.meta.url)`
      // nao funciona aqui: o esbuild nao emite o arquivo, e o caminho morre em
      // 404 no ar. Caminho fixo e chato, mas e o que sobrevive ao build.
      lib.GlobalWorkerOptions.workerSrc = 'pdf.worker.min.mjs';
      return lib;
    });
  }
  return pdfjsPromise;
}

export interface ItemPdf {
  /** Número impresso na tabela. Cada tabela recomeça do 1. */
  numero: number | null;
  /** 1 = serviços, 2 = peças e serviços complementares. */
  tabela: number;
  descricao: string;
  quantidade: number;
  unidade: string;
  precoUnitario: number;
  /** Total da linha impresso no PDF, quando existe. Serve de conferência. */
  totalLinha: number | null;
}

export interface CabecalhoPdf {
  numero: string;
  fornecedor: string;
  contratante: string;
  /** ISO yyyy-mm-dd; vazio quando o documento não traz a data. */
  vigenciaInicio: string;
  vigenciaFim: string;
  objeto: string;
  valorTotalDeclarado: number | null;
  /** Verdadeiro quando o documento é prorrogação/aditivo, não contrato novo. */
  ehProrrogacao: boolean;
}

export interface LeituraPdf {
  cabecalho: CabecalhoPdf;
  itens: ItemPdf[];
  /** Totais impressos ao pé de cada tabela. */
  totaisDeclarados: number[];
  somaCalculada: number;
  /** Soma dos itens bate com os totais impressos. */
  confere: boolean;
  avisos: string[];
}

const MOEDA = /R\$\s*([\d.]+,\d{2})/g;
const UNIDADES = new Set(['UND', 'UN', 'M', 'H', 'KG', 'SERV', 'MT', 'L', 'PC', 'CX', 'PAR', 'M2', 'M3']);
const ABRE_TABELA = /VALORES D[OAE]S?\s|DESCRIÇÃO DAS PEÇAS/i;
const CABECALHO_TABELA = /^\s*ITEM\b|QTD DE|VALOR\s+UNIT|DESCRIÇÃO DOS SERVIÇOS|EQUIPAMENTO\s+ANO|UNITÁRIO\s+ANUAL|\(TRIMESTRAL\)/i;
const FECHA_TABELA = /VALOR TOTAL/i;
const RODAPE = /^(HASH TOTVS|Página \d+ de \d+)/i;

const MESES = [
  'janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho',
  'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'
];

function paraNumero(texto: string): number {
  return Number(texto.replace(/\./g, '').replace(',', '.'));
}

function moedas(linha: string): number[] {
  return [...linha.matchAll(MOEDA)].map((m) => paraNumero(m[1]));
}

/** "09 de agosto de 2026" e "8 de agosto de 2027" viram ISO. */
function dataPorExtenso(texto: string): string {
  const m = /(\d{1,2})\s+de\s+([a-zçã]+)\s+de\s+(\d{4})/i.exec(texto);
  if (!m) return '';
  const mes = MESES.indexOf(m[2].toLowerCase());
  if (mes < 0) return '';
  return `${m[3]}-${String(mes + 1).padStart(2, '0')}-${m[1].padStart(2, '0')}`;
}

/**
 * Reconstrói as linhas físicas da página.
 *
 * Duas coisas acontecem aqui. Primeiro as palavras são agrupadas pela
 * coordenada vertical, porque a ordem de leitura do PDF não é a ordem visual.
 * Depois — e isto é o que não dá para pular — os pedaços de uma mesma linha
 * são colados olhando o vão horizontal entre eles: o pdfjs não entrega
 * palavras, entrega fragmentos, e parte no meio delas. Juntar tudo com espaço
 * produz "DESC RIÇÃO", "33. 132 /2024" e "comprometem - se", o que quebra
 * tanto as expressões do cabeçalho quanto a contagem de itens. Se o pedaço
 * seguinte começa onde o anterior acabou, é a mesma palavra.
 */
export async function linhasDaPagina(pagina: {
  getTextContent: () => Promise<{ items: unknown[] }>;
}): Promise<string[]> {
  const conteudo = await pagina.getTextContent();
  const pedacos = conteudo.items
    .map((it) => it as { str?: string; transform?: number[]; width?: number; height?: number })
    .filter((it) => typeof it.str === 'string' && it.str !== '' && it.transform)
    .map((it) => ({
      texto: it.str as string,
      x: (it.transform as number[])[4],
      y: (it.transform as number[])[5],
      largura: it.width ?? 0,
      altura: it.height ?? 10
    }));

  const grupos: { y: number; ws: typeof pedacos }[] = [];
  for (const p of pedacos) {
    const grupo = grupos.find((g) => Math.abs(g.y - p.y) <= 2.5);
    if (grupo) {
      grupo.ws.push(p);
    } else {
      grupos.push({ y: p.y, ws: [p] });
    }
  }

  // No PDF o y cresce para cima: a primeira linha da página é o maior y.
  return grupos
    .sort((a, b) => b.y - a.y)
    .map((g) => {
      const ordenados = g.ws.sort((a, b) => a.x - b.x);
      let linha = '';
      let fimAnterior: number | null = null;
      for (const p of ordenados) {
        if (fimAnterior !== null) {
          // Um quarto da altura da fonte separa palavras; abaixo disso os
          // pedaços são da mesma palavra e vão colados.
          const vao = p.x - fimAnterior;
          if (vao > p.altura * 0.25) linha += ' ';
        }
        linha += p.texto;
        fimAnterior = p.x + p.largura;
      }
      return linha.replace(/\s+/g, ' ').trim();
    })
    .filter((l) => l.length > 0);
}

/** Índices da quantidade e da unidade numa linha de item. */
function medir(tokens: string[]): { qtd: number; und: number } | null {
  let und = -1;
  tokens.forEach((t, i) => {
    if (UNIDADES.has(t.toUpperCase().replace(/[.,]/g, ''))) und = i;
  });
  if (und < 0) return null;
  for (let i = und - 1; i >= 0; i--) {
    if (/^\d+$/.test(tokens[i])) return { qtd: i, und };
  }
  return null;
}

function ehLinhaDeItem(linha: string): boolean {
  const tokens = linha.split(' ');
  return moedas(linha).length > 0 && medir(tokens) !== null;
}

function lerCabecalho(bruto: string): CabecalhoPdf {
  // A prosa do contrato quebra no meio da frase ("e a empresa HABIL" /
  // "COMERCIO E SERVICOS..."), entao a busca acontece no texto achatado.
  const texto = bruto.replace(/\s+/g, ' ');
  const achar = (re: RegExp): string => (re.exec(texto)?.[1] ?? '').replace(/\s+/g, ' ').trim();

  const numero =
    achar(/PROCESSO DE SELEÇÃO COM DISPUTA\s+N[ºo°]\s*([\d./-]+)/i) ||
    achar(/PROCESSO\s+N[ºo°]\s*([\d./-]+)/i) ||
    achar(/CHAMAMENTO PÚBLICO[^\n]*?N[ºo°]\s*([\d./-]+)/i);

  const fornecedor =
    achar(/a\s+empresa\s+(.+?),\s*doravante/i) ||
    achar(/FORNECEDOR[:\s]+(.+?)(?:,|\.)/i);

  const contratante = achar(/A\s+(INSTITUTO[^,]+|SERVIÇO[^,]+|FEDERAÇÃO[^,]+),\s*doravante/i);

  const inicio = /início a partir de ([^,]+?),?\s*e\s*término/i.exec(texto)?.[1] ?? '';
  const fim = /término previsto para o dia\s+([^,]+?)(?:,|\.)/i.exec(texto)?.[1] ?? '';

  const valor = /valor total para até R\$\s*([\d.]+,\d{2})/i.exec(texto)?.[1];

  return {
    numero,
    fornecedor,
    contratante,
    vigenciaInicio: dataPorExtenso(inicio),
    vigenciaFim: dataPorExtenso(fim),
    objeto: achar(/relativos ao (.+?)(?:,\s*respeitando|\.)/i),
    valorTotalDeclarado: valor ? paraNumero(valor) : null,
    ehProrrogacao: /PRORROGAÇÃO DE VIGÊNCIA|TERMO DE PRORROGAÇÃO|ADITIVO/i.test(texto)
  };
}

export async function lerContratoPdf(arquivo: File | ArrayBuffer): Promise<LeituraPdf> {
  const pdfjs = await carregarPdfJs();
  const dados = arquivo instanceof ArrayBuffer ? arquivo : await arquivo.arrayBuffer();
  const doc = await pdfjs.getDocument({ data: new Uint8Array(dados) }).promise;

  const linhas: string[] = [];
  for (let n = 1; n <= doc.numPages; n++) {
    const pagina = await doc.getPage(n);
    linhas.push(...(await linhasDaPagina(pagina)));
  }

  return montarLeitura(linhas);
}

/**
 * Separada de `lerContratoPdf` para poder ser testada com linhas fixas, sem
 * depender do pdfjs nem de um arquivo: e aqui que mora a interpretacao.
 */
export function montarLeitura(linhas: string[]): LeituraPdf {
  const cabecalho = lerCabecalho(linhas.join('\n'));
  const itens: ItemPdf[] = [];
  const totaisDeclarados: number[] = [];
  const avisos: string[] = [];

  let dentro = false;
  let tabela = 0;
  let pendente: string[] = [];

  for (let i = 0; i < linhas.length; i++) {
    const linha = linhas[i];
    if (!linha || RODAPE.test(linha)) continue;

    // Fecha só quando a linha de total traz valor: o cabeçalho da tabela
    // também diz "VALOR TOTAL", e fecharia a tabela antes de ela começar.
    if (FECHA_TABELA.test(linha) && moedas(linha).length) {
      totaisDeclarados.push(moedas(linha).pop() as number);
      dentro = false;
      pendente = [];
      continue;
    }

    if (ABRE_TABELA.test(linha) || CABECALHO_TABELA.test(linha) || FECHA_TABELA.test(linha)) {
      if (!dentro) tabela++;
      dentro = true;
      pendente = [];
      continue;
    }

    if (!dentro) continue;

    const tokens = linha.split(' ');
    const dinheiro = moedas(linha);
    const medida = medir(tokens);

    // Toda linha de item traz dois valores: unitário e total. Se o item
    // anterior ficou sem total, esta linha é a cauda dele, não um item novo.
    const anteriorIncompleto = itens.length > 0 && itens[itens.length - 1].totalLinha === null;

    if (dinheiro.length && medida && !anteriorIncompleto) {
      let numero: number | null = null;
      let ini = 0;
      if (/^\d{1,3}$/.test(tokens[0]) && medida.qtd > 0) {
        numero = Number(tokens[0]);
        ini = 1;
      }
      let descricao = tokens.slice(ini, medida.qtd).join(' ').trim();

      // Tabela de serviços: duas colunas de quantidade seguidas, então o que
      // sobra antes da quantidade é só número — a descrição veio na linha de cima.
      if (pendente.length && (!descricao || /^[\d\s]*$/.test(descricao))) {
        descricao = pendente.join(' ').trim();
      } else if (pendente.length) {
        descricao = `${pendente.join(' ')} ${descricao}`.trim();
      }
      pendente = [];

      itens.push({
        numero,
        tabela: Math.max(tabela, 1),
        descricao: descricao.replace(/\s+/g, ' '),
        quantidade: Number(tokens[medida.qtd]),
        unidade: tokens[medida.und].toUpperCase().replace(/[.,]/g, ''),
        precoUnitario: dinheiro[0],
        totalLinha: dinheiro.length > 1 ? dinheiro[1] : null
      });
      continue;
    }

    // Cauda: dinheiro sem quantidade completa o item anterior — e costuma
    // trazer o número do item, que ficou órfão na linha de baixo.
    if (dinheiro.length && itens.length) {
      const ultimo = itens[itens.length - 1];
      let resto = tokens.filter((t) => !t.startsWith('R$') && !/^[\d.]*,\d{2}$/.test(t));
      if (resto.length && /^\d{1,3}$/.test(resto[0]) && ultimo.numero === null) {
        ultimo.numero = Number(resto[0]);
        resto = resto.slice(1);
      }
      if (resto.length) {
        ultimo.descricao = `${ultimo.descricao} ${resto.join(' ')}`.replace(/\s+/g, ' ').trim();
      }
      if (ultimo.totalLinha === null) ultimo.totalLinha = dinheiro[dinheiro.length - 1];
      continue;
    }

    // Texto puro. Olhando a próxima linha dá para saber de quem ele é: se a
    // seguinte é uma linha de números, este texto é a descrição dela; se não,
    // é a continuação da descrição do item anterior.
    if (!/^[\d\s.,]+$/.test(linha)) {
      const proxima = linhas[i + 1] ?? '';
      const sobraCurta = linha.split(' ').length <= 2 && itens.length > 0;
      if (ehLinhaDeItem(proxima) && !RODAPE.test(proxima) && !sobraCurta) {
        pendente.push(linha);
      } else if (itens.length) {
        const ultimo = itens[itens.length - 1];
        ultimo.descricao = `${ultimo.descricao} ${linha}`.replace(/\s+/g, ' ').trim();
      } else {
        pendente.push(linha);
      }
    }
  }

  const somaCalculada = Number(
    itens.reduce((t, i) => t + i.quantidade * i.precoUnitario, 0).toFixed(2)
  );
  const somaDeclarada = Number(totaisDeclarados.reduce((t, v) => t + v, 0).toFixed(2));
  const confere = totaisDeclarados.length > 0 && Math.abs(somaCalculada - somaDeclarada) < 0.01;

  if (!itens.length) avisos.push('Nenhum item foi encontrado. O PDF pode ser digitalizado (imagem) em vez de texto.');
  if (totaisDeclarados.length && !confere) {
    avisos.push(
      `A soma dos itens (${somaCalculada.toFixed(2)}) não bate com o total impresso no documento ` +
      `(${somaDeclarada.toFixed(2)}). Confira os itens antes de importar.`
    );
  }
  if (!cabecalho.numero) avisos.push('Número do processo não encontrado: preencha à mão antes de importar.');
  if (!cabecalho.fornecedor) avisos.push('Fornecedor não encontrado: preencha à mão antes de importar.');
  if (!cabecalho.vigenciaInicio || !cabecalho.vigenciaFim) {
    avisos.push('Vigência não encontrada no texto: preencha à mão antes de importar.');
  }
  const semNumero = itens.filter((i) => i.numero === null).length;
  if (semNumero) avisos.push(`${semNumero} item(ns) sem número na tabela — a importação segue normalmente.`);

  return { cabecalho, itens, totaisDeclarados, somaCalculada, confere, avisos };
}

function paraBr(iso: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  return m ? `${m[3]}/${m[2]}/${m[1]}` : '';
}

/**
 * Converte a leitura no mesmo CSV que a importação por planilha já usa, para
 * reaproveitar a validação e a gravação que existem no backend em vez de
 * escrever um segundo caminho de importação.
 */
export function paraCsvImportacao(leitura: LeituraPdf, cabecalho = leitura.cabecalho): string {
  const cab = 'contrato;fornecedor;vigencia_inicio;vigencia_fim;item;quantidade;unidade;preco_unitario';
  const linhas = leitura.itens.map((i) =>
    [
      cabecalho.numero,
      cabecalho.fornecedor,
      paraBr(cabecalho.vigenciaInicio),
      paraBr(cabecalho.vigenciaFim),
      // O ; é o separador do arquivo: numa descrição ele quebraria a linha.
      i.descricao.replace(/;/g, ','),
      String(i.quantidade),
      i.unidade,
      i.precoUnitario.toFixed(2).replace('.', ',')
    ].join(';')
  );
  return [cab, ...linhas].join('\n');
}
