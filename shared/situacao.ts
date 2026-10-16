/**
 * Uma máquina de situações só para o chamado e a OS (Z0.3).
 *
 * O banco continua gravando os dois campos de sempre: `status` no chamado e
 * `situacao` na OS, com os valores de antes. Esta função só decide o que a
 * tela mostra, para o chamado e a OS falarem a mesma língua e cada situação
 * dizer quem age agora.
 *
 * Duas regras que a tela não tinha:
 * - "Em vistoria" (OS) e "Em orçamento" (chamado) se dividem pelo orçamento:
 *   sem orçamento pendente, "Aguardando orçamento"; com orçamento pendente,
 *   "Aguardando aprovação da gestão" ("Aguardando sua aprovação" para a
 *   gestora).
 * - "Orçamento aprovado" e "A ser finalizado" são a mesma etapa (a function
 *   grava "A ser finalizado" ao aprovar; o outro valor só existe em dados
 *   antigos) e aparecem juntas como "Aprovado, aguardando o serviço".
 *
 * Código puro, sem dependência: compila no app e nas functions, e o teste
 * (functions/test/situacao.test.mjs) confere as regras sem emulador.
 */
import type { PerfilUsuario, SituacaoOS, SituacaoOrcamento, StatusChamado } from './dominio';

export type ChaveSituacao =
  | 'novo'
  | 'aguardando-orcamento'
  | 'orcamento-recusado'
  | 'aguardando-aprovacao'
  | 'aprovado'
  | 'servico-feito'
  | 'encerrado'
  | 'cancelado';

// Quem precisa fazer alguma coisa para o serviço andar.
export type QuemAge = 'gestao' | 'contratada' | 'tecnico' | 'ninguem';

export interface SituacaoServico {
  chave: ChaveSituacao;
  // Texto do selo. Muda com o perfil só onde a pessoa é quem age
  // ("Aguardando sua aprovação").
  rotulo: string;
  // Texto curto da pílula de status: cabe numa linha em qualquer tabela.
  // O rótulo por extenso fica no título do grupo e o "agora" na dica.
  selo: string;
  // Quem age agora, numa frase.
  agora: string;
  quemAge: QuemAge;
  // Ordem no fluxo, para agrupar e ordenar listas.
  ordem: number;
  // Tom do selo: espera (alguém precisa agir), andamento, feito, cancelado.
  tom: 'espera' | 'andamento' | 'feito' | 'cancelado';
  icone: string;
}

export interface EntradaSituacao {
  chamado?: { status: StatusChamado } | null;
  os?: { situacao: SituacaoOS; orcamentoId?: string } | null;
  // Orçamento atual da OS, quando o perfil consegue ler. Sem ele, uma OS
  // "Em vistoria" que aponta para um orçamento conta como pendente: é o único
  // jeito de a OS chegar a esse estado com `orcamentoId`.
  orcamento?: { situacao: SituacaoOrcamento } | null;
  perfil?: PerfilUsuario | string | null;
}

const BASE: Record<ChaveSituacao, Omit<SituacaoServico, 'chave'>> = {
  novo: {
    rotulo: 'Novo chamado',
    selo: 'Novo',
    agora: 'Agora: a gestão envia o pedido para a empresa contratada.',
    quemAge: 'gestao',
    ordem: 0,
    tom: 'espera',
    icone: 'radio_button_checked'
  },
  'aguardando-orcamento': {
    rotulo: 'Aguardando orçamento',
    selo: 'Aguardando orçamento',
    agora: 'Agora: a empresa contratada avalia o conserto e manda o orçamento.',
    quemAge: 'contratada',
    ordem: 1,
    tom: 'andamento',
    icone: 'engineering'
  },
  'orcamento-recusado': {
    rotulo: 'Orçamento recusado',
    selo: 'Orçamento recusado',
    agora: 'Agora: a empresa contratada revê os itens e manda um novo orçamento.',
    quemAge: 'contratada',
    ordem: 2,
    tom: 'andamento',
    icone: 'cancel'
  },
  'aguardando-aprovacao': {
    rotulo: 'Aguardando aprovação da gestão',
    selo: 'Aguardando aprovação',
    agora: 'Agora: a gestão confere o orçamento e aprova ou recusa.',
    quemAge: 'gestao',
    ordem: 3,
    tom: 'espera',
    icone: 'request_quote'
  },
  aprovado: {
    rotulo: 'Aprovado, aguardando o serviço',
    selo: 'Aprovado',
    agora: 'Agora: o técnico faz o serviço e registra como feito.',
    quemAge: 'tecnico',
    ordem: 4,
    tom: 'andamento',
    icone: 'pending_actions'
  },
  'servico-feito': {
    rotulo: 'Serviço feito, aguardando encerramento',
    selo: 'Serviço feito',
    agora: 'Agora: a gestão confere o serviço e encerra o chamado.',
    quemAge: 'gestao',
    ordem: 5,
    tom: 'espera',
    icone: 'construction'
  },
  encerrado: {
    rotulo: 'Encerrado',
    selo: 'Encerrado',
    agora: 'Encerrado: a gestão conferiu o serviço. Ninguém precisa agir.',
    quemAge: 'ninguem',
    ordem: 6,
    tom: 'feito',
    icone: 'task_alt'
  },
  cancelado: {
    rotulo: 'Cancelado',
    selo: 'Cancelado',
    agora: 'Cancelado: ninguém precisa agir. Se o problema voltar, abra um novo chamado.',
    quemAge: 'ninguem',
    ordem: 7,
    tom: 'cancelado',
    icone: 'block'
  }
};

// Quando quem olha é quem age, o texto fala com a pessoa.
const PARA_QUEM_AGE: Partial<Record<ChaveSituacao, Partial<Record<string, Partial<Pick<SituacaoServico, 'rotulo' | 'agora'>>>>>> = {
  novo: {
    gestor: { agora: 'Agora: você envia o pedido para a empresa contratada (cria a OS).' }
  },
  'aguardando-orcamento': {
    gestor_contratado: { agora: 'Agora: sua empresa avalia o conserto e manda o orçamento.' },
    tecnico: { agora: 'Agora: a sua empresa manda o orçamento para a gestão aprovar.' }
  },
  'orcamento-recusado': {
    gestor_contratado: { agora: 'Agora: sua empresa revê os itens e manda um novo orçamento.' }
  },
  'aguardando-aprovacao': {
    gestor: { rotulo: 'Aguardando sua aprovação', agora: 'Agora: você confere os itens e aprova ou recusa o orçamento.' }
  },
  aprovado: {
    tecnico: { agora: 'Agora: você faz o serviço e registra como feito.' },
    gestor_contratado: { agora: 'Agora: o técnico da sua empresa faz o serviço e registra como feito.' }
  },
  'servico-feito': {
    gestor: { rotulo: 'Serviço feito: confira e encerre', agora: 'Agora: você confere o serviço e encerra o chamado.' }
  }
};

/**
 * A diferença entre as duas etapas finais, numa frase, para legenda e dica.
 * ("Orçamento aprovado" e "A ser finalizado" não precisam de frase: viraram
 * uma só, "Aprovado, aguardando o serviço".)
 */
export const EXPLICACAO_FIM =
  'Serviço feito: o técnico registrou o serviço e falta a gestão conferir. Encerrado: a gestão conferiu e fechou o chamado, que não muda mais.';

export const CHAVES_SITUACAO: ChaveSituacao[] = [
  'novo',
  'aguardando-orcamento',
  'orcamento-recusado',
  'aguardando-aprovacao',
  'aprovado',
  'servico-feito',
  'encerrado',
  'cancelado'
];

function chaveDa(e: EntradaSituacao): ChaveSituacao {
  const status = e.chamado?.status;
  const situacao = e.os?.situacao;

  if (status === 'Cancelado' || situacao === 'Cancelada') return 'cancelado';
  if (status === 'Encerrado' || situacao === 'Encerrada') return 'encerrado';
  if (status === 'Executado' || situacao === 'Executada') return 'servico-feito';
  if (status === 'Orçamento aprovado' || status === 'A ser finalizado' || situacao === 'Aprovada') return 'aprovado';

  // Orçamento pendente: o que a gestora tem para decidir. Sem acesso ao
  // orçamento (a solicitante não lê orçamentos), vale o que a OS e o chamado
  // dizem: "Em vistoria" com orçamento apontado e "Em orçamento" só existem
  // depois que a contratada enviou um.
  const pendente = e.orcamento
    ? e.orcamento.situacao === 'Pendente'
    : (situacao === 'Em vistoria' && !!e.os?.orcamentoId) || (!e.os && status === 'Em orçamento');
  if (pendente && situacao !== 'Rejeitada') return 'aguardando-aprovacao';
  if (situacao === 'Rejeitada' || e.orcamento?.situacao === 'Rejeitado') return 'orcamento-recusado';
  if (situacao === 'Aberta' || situacao === 'Em vistoria' || status === 'Em atendimento' || status === 'Em orçamento') return 'aguardando-orcamento';
  return 'novo';
}

export function situacaoDoServico(e: EntradaSituacao): SituacaoServico {
  const chave = chaveDa(e);
  const ajuste = e.perfil ? PARA_QUEM_AGE[chave]?.[e.perfil] : undefined;
  return { chave, ...BASE[chave], ...(ajuste ?? {}) };
}

/** Rótulo genérico (sem falar com ninguém), para filtros e legendas. */
export function rotuloDaChave(chave: ChaveSituacao, perfil?: PerfilUsuario | string | null): string {
  const ajuste = perfil ? PARA_QUEM_AGE[chave]?.[perfil] : undefined;
  return ajuste?.rotulo ?? BASE[chave].rotulo;
}

/** "Quem age agora" de uma situação, com o texto de quem olha. */
export function agoraDaChave(chave: ChaveSituacao, perfil?: PerfilUsuario | string | null): string {
  const ajuste = perfil ? PARA_QUEM_AGE[chave]?.[perfil] : undefined;
  return ajuste?.agora ?? BASE[chave].agora;
}

export function ordemDaChave(chave: ChaveSituacao): number {
  return BASE[chave].ordem;
}
