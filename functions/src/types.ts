// Espelha frontend/src/app/shared/models.ts — mesmos nomes de campo, em
// português, pra minimizar tradução quando o frontend consumir Firestore
// de verdade.

export type PerfilUsuario = 'cliente' | 'gestor' | 'gestor_contratado' | 'tecnico';

export interface Unidade {
  id: string;
  nome: string;
  sigla: string;
}

export interface ItemContrato {
  id: string;
  // Repetido no item porque a leitura por collection group só filtra por campo.
  empresaId: string;
  nome: string;
  unidadeMedida: string;
  quantidadeContratada: number;
  quantidadeDisponivel: number;
  quantidadeReservada: number;
  quantidadeConsumida: number;
  precoUnitario: number;
}

export interface Contrato {
  id: string;
  numero: string;
  fornecedor: string;
  // Empresa contratada dona do contrato: é o que limita gestor contratado e
  // técnico ao que é deles.
  empresaContratadaId?: string;
  vigenciaInicio: string;
  vigenciaFim: string;
  status: 'Ativo' | 'Crítico' | 'Encerrado';
  // Quantos aditivos o contrato já recebeu (ver aditivos.ts).
  totalAditivos?: number;
}

// Aditivo: a única forma de mudar quantidade contratada ou vigência depois
// que o contrato existe. Fica em contratos/{id}/aditivos, numerado.
export interface AditivoContrato {
  id: string;
  numero: number;
  contratoId: string;
  data: string;
  motivo: string;
  vigenciaFim?: { de: string; para: string };
  itens: {
    itemContratoId: string;
    nome: string;
    quantidadeContratada: { de: number; para: number };
  }[];
  autorUid: string;
  autorNome: string;
}

export type SituacaoChamado = 'Aberto' | 'Em atendimento' | 'Convertido' | 'Cancelado';
export type StatusChamado =
  | 'Aberto'
  | 'Em atendimento'
  | 'Em orçamento'
  | 'Orçamento aprovado'
  | 'A ser finalizado'
  | 'Executado'
  | 'Encerrado'
  | 'Cancelado';

export interface Chamado {
  id: string;
  numero: string;
  titulo: string;
  equipamento: string;
  numeroSerie?: string;
  descricao: string;
  unidadeId: string;
  solicitanteId: string;
  solicitanteNome: string;
  situacao: SituacaoChamado;
  status: StatusChamado;
  dataCriacao: string;
  dataVencimento?: string;
  dataFechamento?: string;
  responsavelId?: string;
  ordemServicoId?: string;
  possuiFoto: boolean;
  // Caminho no Storage (a URL é resolvida pelo app com o token do usuário).
  fotoPath?: string;
  origem?: 'manual' | 'preventiva';
  planoId?: string;
}

export interface PlanoManutencao {
  id: string;
  nome: string;
  equipamentoId: string;
  periodicidadeDias: number;
  proximaExecucao: string;
  ultimaExecucao?: string;
  antecedenciaDias: number;
  contratoId?: string;
  itemContratoId?: string;
  quantidadePrevista?: number;
  ativo: boolean;
}

export interface OrcamentoItem {
  itemContratoId: string;
  nome: string;
  quantidade: number;
  precoUnitario: number;
}

// Substituído: orçamento pendente que foi reenviado antes de ser decidido.
export type SituacaoOrcamento = 'Pendente' | 'Aprovado' | 'Rejeitado' | 'Substituído';

export interface Orcamento {
  id: string;
  osId: string;
  // Copiado da OS: a regra de leitura filtra por campo, não por junção.
  empresaContratadaId?: string;
  situacao: SituacaoOrcamento;
  itens: OrcamentoItem[];
  dataCriacao: string;
}

export type SituacaoOS = 'Aberta' | 'Em vistoria' | 'Aprovada' | 'Rejeitada' | 'Executada' | 'Encerrada' | 'Cancelada';

export interface OrdemServico {
  id: string;
  numero: string;
  chamadoId: string;
  contratoId: string;
  // Copiados do chamado e do contrato na criação: é por eles que as rules
  // limitam o cliente à própria unidade e a contratada às próprias OS.
  unidadeId?: string;
  empresaContratadaId?: string;
  tecnicoId?: string;
  situacao: SituacaoOS;
  orcamentoId?: string;
  dataCriacao: string;
}

export interface Usuario {
  id: string;
  nome: string;
  email: string;
  perfil: PerfilUsuario;
  unidadeId?: string;
  empresaContratadaId?: string;
}
