import type { jsPDF } from 'jspdf';

/**
 * Base dos PDFs gerados no navegador (relatório do mês, histórico do
 * equipamento, etiquetas e proposta comercial), em cima do jsPDF.
 *
 * O jsPDF é carregado sob demanda, como o pdfjs da importação de contratos:
 * são ~350 kB que só quem gera um PDF precisa baixar.
 *
 * As fontes são as padrão do PDF (Helvetica). Elas cobrem o português
 * (acentos, ç, º), mas não símbolos fora do Latin-1: `limparTexto` troca o
 * que ficaria quebrado por um equivalente simples.
 */

type JsPdfModulo = typeof import('jspdf');
let jspdfPromise: Promise<JsPdfModulo> | null = null;

export function carregarJsPdf(): Promise<JsPdfModulo> {
  jspdfPromise ??= import('jspdf');
  return jspdfPromise;
}

const TROCAS: Record<string, string> = {
  '—': '-', '–': '-', '−': '-', '…': '...', '“': '"', '”': '"',
  '‘': "'", '’': "'", '•': '-', '→': '->', '←': '<-', '≤': '<=',
  '≥': '>=', '≈': '~', '≠': '!=', ' ': ' ', ' ': ' ', ' ': ' ', '✓': 'ok'
};

/** Deixa o texto só com o que as fontes padrão do PDF desenham. */
export function limparTexto(texto: unknown): string {
  const s = String(texto ?? '');
  let saida = '';
  for (const c of s) {
    if (TROCAS[c] !== undefined) saida += TROCAS[c];
    else if (c.codePointAt(0)! <= 0xff) saida += c;
    else saida += c.normalize('NFD').replace(/[^\x20-\xff]/g, '') || '?';
  }
  return saida;
}

const moeda = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });
const numero = new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 2 });

export function reais(valor: number): string {
  return limparTexto(moeda.format(Number(valor) || 0));
}

export function num(valor: number): string {
  return numero.format(Number(valor) || 0);
}

/** "2026-10-13" ou ISO completo vira "13/10/2026". Vazio fica vazio. */
export function dataBr(iso: string | undefined | null): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso ?? '');
  return m ? `${m[3]}/${m[2]}/${m[1]}` : '';
}

export function hojeBr(agora = new Date()): string {
  return agora.toLocaleDateString('pt-BR');
}

// Cores da marca (as mesmas da plaqueta do QR): faixa verde-petróleo e
// cinzas de leitura.
export const COR = {
  marca: [15, 107, 110] as const,
  marcaClara: [226, 240, 240] as const,
  texto: [31, 42, 44] as const,
  suave: [86, 96, 95] as const,
  linha: [205, 214, 216] as const,
  zebra: [244, 247, 247] as const,
  alerta: [176, 106, 0] as const,
  alertaClara: [253, 243, 222] as const,
  perigo: [180, 35, 24] as const
};

type Cor = readonly [number, number, number];

export interface Celula {
  texto: string;
  negrito?: boolean;
  cor?: Cor;
}

export interface ColunaTabela {
  titulo: string;
  // Fração da largura útil. As frações da tabela devem somar 1.
  largura: number;
  alinhar?: 'left' | 'right' | 'center';
}

export interface OpcoesTabela {
  colunas: ColunaTabela[];
  linhas: (string | Celula)[][];
  // Fundo de destaque de uma linha (ex.: item fora do contrato).
  fundo?: (indice: number) => Cor | undefined;
  tamanho?: number;
  vazio?: string;
}

export interface OpcoesDocumento {
  titulo: string;
  subtitulo?: string;
  // Linha pequena sob o título: empresa, quem gerou, quando.
  linhaInfo?: string;
  // Texto do rodapé de cada página, antes do "Página X de Y".
  rodape?: string;
}

const PT_PARA_MM = 0.3528;

export class DocumentoPdf {
  readonly margem = 15;
  readonly largura: number;
  readonly altura: number;
  y: number;

  private constructor(readonly doc: jsPDF, private readonly opcoes: OpcoesDocumento) {
    this.largura = doc.internal.pageSize.getWidth();
    this.altura = doc.internal.pageSize.getHeight();
    this.y = this.margem;
  }

  static async criar(opcoes: OpcoesDocumento): Promise<DocumentoPdf> {
    const { jsPDF } = await carregarJsPdf();
    const doc = new jsPDF({ unit: 'mm', format: 'a4', orientation: 'portrait', compress: true });
    doc.setProperties({ title: limparTexto(opcoes.titulo), creator: 'Zella' });
    const pdf = new DocumentoPdf(doc, opcoes);
    pdf.cabecalho();
    return pdf;
  }

  get larguraUtil(): number {
    return this.largura - 2 * this.margem;
  }

  private get limite(): number {
    // Reserva o rodapé.
    return this.altura - this.margem - 8;
  }

  alturaLinha(tamanho: number): number {
    return tamanho * PT_PARA_MM * 1.3;
  }

  private fonte(tamanho: number, negrito = false, cor: Cor = COR.texto): void {
    this.doc.setFont('helvetica', negrito ? 'bold' : 'normal');
    this.doc.setFontSize(tamanho);
    this.doc.setTextColor(cor[0], cor[1], cor[2]);
  }

  private cabecalho(): void {
    const { doc } = this;
    doc.setFillColor(...COR.marca);
    doc.rect(0, 0, this.largura, 9, 'F');
    this.fonte(9, true, [234, 246, 246]);
    doc.text('ZELLA', this.margem, 6);
    this.fonte(8, false, [234, 246, 246]);
    doc.text('Gestão de manutenção', this.largura - this.margem, 6, { align: 'right' });

    this.y = 20;
    this.fonte(17, true);
    for (const linha of doc.splitTextToSize(limparTexto(this.opcoes.titulo), this.larguraUtil) as string[]) {
      doc.text(linha, this.margem, this.y);
      this.y += this.alturaLinha(17);
    }
    if (this.opcoes.subtitulo) {
      this.fonte(11, false, COR.suave);
      for (const linha of doc.splitTextToSize(limparTexto(this.opcoes.subtitulo), this.larguraUtil) as string[]) {
        doc.text(linha, this.margem, this.y);
        this.y += this.alturaLinha(11);
      }
    }
    if (this.opcoes.linhaInfo) {
      this.fonte(8, false, COR.suave);
      doc.text(limparTexto(this.opcoes.linhaInfo), this.margem, this.y + 1);
      this.y += this.alturaLinha(8) + 1;
    }
    doc.setDrawColor(...COR.linha);
    doc.setLineWidth(0.3);
    doc.line(this.margem, this.y, this.largura - this.margem, this.y);
    this.y += 6;
  }

  novaPagina(): void {
    this.doc.addPage();
    this.doc.setFillColor(...COR.marca);
    this.doc.rect(0, 0, this.largura, 3, 'F');
    this.y = this.margem;
  }

  /** Quebra a página se o que vem não couber. */
  garantirEspaco(altura: number): void {
    if (this.y + altura > this.limite) this.novaPagina();
  }

  espaco(mm = 4): void {
    this.y += mm;
  }

  secao(titulo: string, ajuda?: string): void {
    this.garantirEspaco(18);
    this.y += 2;
    this.fonte(12, true, COR.marca);
    this.doc.text(limparTexto(titulo), this.margem, this.y);
    this.y += this.alturaLinha(12);
    if (ajuda) this.paragrafo(ajuda, { tamanho: 8.5, cor: COR.suave });
    this.y += 1;
  }

  subtitulo(texto: string): void {
    this.garantirEspaco(12);
    this.fonte(10, true);
    this.doc.text(limparTexto(texto), this.margem, this.y);
    this.y += this.alturaLinha(10) + 0.5;
  }

  paragrafo(texto: string, opcoes: { tamanho?: number; negrito?: boolean; cor?: Cor; recuo?: number } = {}): void {
    const tamanho = opcoes.tamanho ?? 9.5;
    const recuo = opcoes.recuo ?? 0;
    this.fonte(tamanho, opcoes.negrito, opcoes.cor);
    const linhas = this.doc.splitTextToSize(limparTexto(texto), this.larguraUtil - recuo) as string[];
    const passo = this.alturaLinha(tamanho);
    for (const linha of linhas) {
      this.garantirEspaco(passo);
      this.doc.text(linha, this.margem + recuo, this.y);
      this.y += passo;
    }
    this.y += 1;
  }

  /** Lista com marcador, uma linha por item. */
  lista(itens: string[], tamanho = 9.5): void {
    for (const item of itens) {
      this.fonte(tamanho);
      const linhas = this.doc.splitTextToSize(limparTexto(item), this.larguraUtil - 5) as string[];
      const passo = this.alturaLinha(tamanho);
      linhas.forEach((linha, i) => {
        this.garantirEspaco(passo);
        if (i === 0) this.doc.text('-', this.margem + 1, this.y);
        this.doc.text(linha, this.margem + 5, this.y);
        this.y += passo;
      });
    }
    this.y += 1;
  }

  /** Pares rótulo: valor em duas colunas. Pares sem valor não aparecem. */
  dados(pares: [string, string | undefined | null][], tamanho = 9): void {
    const visiveis = pares.filter(([, v]) => v !== undefined && v !== null && String(v).trim() !== '');
    const larguraRotulo = 42;
    for (const [rotulo, valor] of visiveis) {
      const linhas = this.doc.splitTextToSize(limparTexto(valor), this.larguraUtil - larguraRotulo) as string[];
      const passo = this.alturaLinha(tamanho);
      this.garantirEspaco(passo * linhas.length);
      this.fonte(tamanho, true, COR.suave);
      this.doc.text(limparTexto(rotulo), this.margem, this.y);
      this.fonte(tamanho);
      linhas.forEach((l, i) => this.doc.text(l, this.margem + larguraRotulo, this.y + i * passo));
      this.y += passo * linhas.length + 0.6;
    }
    this.y += 1;
  }

  /** Caixa de destaque com uma ou mais linhas (resumo, aviso). */
  caixa(linhas: string[], opcoes: { fundo?: Cor; borda?: Cor; tamanho?: number; negrito?: boolean } = {}): void {
    const tamanho = opcoes.tamanho ?? 9.5;
    const passo = this.alturaLinha(tamanho);
    const quebradas = linhas.flatMap(l => this.doc.splitTextToSize(limparTexto(l), this.larguraUtil - 8) as string[]);
    const altura = quebradas.length * passo + 5;
    this.garantirEspaco(altura + 2);
    const fundo = opcoes.fundo ?? COR.marcaClara;
    this.doc.setFillColor(fundo[0], fundo[1], fundo[2]);
    const borda = opcoes.borda ?? fundo;
    this.doc.setDrawColor(borda[0], borda[1], borda[2]);
    this.doc.roundedRect(this.margem, this.y - 1, this.larguraUtil, altura, 1.5, 1.5, 'FD');
    this.fonte(tamanho, opcoes.negrito);
    let y = this.y + passo + 0.4;
    for (const l of quebradas) {
      this.doc.text(l, this.margem + 4, y);
      y += passo;
    }
    this.y += altura + 3;
  }

  tabela(opcoes: OpcoesTabela): void {
    const tamanho = opcoes.tamanho ?? 8;
    const passo = this.alturaLinha(tamanho);
    const pad = 1.6;
    const larguras = opcoes.colunas.map(c => c.largura * this.larguraUtil);

    const desenharCabecalho = () => {
      this.fonte(tamanho, true, [255, 255, 255]);
      const quebrados = opcoes.colunas.map((c, i) => this.doc.splitTextToSize(limparTexto(c.titulo), larguras[i] - 2 * pad) as string[]);
      const altura = Math.max(...quebrados.map(q => q.length)) * passo + 2 * pad;
      this.garantirEspaco(altura + passo + 2 * pad);
      this.doc.setFillColor(...COR.marca);
      this.doc.rect(this.margem, this.y, this.larguraUtil, altura, 'F');
      let x = this.margem;
      quebrados.forEach((linhas, i) => {
        this.escreverCelula(linhas, x, larguras[i], opcoes.colunas[i].alinhar, pad, passo);
        x += larguras[i];
      });
      this.y += altura;
    };

    desenharCabecalho();

    if (!opcoes.linhas.length) {
      this.fonte(tamanho, false, COR.suave);
      this.garantirEspaco(passo + 2 * pad);
      this.doc.text(limparTexto(opcoes.vazio ?? 'Nada no período.'), this.margem + pad, this.y + pad + passo * 0.8);
      this.y += passo + 2 * pad + 3;
      return;
    }

    opcoes.linhas.forEach((linha, indice) => {
      const celulas = linha.map(c => (typeof c === 'string' ? { texto: c } : c));
      const quebrados = celulas.map((c, i) => {
        this.fonte(tamanho, c.negrito);
        return this.doc.splitTextToSize(limparTexto(c.texto), larguras[i] - 2 * pad) as string[];
      });
      const altura = Math.max(1, ...quebrados.map(q => q.length)) * passo + 2 * pad;
      if (this.y + altura > this.limite) {
        this.novaPagina();
        desenharCabecalho();
      }
      const fundo = opcoes.fundo?.(indice) ?? (indice % 2 ? COR.zebra : undefined);
      if (fundo) {
        this.doc.setFillColor(fundo[0], fundo[1], fundo[2]);
        this.doc.rect(this.margem, this.y, this.larguraUtil, altura, 'F');
      }
      let x = this.margem;
      quebrados.forEach((linhas, i) => {
        this.fonte(tamanho, celulas[i].negrito, celulas[i].cor ?? COR.texto);
        this.escreverCelula(linhas, x, larguras[i], opcoes.colunas[i].alinhar, pad, passo);
        x += larguras[i];
      });
      this.doc.setDrawColor(...COR.linha);
      this.doc.setLineWidth(0.15);
      this.doc.line(this.margem, this.y + altura, this.margem + this.larguraUtil, this.y + altura);
      this.y += altura;
    });
    this.y += 4;
  }

  private escreverCelula(linhas: string[], x: number, largura: number, alinhar: ColunaTabela['alinhar'], pad: number, passo: number): void {
    const xs = alinhar === 'right' ? x + largura - pad : alinhar === 'center' ? x + largura / 2 : x + pad;
    linhas.forEach((l, i) => {
      this.doc.text(l, xs, this.y + pad + passo * (i + 0.78), { align: alinhar ?? 'left' });
    });
  }

  /** Numera as páginas e escreve o rodapé. Chamar uma vez, no fim. */
  finalizar(): void {
    const total = this.doc.getNumberOfPages();
    for (let p = 1; p <= total; p++) {
      this.doc.setPage(p);
      this.fonte(7.5, false, COR.suave);
      const y = this.altura - 8;
      this.doc.setDrawColor(...COR.linha);
      this.doc.setLineWidth(0.2);
      this.doc.line(this.margem, y - 4, this.largura - this.margem, y - 4);
      if (this.opcoes.rodape) this.doc.text(limparTexto(this.opcoes.rodape), this.margem, y);
      this.doc.text(`Página ${p} de ${total}`, this.largura - this.margem, y, { align: 'right' });
    }
  }

  blob(): Blob {
    return this.doc.output('blob');
  }

  baixar(nomeArquivo: string): void {
    baixarArquivo(this.blob(), nomeArquivo);
  }
}

/** Baixa um arquivo gerado no navegador (PDF, CSV, ZIP). */
export function baixarArquivo(blob: Blob, nomeArquivo: string): void {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = nomeArquivo;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
}

/** Nome de arquivo sem acento nem espaço: "Relatório de outubro" vira "relatorio-de-outubro". */
export function nomeDeArquivo(texto: string): string {
  return texto
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '');
}
