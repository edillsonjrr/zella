import { colecao } from './admin';
import type { Perfil } from './admin';

/**
 * Notificações internas (sino no topo da tela). Cada documento em
 * empresasClientes/{empresa}/notificacoes é endereçado a um perfil inteiro
 * ("todos os gestores") ou a uma pessoa (`usuarioId`), e pode carregar um
 * filtro de contratada, pra que só a contratada da OS receba.
 *
 * E-mail ainda não sai daqui: quando houver provedor (extensão
 * firestore-send-email ou SMTP), basta um trigger em `notificacoes` que
 * traduza cada documento em mensagem. Ver PONTAS-SOLTAS.md A20.
 */
export interface Notificacao {
  id: string;
  // Quem recebe: um perfil (todos daquele perfil na empresa) ou uma pessoa.
  paraPerfil?: Perfil;
  paraUsuarioId?: string;
  // Com perfil de contratada, restringe à empresa contratada indicada.
  empresaContratadaId?: string;
  titulo: string;
  texto: string;
  // Rota do app pra abrir ao clicar (ex.: '/ordens-servico').
  link?: string;
  // Registro que originou, pra agrupar/deduplicar.
  alvo?: { tipo: 'chamado' | 'ordemServico' | 'orcamento' | 'contrato'; id: string; numero?: string };
  data: string;
  // Ids de quem já leu. Documento único por evento; a leitura é por pessoa.
  lidaPor: string[];
}

export type NovaNotificacao = Omit<Notificacao, 'id' | 'data' | 'lidaPor'>;

/** Grava a notificação dentro da transação da ação que a originou. */
export function notificar(tx: FirebaseFirestore.Transaction, empresaId: string, n: NovaNotificacao): void {
  const ref = colecao(empresaId, 'notificacoes').doc();
  tx.set(ref, montar(ref.id, n));
}

/** Versão fora de transação (batches, jobs agendados). */
export async function notificarAgora(empresaId: string, n: NovaNotificacao): Promise<void> {
  const ref = colecao(empresaId, 'notificacoes').doc();
  await ref.set(montar(ref.id, n));
}

function montar(id: string, n: NovaNotificacao): Notificacao {
  return { id, ...n, data: new Date().toISOString(), lidaPor: [] };
}
