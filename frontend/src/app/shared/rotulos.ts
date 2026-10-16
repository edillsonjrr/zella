import type { PerfilEmpresa, PerfilUsuario, StatusChamado, Unidade, UrgenciaChamado } from './models';

/**
 * Rótulos que a pessoa vê na tela. Os valores gravados no banco continuam os
 * mesmos ('cliente', 'gestor_contratado', 'PAT-0021'...): só o texto mostrado
 * passa por aqui, para o mesmo termo aparecer igual em todas as telas.
 */

export const ROTULO_PERFIL: Record<PerfilUsuario, string> = {
  cliente: 'Solicitante',
  gestor: 'Gestor',
  gestor_contratado: 'Responsável da contratada',
  tecnico: 'Técnico',
  admin_plataforma: 'Admin da plataforma',
  convidado: 'Convidado'
};

export function rotuloPerfil(perfil: string | null | undefined): string {
  if (!perfil) return '';
  return ROTULO_PERFIL[perfil as PerfilUsuario] ?? perfil;
}

// Perfis que o gestor cadastra, na ordem do formulário de usuário.
export const PERFIS_CADASTRAVEIS: { value: PerfilEmpresa; label: string }[] = (
  ['cliente', 'gestor', 'gestor_contratado', 'tecnico'] as const
).map(value => ({ value, label: ROTULO_PERFIL[value] }));

// Legenda de uma linha para os três números do saldo de um item de contrato.
export const LEGENDA_SALDO = 'Separado: aprovado, esperando o serviço · Usado: serviço feito · Livre: o que ainda pode ser usado';

// Nome da unidade no lugar da sigla (SAM, TAG...), que só quem cadastrou conhece.
export function nomeUnidade(unidade: Pick<Unidade, 'nome' | 'sigla'> | null | undefined, vazio = '—'): string {
  return unidade?.nome || unidade?.sigla || vazio;
}

// Dica para onde o nome aparece cortado: nome inteiro e a sigla ao lado.
export function dicaUnidade(unidade: Pick<Unidade, 'nome' | 'sigla'> | null | undefined): string {
  if (!unidade) return '';
  return unidade.sigla && unidade.sigla !== unidade.nome ? `${unidade.nome} (${unidade.sigla})` : unidade.nome;
}

// "PAT-0021" gravado vira "Patrimônio nº 0021" na tela e na plaqueta.
export function rotuloPatrimonio(codigo: string | null | undefined): string {
  const texto = (codigo ?? '').trim();
  if (!texto) return '';
  const numero = texto.replace(/^pat[\s._-]*/i, '');
  return `Patrimônio nº ${numero || texto}`;
}

/* Pedido (chamado) visto por quem pediu ---------------------------------- */

export const ROTULO_URGENCIA: Record<UrgenciaChamado, string> = {
  baixa: 'Pode esperar',
  media: 'Atrapalha o trabalho',
  alta: 'Urgente'
};

// Opções do campo "Urgência", na ordem do formulário, com uma frase de ajuda.
export const OPCOES_URGENCIA: { valor: UrgenciaChamado; rotulo: string; ajuda: string }[] = [
  { valor: 'baixa', rotulo: ROTULO_URGENCIA.baixa, ajuda: 'Dá para continuar usando o local.' },
  { valor: 'media', rotulo: ROTULO_URGENCIA.media, ajuda: 'Atrapalha, mas não para o trabalho.' },
  { valor: 'alta', rotulo: ROTULO_URGENCIA.alta, ajuda: 'Risco para alguém ou trabalho parado.' }
];

export function rotuloUrgencia(urgencia: UrgenciaChamado | null | undefined): string {
  return urgencia ? ROTULO_URGENCIA[urgencia] ?? '' : '';
}

export interface SituacaoPedido {
  // Rótulo curto do selo: o mesmo nome da lista da gestão, da contratada e do
  // técnico (shared/situacao.ts, "selo"). Antes a solicitante via "Recebido",
  // "Com a empresa contratada" e "Concluído" para o que os outros chamavam de
  // "Novo", "Aguardando orçamento" e "Encerrado". Quem age vai na frase.
  rotulo: string;
  // Quem age agora, em uma frase.
  agora: string;
  // Cor do selo: andamento, espera, feito, cancelado.
  tom: 'andamento' | 'espera' | 'feito' | 'cancelado';
  // Classe da pílula, pela tabela de cores única (styles.scss, .badge):
  // a mesma etapa tem a mesma cor aqui e na lista da gestão.
  classe: string;
}

/** O status gravado do chamado, dito para quem pediu o conserto. */
export function situacaoDoPedido(status: StatusChamado): SituacaoPedido {
  switch (status) {
    case 'Aberto':
      return { rotulo: 'Novo', agora: 'A gestão vai encaminhar seu pedido para a empresa contratada.', tom: 'espera', classe: 'badge--aberta' };
    case 'Em atendimento':
      return { rotulo: 'Aguardando orçamento', agora: 'A empresa contratada vai avaliar o conserto e mandar o orçamento.', tom: 'andamento', classe: 'badge--vistoria' };
    case 'Em orçamento':
      return { rotulo: 'Aguardando aprovação', agora: 'A gestão está analisando o orçamento da empresa contratada.', tom: 'andamento', classe: 'badge--vistoria' };
    case 'Orçamento aprovado':
    case 'A ser finalizado':
      return { rotulo: 'Aprovado', agora: 'O conserto foi aprovado. O técnico vai fazer o serviço.', tom: 'andamento', classe: 'badge--aprovada' };
    case 'Executado':
      return { rotulo: 'Serviço feito', agora: 'O técnico registrou o serviço. Falta a gestão conferir e encerrar.', tom: 'feito', classe: 'badge--executada' };
    case 'Encerrado':
      return { rotulo: 'Encerrado', agora: 'Serviço feito e conferido pela gestão.', tom: 'feito', classe: 'badge--encerrada' };
    case 'Cancelado':
      return { rotulo: 'Cancelado', agora: 'Este pedido foi cancelado. Se o problema continuar, faça um novo pedido.', tom: 'cancelado', classe: 'badge--neutra' };
  }
}
