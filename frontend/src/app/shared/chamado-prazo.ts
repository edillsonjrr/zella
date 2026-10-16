import type { Chamado } from './models';

// Status em que o chamado já não corre contra o prazo: serviço feito,
// encerrado ou cancelado. Cancelado entra porque o pedido deixou de existir;
// contar como atraso um chamado que ninguém vai atender inflava o "Em atraso"
// do Painel gerencial.
const SEM_PRAZO_CORRENDO: Chamado['status'][] = ['Executado', 'Encerrado', 'Cancelado'];

/** Dias corridos entre a data (YYYY-MM-DD, hora local) e hoje. */
export function diasDesde(dataIso: string, hoje = new Date()): number {
  const [ano, mes, dia] = dataIso.split('-').map(Number);
  const data = new Date(ano, mes - 1, dia).setHours(0, 0, 0, 0);
  const inicioHoje = new Date(hoje).setHours(0, 0, 0, 0);
  return Math.round((inicioHoje - data) / 86400000);
}

/** Ainda há trabalho a fazer: não foi executado, encerrado nem cancelado. */
export function chamadoEmAndamento(chamado: Pick<Chamado, 'status'>): boolean {
  return !SEM_PRAZO_CORRENDO.includes(chamado.status);
}

/**
 * Atrasado: o prazo (dataVencimento) já passou e o chamado ainda não foi
 * executado, encerrado nem cancelado. O prazo é gravado na abertura pelas
 * functions: data de abertura + prazo de atendimento da empresa (5 dias se
 * ninguém mudou); na preventiva, a data prevista do serviço.
 *
 * É a mesma função no Painel gerencial e no filtro da lista (?atraso=1), e é
 * isso que mantém o número do cartão igual ao total da lista filtrada.
 */
export function chamadoEmAtraso(chamado: Pick<Chamado, 'dataVencimento' | 'status'>, hoje = new Date()): boolean {
  return !!chamado.dataVencimento && diasDesde(chamado.dataVencimento, hoje) > 0 && chamadoEmAndamento(chamado);
}

// Contra qual prazo o atraso é medido (dica do painel e da lista).
export const EXPLICACAO_PRAZO =
  'O prazo é a data de abertura mais o prazo de atendimento da empresa (5 dias, se não foi mudado). ' +
  'Na manutenção preventiva, é a data prevista do serviço. Chamado cancelado não conta como atraso.';

export interface PrazoChamado {
  // "Prazo: até 18/10"
  texto: string;
  // "até 18/10/2026", para o campo do detalhe.
  data: string;
  atrasado: boolean;
}

/**
 * Prazo do chamado em palavras, pela mesma regra do atraso. Sem
 * dataVencimento (chamados antigos), não há prazo para mostrar.
 */
export function prazoDoChamado(chamado: Pick<Chamado, 'dataVencimento' | 'status'>, hoje = new Date()): PrazoChamado | null {
  if (!chamado.dataVencimento) return null;
  const [ano, mes, dia] = chamado.dataVencimento.split('-');
  if (!ano || !mes || !dia) return null;
  const curto = ano === String(hoje.getFullYear()) ? `${dia}/${mes}` : `${dia}/${mes}/${ano}`;
  return {
    texto: `Prazo: até ${curto}`,
    data: `até ${dia}/${mes}/${ano}`,
    atrasado: chamadoEmAtraso(chamado, hoje)
  };
}
