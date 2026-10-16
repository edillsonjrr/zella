import type { Contrato } from './models';

/**
 * O contrato escolhido parece cobrir o conserto deste equipamento?
 *
 * Não existe no cadastro um vínculo entre equipamento e item de contrato, então
 * a resposta é uma estimativa, e serve só para AVISAR: a gestora confirma e
 * envia mesmo assim (há caso legítimo, como "Outro (descrever)" ou um serviço
 * que o contrato cobre com outro nome). Nada é bloqueado por aqui.
 *
 * Cobre quando:
 * - o mesmo equipamento já teve OS neste contrato; ou
 * - uma palavra do equipamento aparece nos itens, no fornecedor ou na
 *   empresa contratada; ou
 * - as duas pontas caem na mesma família de conserto (ar-condicionado,
 *   iluminação e elétrica, hidráulica).
 */

// Palavras do mesmo tipo de conserto. Comparadas já sem acento e sem o "s"
// do plural.
const FAMILIAS: string[][] = [
  ['ar', 'split', 'condicionado', 'condicionador', 'climatizador', 'evaporadora', 'condensadora', 'gas', 'filtro', 'btus'],
  ['lampada', 'luminaria', 'luz', 'luzes', 'reator', 'refletor', 'led', 'iluminacao', 'eletrica', 'eletrico', 'tomada', 'disjuntor', 'quadro', 'fiacao'],
  ['hidraulica', 'hidraulico', 'torneira', 'tubulacao', 'cano', 'vazamento', 'bomba', 'agua', 'descarga', 'bebedouro', 'registro', 'pia', 'banheiro', 'esgoto']
];

// Palavras que não dizem o tipo de conserto.
const VAZIAS = new Set([
  'de', 'da', 'do', 'das', 'dos', 'e', 'em', 'na', 'no', 'nas', 'nos', 'com', 'para', 'por', 'um', 'uma',
  'ltda', 'me', 'sa', 'eireli', 'servico', 'manutencao', 'conserto', 'troca', 'limpeza', 'predial',
  'sala', 'bloco', 'unidade', 'corredor', 'outro'
]);

function semPlural(p: string): string {
  return p.length > 4 && p.endsWith('s') ? p.slice(0, -1) : p;
}

export function palavras(texto: string): string[] {
  return texto
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter(p => p.length >= 2 && !/^\d+$/.test(p) && !VAZIAS.has(p))
    .map(semPlural);
}

const FAMILIAS_NORMALIZADAS = FAMILIAS.map(f => new Set(f.map(semPlural)));

export function nomeNormalizado(texto: string): string {
  return palavras(texto).join(' ');
}

export function contratoCobre(
  equipamento: string,
  contrato: Pick<Contrato, 'fornecedor' | 'itens'>,
  opcoes: { nomeContratada?: string; jaAtendeuEsteEquipamento?: boolean } = {}
): boolean {
  if (opcoes.jaAtendeuEsteEquipamento) return true;
  const doEquipamento = palavras(equipamento);
  if (!doEquipamento.length) return true;
  const doContrato = new Set(palavras([contrato.fornecedor, opcoes.nomeContratada ?? '', ...contrato.itens.map(i => i.nome)].join(' ')));
  if (doEquipamento.some(p => doContrato.has(p))) return true;
  return FAMILIAS_NORMALIZADAS.some(f => doEquipamento.some(p => f.has(p)) && [...doContrato].some(p => f.has(p)));
}
