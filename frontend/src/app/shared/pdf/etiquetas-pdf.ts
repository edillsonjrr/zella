import { carregarJsPdf, limparTexto } from './documento-pdf';
import { desenharPlaqueta, gerarQrDataUrl, type Placa } from '../plaqueta';

/**
 * Etiquetas QR em lote (Z3.1): várias plaquetas por folha A4, com linha
 * tracejada de corte em volta de cada uma. O desenho é o mesmo da plaqueta
 * da janela do QR (shared/plaqueta.ts), só que menor.
 *
 * 3 colunas × 3 linhas: cada plaqueta sai com uns 57 mm de largura, o
 * bastante para o QR ser lido a um braço de distância.
 */

export interface Etiqueta {
  titulo: string;
  url: string;
  placa: Placa;
}

const COLUNAS = 3;
const LINHAS = 3;
const MARGEM = 10;
const FOLGA = 3;
// Escala do desenho: 900 px × 0,7 = 630 px para ~57 mm, perto de 280 dpi.
const ESCALA = 0.7;

export async function gerarEtiquetasPdf(
  etiquetas: Etiqueta[],
  aoAvancar?: (feitas: number, total: number) => void
): Promise<Blob> {
  const { jsPDF } = await carregarJsPdf();
  const doc = new jsPDF({ unit: 'mm', format: 'a4', orientation: 'portrait', compress: true });
  doc.setProperties({ title: 'Etiquetas QR', creator: 'Zella' });
  const largura = doc.internal.pageSize.getWidth();
  const altura = doc.internal.pageSize.getHeight();
  const celulaL = (largura - 2 * MARGEM) / COLUNAS;
  const celulaA = (altura - 2 * MARGEM) / LINHAS;
  const porFolha = COLUNAS * LINHAS;
  const folhas = Math.ceil(etiquetas.length / porFolha);

  for (const [i, etiqueta] of etiquetas.entries()) {
    const naFolha = i % porFolha;
    if (i > 0 && naFolha === 0) doc.addPage();
    if (naFolha === 0) {
      const folha = Math.floor(i / porFolha) + 1;
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(7);
      doc.setTextColor(110, 120, 122);
      doc.text(limparTexto(`Zella · etiquetas QR · recorte na linha tracejada · folha ${folha} de ${folhas}`), largura / 2, altura - 4, { align: 'center' });
    }
    const coluna = naFolha % COLUNAS;
    const linha = Math.floor(naFolha / COLUNAS);
    const x = MARGEM + coluna * celulaL;
    const y = MARGEM + linha * celulaA;

    // Linha de corte.
    doc.setDrawColor(160, 170, 172);
    doc.setLineWidth(0.2);
    doc.setLineDashPattern([1.5, 1.2], 0);
    doc.rect(x, y, celulaL, celulaA, 'S');
    doc.setLineDashPattern([], 0);

    const qr = await gerarQrDataUrl(etiqueta.url);
    const png = await desenharPlaqueta(qr, etiqueta.titulo, etiqueta.placa, ESCALA);
    const imagem = doc.getImageProperties(png);
    const maxL = celulaL - 2 * FOLGA;
    const maxA = celulaA - 2 * FOLGA;
    const fator = Math.min(maxL / imagem.width, maxA / imagem.height);
    const w = imagem.width * fator;
    const h = imagem.height * fator;
    doc.addImage(png, 'PNG', x + (celulaL - w) / 2, y + (celulaA - h) / 2, w, h, undefined, 'FAST');

    aoAvancar?.(i + 1, etiquetas.length);
    // Devolve a vez ao navegador: com centenas de etiquetas, a tela não congela.
    await new Promise(r => setTimeout(r, 0));
  }

  return doc.output('blob');
}
