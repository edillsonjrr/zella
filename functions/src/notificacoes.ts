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

/**
 * Quem abriu o chamado recebe aviso a cada etapa (OS criada, orçamento
 * aprovado, serviço feito, encerrado ou cancelado). Só quem tem cadastro:
 * o convidado do QR Code e a preventiva automática ('sistema') não têm sino.
 *
 * É uma leitura: numa transação do Firestore ela precisa vir antes de
 * qualquer escrita, então cada ação chama isto junto das outras leituras e
 * guarda o resultado para `avisarSolicitante`.
 */
export interface SolicitanteAvisavel {
  usuarioId: string;
  perfil: string;
}

export async function lerSolicitante(
  tx: FirebaseFirestore.Transaction,
  empresaId: string,
  chamado: FirebaseFirestore.DocumentData | undefined
): Promise<SolicitanteAvisavel | null> {
  const id = chamado?.['solicitanteId'];
  if (typeof id !== 'string' || !id || id === 'sistema') return null;
  const snap = await tx.get(colecao(empresaId, 'usuarios').doc(id));
  if (!snap.exists) return null;
  return { usuarioId: id, perfil: (snap.data()?.['perfil'] as string | undefined) ?? '' };
}

/**
 * Grava o aviso para quem abriu o chamado. Não avisa a própria pessoa que
 * fez a ação (a gestora que abriu e encerrou o próprio chamado, por exemplo).
 */
export function avisarSolicitante(
  tx: FirebaseFirestore.Transaction,
  empresaId: string,
  solicitante: SolicitanteAvisavel | null,
  autorUsuarioId: string | undefined,
  chamado: { id: string; numero: string },
  aviso: { titulo: string; texto: string }
): void {
  if (!solicitante || solicitante.usuarioId === autorUsuarioId) return;
  // A solicitante acompanha pela tela "Meus pedidos"; os demais perfis, pela
  // lista de chamados do Início.
  const link = solicitante.perfil === 'cliente' ? `/meus-pedidos?pedido=${chamado.id}` : `/dashboard?chamado=${chamado.id}`;
  notificar(tx, empresaId, {
    paraUsuarioId: solicitante.usuarioId,
    titulo: aviso.titulo,
    texto: aviso.texto,
    link,
    alvo: { tipo: 'chamado', id: chamado.id, numero: chamado.numero }
  });
}
