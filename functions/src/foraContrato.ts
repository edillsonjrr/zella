import { HttpsError } from 'firebase-functions/v2/https';
import type { ItemForaContrato, ItemForaContratoExecutado } from './types';

/**
 * Item fora do contrato (Z3.5): peça ou serviço que não está na planilha do
 * contrato. A prestadora propõe no orçamento, a gestora aprova ou recusa
 * cada um, e a execução registra o que foi usado.
 *
 * Nada aqui toca em saldo. O item não tem `itemContratoId`, então não há
 * item de contrato para separar ou usar: a conta
 * contratada = disponível + reservada + consumida fica como está.
 *
 * Funções puras (sem Firestore), para a validação ser testada sem emulador
 * (test/foraContrato.test.mjs).
 */

export const MAX_ITENS_FORA_CONTRATO = 20;
const MAX_DESCRICAO = 200;
const MAX_UNIDADE = 20;
const MAX_PRECO = 10_000_000;
const MAX_QUANTIDADE = 1_000_000;

function numeroValido(v: unknown, maximo: number): v is number {
  return typeof v === 'number' && Number.isFinite(v) && v > 0 && v <= maximo;
}

function centavos(v: number): number {
  return Math.round(v * 100) / 100;
}

/**
 * Confere o que a tela mandou e devolve os itens prontos para gravar, com
 * id próprio ("fc1", "fc2"...). Sem itens (ausente ou lista vazia), devolve
 * lista vazia.
 */
export function validarItensForaContrato(entrada: unknown): ItemForaContrato[] {
  if (entrada === undefined || entrada === null) return [];
  if (!Array.isArray(entrada)) {
    throw new HttpsError('invalid-argument', 'Lista de itens fora do contrato inválida.');
  }
  if (entrada.length > MAX_ITENS_FORA_CONTRATO) {
    throw new HttpsError('invalid-argument', `No máximo ${MAX_ITENS_FORA_CONTRATO} itens fora do contrato por orçamento.`);
  }
  return entrada.map((bruto, i) => {
    const linha = i + 1;
    const item = (bruto ?? {}) as Record<string, unknown>;
    const descricao = typeof item['descricao'] === 'string' ? item['descricao'].trim().replace(/\s+/g, ' ') : '';
    const unidade = typeof item['unidade'] === 'string' ? item['unidade'].trim() : '';
    if (descricao.length < 3) {
      throw new HttpsError('invalid-argument', `Item fora do contrato ${linha}: escreva a descrição (pelo menos 3 letras).`);
    }
    if (descricao.length > MAX_DESCRICAO) {
      throw new HttpsError('invalid-argument', `Item fora do contrato ${linha}: a descrição passa de ${MAX_DESCRICAO} letras.`);
    }
    if (!unidade || unidade.length > MAX_UNIDADE) {
      throw new HttpsError('invalid-argument', `Item fora do contrato ${linha}: informe a unidade (un, m, h...).`);
    }
    if (!numeroValido(item['quantidade'], MAX_QUANTIDADE)) {
      throw new HttpsError('invalid-argument', `Item fora do contrato ${linha}: a quantidade precisa ser maior que zero.`);
    }
    if (!numeroValido(item['precoUnitario'], MAX_PRECO)) {
      throw new HttpsError('invalid-argument', `Item fora do contrato ${linha}: o preço unitário precisa ser maior que zero.`);
    }
    return {
      id: `fc${linha}`,
      descricao,
      quantidade: item['quantidade'] as number,
      unidade,
      precoUnitario: centavos(item['precoUnitario'] as number)
    };
  });
}

/** Soma quantidade × preço. Com `soAprovados`, só os aprovados pela gestora. */
export function totalForaContrato(itens: ItemForaContrato[] | undefined, soAprovados = false): number {
  return centavos(
    (itens ?? [])
      .filter((i) => !soAprovados || i.decisao === 'Aprovado')
      .reduce((soma, i) => soma + i.quantidade * i.precoUnitario, 0)
  );
}

/**
 * Aplica a decisão da gestora em cada item fora do contrato. Todo item
 * precisa de decisão: aprovar sem olhar o que não está no contrato é o
 * que esta regra existe para evitar.
 */
export function aplicarDecisoes(
  itens: ItemForaContrato[] | undefined,
  decisoes: unknown
): { itens: ItemForaContrato[]; aprovados: number; recusados: number } {
  const lista = itens ?? [];
  if (!lista.length) {
    if (Array.isArray(decisoes) && decisoes.length) {
      throw new HttpsError('invalid-argument', 'Este orçamento não tem itens fora do contrato.');
    }
    return { itens: [], aprovados: 0, recusados: 0 };
  }
  if (!Array.isArray(decisoes)) {
    throw new HttpsError('invalid-argument', 'Decida cada item fora do contrato: aprovar ou recusar.');
  }
  const porId = new Map<string, boolean>();
  for (const bruto of decisoes) {
    const d = (bruto ?? {}) as Record<string, unknown>;
    if (typeof d['id'] !== 'string' || typeof d['aprovado'] !== 'boolean') {
      throw new HttpsError('invalid-argument', 'Decisão de item fora do contrato inválida.');
    }
    if (!lista.some((i) => i.id === d['id'])) {
      throw new HttpsError('invalid-argument', `O item ${d['id']} não está entre os itens fora do contrato deste orçamento.`);
    }
    porId.set(d['id'], d['aprovado']);
  }
  const semDecisao = lista.filter((i) => !porId.has(i.id));
  if (semDecisao.length) {
    throw new HttpsError(
      'invalid-argument',
      `Decida cada item fora do contrato: falta ${semDecisao.map((i) => `"${i.descricao}"`).join(', ')}.`
    );
  }
  const decididos = lista.map((i) => ({ ...i, decisao: (porId.get(i.id) ? 'Aprovado' : 'Recusado') as ItemForaContrato['decisao'] }));
  const aprovados = decididos.filter((i) => i.decisao === 'Aprovado').length;
  return { itens: decididos, aprovados, recusados: decididos.length - aprovados };
}

/**
 * O que a execução registra dos itens fora do contrato aprovados. Quem não
 * vem na lista conta como usado por inteiro, igual aos itens do contrato.
 * Não dá para usar mais que o aprovado: acima disso é outro orçamento.
 */
export function registrarExecucaoForaContrato(
  itens: ItemForaContrato[] | undefined,
  execucao: unknown
): ItemForaContratoExecutado[] {
  const aprovados = (itens ?? []).filter((i) => i.decisao === 'Aprovado');
  const usado = new Map<string, number>(aprovados.map((i) => [i.id, i.quantidade]));
  if (execucao !== undefined && execucao !== null) {
    if (!Array.isArray(execucao)) {
      throw new HttpsError('invalid-argument', 'Lista de itens fora do contrato inválida.');
    }
    for (const bruto of execucao) {
      const e = (bruto ?? {}) as Record<string, unknown>;
      const id = e['id'];
      const qtd = e['quantidadeExecutada'];
      if (typeof id !== 'string' || typeof qtd !== 'number' || !Number.isFinite(qtd) || qtd < 0) {
        throw new HttpsError('invalid-argument', 'Quantidade usada do item fora do contrato precisa ser um número maior ou igual a zero.');
      }
      const item = aprovados.find((i) => i.id === id);
      if (!item) {
        throw new HttpsError('invalid-argument', `O item ${id} não é um item fora do contrato aprovado nesta OS.`);
      }
      if (qtd > item.quantidade) {
        throw new HttpsError('failed-precondition', `Usado acima do aprovado em "${item.descricao}": máximo ${item.quantidade}.`);
      }
      usado.set(id, qtd);
    }
  }
  return aprovados.map((i) => ({
    id: i.id,
    descricao: i.descricao,
    unidade: i.unidade,
    aprovado: i.quantidade,
    executado: usado.get(i.id)!
  }));
}
