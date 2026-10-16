/**
 * Planilhas CSV do jeito que o Excel em português abre e salva: separador
 * ";" e UTF-8 com BOM (sem o BOM, o Excel troca os acentos por lixo).
 *
 * Usado na importação de equipamentos (Z3.1) e na exportação completa
 * (Z3.3). A leitura aceita também "," e tabulação, para o caso de a
 * planilha ter sido salva por outro programa.
 */

export const BOM = '﻿';

/** Lê o texto do arquivo e devolve as linhas, já sem linhas em branco. */
export function lerCsv(texto: string): string[][] {
  const limpo = texto.replace(/^﻿/, '');
  const separador = detectarSeparador(limpo);
  const linhas: string[][] = [];
  let campo = '';
  let linha: string[] = [];
  let aspas = false;

  for (let i = 0; i < limpo.length; i++) {
    const c = limpo[i];
    if (aspas) {
      if (c === '"') {
        if (limpo[i + 1] === '"') {
          campo += '"';
          i++;
        } else {
          aspas = false;
        }
      } else {
        campo += c;
      }
      continue;
    }
    if (c === '"') {
      aspas = true;
    } else if (c === separador) {
      linha.push(campo);
      campo = '';
    } else if (c === '\n' || c === '\r') {
      if (c === '\r' && limpo[i + 1] === '\n') i++;
      linha.push(campo);
      linhas.push(linha);
      linha = [];
      campo = '';
    } else {
      campo += c;
    }
  }
  if (campo !== '' || linha.length) {
    linha.push(campo);
    linhas.push(linha);
  }
  return linhas.map(l => l.map(c => c.trim())).filter(l => l.some(c => c !== ''));
}

function detectarSeparador(texto: string): string {
  const primeira = texto.split(/\r?\n/, 1)[0] ?? '';
  const contar = (c: string) => primeira.split(c).length - 1;
  const candidatos: [string, number][] = [[';', contar(';')], ['\t', contar('\t')], [',', contar(',')]];
  candidatos.sort((a, b) => b[1] - a[1]);
  return candidatos[0][1] > 0 ? candidatos[0][0] : ';';
}

type Valor = string | number | boolean | null | undefined;

function celula(valor: Valor): string {
  if (valor === null || valor === undefined) return '';
  const texto = typeof valor === 'boolean' ? (valor ? 'Sim' : 'Não') : String(valor);
  return /[";\r\n]/.test(texto) ? `"${texto.replace(/"/g, '""')}"` : texto;
}

/** Monta o CSV com cabeçalho, ";" e quebra de linha do Windows. */
export function montarCsv(cabecalho: string[], linhas: Valor[][], comBom = true): string {
  const corpo = [cabecalho, ...linhas].map(l => l.map(celula).join(';')).join('\r\n');
  return (comBom ? BOM : '') + corpo + '\r\n';
}

/** Número no formato do Excel em português: "1250,5" (sem separador de milhar). */
export function numeroCsv(valor: number | null | undefined, casas?: number): string {
  if (valor === null || valor === undefined || !Number.isFinite(valor)) return '';
  const texto = casas === undefined ? String(Math.round(valor * 1000) / 1000) : valor.toFixed(casas);
  return texto.replace('.', ',');
}

/** "2026-10-13" ou ISO completo vira "13/10/2026". */
export function dataCsv(iso: string | null | undefined): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso ?? '');
  return m ? `${m[3]}/${m[2]}/${m[1]}` : '';
}

/** Compara textos sem acento, maiúscula ou espaço sobrando. */
export function normalizarTexto(texto: string | null | undefined): string {
  return (texto ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}
