import type { ItemContrato, Orcamento, OrdemServico } from './models';

/**
 * Contas do saldo de um item de contrato, escritas para quem lê.
 *
 * A regra que as Cloud Functions mantêm é:
 *   contratado = livre (disponível) + separado (reservado) + usado (consumido)
 * As telas mostram a conta por extenso para quem confere poder refazer.
 */

type ItemSaldo = Pick<ItemContrato, 'quantidadeContratada' | 'quantidadeDisponivel' | 'quantidadeReservada' | 'quantidadeConsumida' | 'unidadeMedida'>;

const numero = new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 2 });

/** "12 un", "2,5 kg". */
export function quantidade(valor: number, unidade?: string): string {
  const n = numero.format(Number(valor) || 0);
  return unidade ? `${n} ${unidade}` : n;
}

/** "Contratado 1.000 un = Usado 0 un + Separado 50 un + Livre 950 un" */
export function contaSaldo(item: ItemSaldo): string {
  const u = item.unidadeMedida;
  return (
    `Contratado ${quantidade(item.quantidadeContratada, u)} = ` +
    `Usado ${quantidade(item.quantidadeConsumida, u)} + ` +
    `Separado ${quantidade(item.quantidadeReservada, u)} + ` +
    `Livre ${quantidade(item.quantidadeDisponivel, u)}`
  );
}

/**
 * Quanto falta (positivo) ou sobra (negativo) para a conta fechar. Zero é o
 * normal; diferente de zero só aparece em dado antigo, de antes da correção
 * das functions, e a tela avisa em vez de esconder.
 */
export function diferencaDaConta(item: ItemSaldo): number {
  const soma = item.quantidadeDisponivel + item.quantidadeReservada + item.quantidadeConsumida;
  return Math.round((item.quantidadeContratada - soma) * 100) / 100;
}

export function avisoContaNaoFecha(item: ItemSaldo): string {
  const diferenca = diferencaDaConta(item);
  if (!diferenca) return '';
  const quanto = quantidade(Math.abs(diferenca), item.unidadeMedida);
  return diferenca > 0
    ? `A conta deste item não fecha: faltam ${quanto}. Avise o suporte para corrigir.`
    : `A conta deste item não fecha: sobram ${quanto}. Avise o suporte para corrigir.`;
}

export const FORMULA_UTILIZACAO =
  'Utilização = (Usado + Separado) ÷ Contratado. Mostra quanto do contratado já foi usado ou está separado para um serviço aprovado.';

export const FORMULA_UTILIZACAO_CONTRATO =
  'Utilização do contrato = (Usado + Separado) ÷ Contratado, somando o valor em reais (quantidade × preço) de cada item. ' +
  'É em reais porque os itens têm unidades diferentes (un, kg, h).';

/** Percentual inteiro de (usado + separado) ÷ contratado. */
export function utilizacao(item: Pick<ItemContrato, 'quantidadeContratada' | 'quantidadeReservada' | 'quantidadeConsumida'>): number {
  if (!item.quantidadeContratada) return 0;
  return Math.round(((item.quantidadeConsumida + item.quantidadeReservada) / item.quantidadeContratada) * 100);
}

/** Utilização do contrato em valor: soma (usado + separado) × preço sobre contratado × preço. */
export function utilizacaoEmValor(itens: Pick<ItemContrato, 'quantidadeContratada' | 'quantidadeReservada' | 'quantidadeConsumida' | 'precoUnitario'>[]): number | null {
  const total = itens.reduce((s, i) => s + i.quantidadeContratada * (i.precoUnitario || 0), 0);
  if (!total) return null;
  const comprometido = itens.reduce((s, i) => s + (i.quantidadeConsumida + i.quantidadeReservada) * (i.precoUnitario || 0), 0);
  return Math.round((comprometido / total) * 100);
}

/* Histórico de uso de um item --------------------------------------------- */

export type SituacaoUso = 'Separado' | 'Usado' | 'Devolvido';

export interface UsoDoItem {
  osId: string;
  osNumero: string;
  // YYYY-MM-DD: aprovação (separado), execução (usado) ou aprovação da OS
  // cancelada depois (devolvido).
  data: string;
  quantidade: number;
  situacao: SituacaoUso;
  // Frase curta para a coluna "Situação".
  descricao: string;
}

/**
 * OS que separaram ou usaram o item, a partir das OS e dos orçamentos que a
 * sessão já lê (as mesmas regras por perfil de firestore.rules). Só entram
 * orçamentos aprovados: orçamento pendente, recusado ou substituído nunca
 * mexeu no saldo.
 *
 * - OS Aprovada: a quantidade aprovada está separada.
 * - OS Executada ou Encerrada: o executado foi usado (a sobra voltou ao livre).
 * - OS Cancelada depois de aprovada: o separado voltou ao livre.
 */
export function historicoDeUso(
  contratoId: string,
  itemId: string,
  ordens: OrdemServico[],
  orcamentoDaOS: (os: OrdemServico) => Orcamento | undefined
): UsoDoItem[] {
  const usos: UsoDoItem[] = [];
  for (const os of ordens) {
    if (os.contratoId !== contratoId) continue;
    const orc = orcamentoDaOS(os);
    const aprovado = orc?.situacao === 'Aprovado'
      ? orc.itens.filter(l => l.itemContratoId === itemId).reduce((s, l) => s + l.quantidade, 0)
      : 0;
    const dataAprovacao = orc?.dataAprovacao ?? orc?.dataCriacao ?? os.dataCriacao;

    if (os.situacao === 'Executada' || os.situacao === 'Encerrada') {
      const exec = os.itensExecutados?.find(e => e.itemContratoId === itemId);
      const usado = exec ? exec.executado : aprovado;
      if (!usado && !exec) continue;
      const sobra = exec ? Math.max(0, exec.orcado - exec.executado) : 0;
      usos.push({
        osId: os.id,
        osNumero: os.numero,
        data: os.dataExecucao ?? dataAprovacao,
        quantidade: usado,
        situacao: 'Usado',
        descricao: sobra ? `Usado; ${quantidade(sobra)} ${sobra === 1 ? 'voltou' : 'voltaram'} ao livre` : 'Usado'
      });
      continue;
    }
    if (!aprovado) continue;
    if (os.situacao === 'Aprovada') {
      usos.push({ osId: os.id, osNumero: os.numero, data: dataAprovacao, quantidade: aprovado, situacao: 'Separado', descricao: 'Separado, esperando o serviço' });
    } else if (os.situacao === 'Cancelada') {
      usos.push({ osId: os.id, osNumero: os.numero, data: dataAprovacao, quantidade: aprovado, situacao: 'Devolvido', descricao: 'OS cancelada; voltou ao livre' });
    }
  }
  return usos.sort((a, b) => b.data.localeCompare(a.data) || b.osNumero.localeCompare(a.osNumero));
}
