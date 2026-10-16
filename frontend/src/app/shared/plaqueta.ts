import { emulando } from './firebase';
import { MODO_DEMO } from './modo';
import { rotuloPatrimonio } from './rotulos';
import type { DataService } from './data.service';
import type { QrAlvo, QrAlvoTipo } from './models';

/**
 * A plaqueta do QR Code: o endereço que vai no código, o texto gravado e o
 * desenho chapado para impressão. Fonte única da janela do QR
 * (qrcode-detalhe) e das etiquetas em lote (Z3.1), para a folha impressa
 * sair igual à plaqueta da tela.
 */

/** O que vai gravado na plaqueta, montado a partir do cadastro do alvo. */
export interface Placa {
  faixa: string;
  rotulo: string;
  local: string;
  codigo: string;
}

/**
 * O QR não aponta direto pro formulário: aponta pra Cloud Function que gera
 * um link de 3 minutos a cada leitura (abrirChamadoQr, em
 * functions/src/qrLinks.ts). O código impresso nunca muda; o token por trás
 * dele, sim. A empresa vai no QR porque quem escaneia não tem login.
 */
export function urlDoQr(empresaId: string | undefined, tipo: QrAlvoTipo, id: string): string {
  // Na demonstração não há a function do link de 3 minutos: o QR leva
  // direto ao formulário, com o alvo no próprio token (data.service.demo.ts).
  if (MODO_DEMO) return new URL(`chamados/novo?qrToken=${encodeURIComponent(`${tipo}.${id}`)}`, document.baseURI).href;
  const consulta = `e=${empresaId ?? ''}&tipo=${tipo}&id=${id}`;
  return emulando
    ? `http://127.0.0.1:5001/gestao-manutencao-app/southamerica-east1/abrirChamadoQr?${consulta}`
    : `${location.origin}/api/qr?${consulta}`;
}

// A plaqueta fica exposta para todo mundo: leva o nome da unidade, não a
// sigla, e o patrimônio por extenso ("Patrimônio nº 0021").
export function montarPlaca(ds: DataService, alvo: QrAlvo): Placa {
  const juntar = (...partes: (string | undefined)[]) => partes.filter(Boolean).join(' · ');
  switch (alvo.tipo) {
    case 'equipamento': {
      const e = ds.getEquipamentoById(alvo.id);
      const local = e && juntar(ds.getUnidadeById(e.unidadeId)?.nome, e.blocoId ? ds.getBlocoById(e.blocoId)?.nome : undefined, ds.getSalaById(e.salaId)?.nome);
      return { faixa: 'Patrimônio', rotulo: 'Equipamento', local: local || alvo.subtitulo, codigo: rotuloPatrimonio(e?.patrimonio) };
    }
    case 'sala': {
      const s = ds.getSalaById(alvo.id);
      const local = s && juntar(ds.getUnidadeById(s.unidadeId)?.nome, s.blocoId ? ds.getBlocoById(s.blocoId)?.nome : undefined);
      return { faixa: 'Manutenção', rotulo: 'Sala', local: local || alvo.subtitulo, codigo: '' };
    }
    case 'bloco': {
      const b = ds.getBlocoById(alvo.id);
      const u = b && ds.getUnidadeById(b.unidadeId);
      return { faixa: 'Manutenção', rotulo: 'Bloco', local: u ? u.nome : alvo.subtitulo, codigo: '' };
    }
    case 'unidade':
      // O nome da unidade já é o título da plaqueta.
      return { faixa: 'Manutenção', rotulo: 'Unidade', local: '', codigo: '' };
  }
}

/** QR em PNG (data URL). */
export async function gerarQrDataUrl(url: string): Promise<string> {
  // A lib é CommonJS: no build de produção o import dinâmico só expõe
  // `default` (em desenvolvimento expunha as funções soltas também).
  // Sem esse ajuste o QR nunca era gerado em produção.
  const mod = await import('qrcode');
  const QRCode = ((mod as unknown as { default?: typeof mod }).default ?? mod) as typeof mod;
  return QRCode.toDataURL(url, {
    width: 640,
    margin: 2,
    errorCorrectionLevel: 'M',
    color: { dark: '#10191c', light: '#ffffff' }
  });
}

/**
 * A plaqueta chapada para impressão: sem brilho nem sombra (degradê impresso
 * fica sujo), mas com a mesma faixa, os rebites e o texto da tela.
 *
 * `escala` encolhe o desenho inteiro (1 = 900 px de largura). As etiquetas
 * em lote usam menos, para o PDF não ficar pesado.
 */
export async function desenharPlaqueta(qr: string, titulo: string, placa: Placa, escala = 1): Promise<string> {
  const estilo = getComputedStyle(document.documentElement);
  const marca = estilo.getPropertyValue('--font-brand').trim() || 'sans-serif';
  const texto = estilo.getPropertyValue('--font-sans').trim() || 'sans-serif';
  await Promise.all([document.fonts.load(`800 34px ${marca}`), document.fonts.load(`700 46px ${texto}`)]).catch(() => undefined);
  const img = new Image();
  img.src = qr;
  await img.decode();

  const L = 900, M = 60, QR = 600, X = M + 20;
  const larguraTexto = L - 2 * X;
  const c = document.createElement('canvas');
  const g = c.getContext('2d')!;

  // quebra o nome e o local em linhas antes de saber a altura da placa
  const quebrar = (frase: string, fonte: string): string[] => {
    g.font = fonte;
    const saida: string[] = [];
    let atual = '';
    for (const palavra of frase.split(/\s+/)) {
      const tentativa = atual ? `${atual} ${palavra}` : palavra;
      if (atual && g.measureText(tentativa).width > larguraTexto) { saida.push(atual); atual = palavra; } else atual = tentativa;
    }
    if (atual) saida.push(atual);
    return saida;
  };
  const linhas = quebrar(titulo, `700 46px ${texto}`);
  const linhasLocal = placa.local ? quebrar(placa.local, `500 38px ${texto}`) : [];

  const topoTexto = M + 110 + QR + 40 + 60;
  let alt = topoTexto + 16 + linhas.length * 56;
  if (linhasLocal.length) alt += 80 + 10 + (linhasLocal.length - 1) * 46;
  if (placa.codigo) alt += 30 + 58;
  alt += 70 + M;
  c.width = Math.round(L * escala);
  c.height = Math.round(alt * escala);
  // Mudar o tamanho do canvas zera o contexto: a escala vem depois.
  g.scale(escala, escala);

  const retangulo = (x: number, y: number, w: number, h: number, r: number) => { g.beginPath(); g.roundRect(x, y, w, h, r); };
  retangulo(4, 4, L - 8, alt - 8, 40);
  g.fillStyle = '#e3e8ea'; g.fill();
  g.lineWidth = 6; g.strokeStyle = '#8e999c'; g.stroke();
  retangulo(28, 28, L - 56, alt - 56, 26);
  g.lineWidth = 2; g.strokeStyle = '#b3bcbf'; g.stroke();
  for (const [x, y] of [[48, 48], [L - 48, 48], [48, alt - 48], [L - 48, alt - 48]]) {
    g.beginPath(); g.arc(x, y, 12, 0, Math.PI * 2);
    g.fillStyle = '#c3cbcd'; g.fill(); g.lineWidth = 3; g.strokeStyle = '#6f7a7e'; g.stroke();
  }

  retangulo(M + 30, M + 10, L - 2 * M - 60, 70, 8);
  g.fillStyle = '#0f6b6e'; g.fill();
  g.fillStyle = '#eaf6f6';
  g.font = `800 34px ${marca}`;
  g.letterSpacing = '7px';
  g.textBaseline = 'middle';
  g.textAlign = 'left'; g.fillText('ZELLA', M + 56, M + 46);
  g.textAlign = 'right'; g.fillText(placa.faixa.toUpperCase(), L - M - 50, M + 46);

  retangulo((L - QR - 40) / 2, M + 110, QR + 40, QR + 40, 14);
  g.fillStyle = '#ffffff'; g.fill(); g.lineWidth = 2; g.strokeStyle = '#9aa4a7'; g.stroke();
  g.imageSmoothingEnabled = false;
  g.drawImage(img, (L - QR) / 2, M + 130, QR, QR);

  g.textAlign = 'left';
  g.textBaseline = 'alphabetic';
  const rotulo = (t: string, y: number) => { g.font = `700 26px ${texto}`; g.letterSpacing = '4px'; g.fillStyle = '#56605f'; g.fillText(t.toUpperCase(), X, y); };
  let y = topoTexto;
  rotulo(placa.rotulo, y);
  y += 58;
  g.font = `700 46px ${texto}`; g.letterSpacing = '0px'; g.fillStyle = '#1f2a2c';
  for (const l of linhas) { g.fillText(l, X, y); y += 56; }
  if (linhasLocal.length) {
    y += 20; rotulo('Local', y);
    y += 46;
    g.font = `500 38px ${texto}`; g.letterSpacing = '0px'; g.fillStyle = '#26302f';
    linhasLocal.forEach((l, i) => {
      if (i > 0) y += 46;
      g.fillText(l, X, y, larguraTexto);
    });
  }
  if (placa.codigo) {
    y += 30;
    g.font = '600 38px ui-monospace, Consolas, monospace'; g.letterSpacing = '3px';
    const w = g.measureText(placa.codigo).width + 36;
    retangulo(X, y, w, 58, 8);
    g.fillStyle = '#d2d8da'; g.fill(); g.lineWidth = 2; g.strokeStyle = '#9aa4a7'; g.stroke();
    g.fillStyle = '#1b2427'; g.textBaseline = 'middle';
    g.fillText(placa.codigo, X + 18, y + 31);
    g.textBaseline = 'alphabetic';
  }
  g.textAlign = 'center';
  g.font = `500 28px ${texto}`; g.letterSpacing = '1px'; g.fillStyle = '#3e4847';
  g.fillText('Problema? Aponte a câmera e abra um chamado.', L / 2, alt - M - 12, larguraTexto);
  return c.toDataURL('image/png');
}
