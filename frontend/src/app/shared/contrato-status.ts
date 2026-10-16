import type { Contrato, ItemContrato } from './models';

// Status exibido do contrato, calculado — nunca lido do documento. O campo
// `status` gravado só distingue 'Encerrado' (decisão do gestor); "Crítico"
// e "Ativo" saem do saldo e da vigência no momento da leitura.
export type StatusContratoCalculado = 'Ativo' | 'Crítico' | 'Vencido' | 'Encerrado';

export interface SituacaoContrato {
  status: StatusContratoCalculado;
  // Texto curto pro badge quando há algo a fazer ("Vence em 12 dias",
  // "Saldo baixo: Filtro de ar"). Vazio quando está tudo bem.
  aviso: string;
  diasParaVencer: number | null;
}

// Item com 10% ou menos do contratado ainda disponível.
export const LIMITE_SALDO_CRITICO = 0.1;

/**
 * Saldo baixo: 10% ou menos do contratado ainda livre. É a regra que deixa o
 * contrato "Crítico" e a que conta os itens da coluna "Itens com saldo
 * baixo" da lista de contratos.
 */
export function itemComSaldoBaixo(item: Pick<ItemContrato, 'quantidadeContratada' | 'quantidadeDisponivel'>): boolean {
  return item.quantidadeContratada > 0 && item.quantidadeDisponivel / item.quantidadeContratada <= LIMITE_SALDO_CRITICO;
}

export const EXPLICACAO_SALDO_BAIXO = `Item com ${Math.round(LIMITE_SALDO_CRITICO * 100)}% ou menos do contratado ainda livre.`;
// Contrato a 30 dias ou menos do fim da vigência.
export const DIAS_VIGENCIA_CRITICA = 30;

export function situacaoContrato(contrato: Pick<Contrato, 'status' | 'vigenciaFim' | 'itens'>, hoje = new Date()): SituacaoContrato {
  if (contrato.status === 'Encerrado') {
    return { status: 'Encerrado', aviso: '', diasParaVencer: null };
  }

  let diasParaVencer: number | null = null;
  if (contrato.vigenciaFim) {
    const fim = new Date(`${contrato.vigenciaFim}T00:00:00`);
    const inicioHoje = new Date(hoje.getFullYear(), hoje.getMonth(), hoje.getDate());
    diasParaVencer = Math.round((fim.getTime() - inicioHoje.getTime()) / 86400000);
  }

  if (diasParaVencer !== null && diasParaVencer < 0) {
    return { status: 'Vencido', aviso: 'Vencido', diasParaVencer };
  }

  const itensBaixos = contrato.itens.filter(itemComSaldoBaixo);

  if (diasParaVencer !== null && diasParaVencer <= DIAS_VIGENCIA_CRITICA) {
    const aviso = diasParaVencer === 0 ? 'Vence hoje' : `Vence em ${diasParaVencer} dia${diasParaVencer === 1 ? '' : 's'}`;
    return { status: 'Crítico', aviso, diasParaVencer };
  }

  if (itensBaixos.length) {
    const nomes = itensBaixos.map(i => i.nome);
    const aviso = nomes.length === 1 ? `Saldo baixo: ${nomes[0]}` : `Saldo baixo em ${nomes.length} itens`;
    return { status: 'Crítico', aviso, diasParaVencer };
  }

  return { status: 'Ativo', aviso: '', diasParaVencer };
}
