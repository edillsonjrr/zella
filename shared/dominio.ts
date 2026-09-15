/**
 * Tipos do domínio compartilhados entre o frontend (Angular) e as Cloud
 * Functions. Fonte única: `frontend/src/app/shared/models.ts` e
 * `functions/src/types.ts` só reexportam daqui (e acrescentam o que é
 * exclusivo de cada lado).
 *
 * Só tipos e interfaces — nada de código executável — pra compilar igual
 * nos dois projetos.
 */

/* Perfis ---------------------------------------------------------------- */

// Perfis cadastráveis em `usuarios`. 'convidado' (sessão anônima do QR Code)
// e 'admin_plataforma' (operador da plataforma) existem só na sessão.
export type PerfilEmpresa = 'cliente' | 'gestor' | 'gestor_contratado' | 'tecnico';
export type PerfilUsuario = PerfilEmpresa | 'convidado' | 'admin_plataforma';

/* Estrutura física -------------------------------------------------------- */

export interface Unidade {
  id: string;
  nome: string;
  sigla: string;
}

export interface Bloco {
  id: string;
  unidadeId: string;
  nome: string;
}

// Uma sala pertence sempre a uma unidade; o bloco é opcional — a unidade
// pode ter salas soltas, sem passar por um bloco.
export interface Sala {
  id: string;
  unidadeId: string;
  blocoId?: string;
  nome: string;
}

export interface Equipamento {
  id: string;
  unidadeId: string;
  blocoId?: string;
  salaId: string;
  nome: string;
  patrimonio?: string;
}

/* Contratos --------------------------------------------------------------- */

export interface ItemContrato {
  id: string;
  // Repetido no item: a leitura por collection group só filtra por campo.
  empresaId?: string;
  nome: string;
  unidadeMedida: string;
  quantidadeContratada: number;
  quantidadeDisponivel: number;
  quantidadeReservada: number;
  quantidadeConsumida: number;
  precoUnitario: number;
}

// Empresa prestadora de serviço do cliente. Gestor contratado e técnico
// pertencem a uma, e só enxergam contratos, OS e orçamentos dela.
export interface EmpresaContratada {
  id: string;
  nome: string;
  cnpj?: string;
  contato?: string;
}

// Gravado: só 'Ativo' ou 'Encerrado'. "Crítico"/"Vencido" são calculados no
// app (frontend/src/app/shared/contrato-status.ts).
export type StatusContrato = 'Ativo' | 'Encerrado';

export interface ContratoCabecalho {
  id: string;
  numero: string;
  fornecedor: string;
  // Empresa contratada dona do contrato: é o que limita gestor contratado e
  // técnico ao que é deles.
  empresaContratadaId?: string;
  vigenciaInicio: string;
  vigenciaFim: string;
  status: StatusContrato;
  // Quantos aditivos o contrato já recebeu (functions/src/aditivos.ts).
  totalAditivos?: number;
  // Preenchidos pelo encerramento formal (encerrarContrato).
  encerradoEm?: string;
  motivoEncerramento?: string;
}

// No app o contrato carrega os itens junto (cabeçalho + subcoleção).
export interface Contrato extends ContratoCabecalho {
  itens: ItemContrato[];
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

/* Chamados ---------------------------------------------------------------- */

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
  // Único campo de estado. A fase (aberto, em atendimento, finalizado,
  // cancelado) é derivada dele quando a tela precisa.
  status: StatusChamado;
  dataCriacao: string;
  dataVencimento?: string;
  dataFechamento?: string;
  responsavelId?: string;
  ordemServicoId?: string;
  possuiFoto: boolean;
  // Caminho da foto no Storage; a URL é obtida com o token do usuário.
  fotoPath?: string;
  // De onde o chamado nasceu. Ausente nos antigos, que são todos manuais.
  origem?: 'manual' | 'preventiva';
  // Preenchido só quando origem === 'preventiva': aponta o plano que gerou.
  planoId?: string;
}

/* Orçamentos e OS --------------------------------------------------------- */

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
  // Quando o gestor ajustou quantidades ao aprovar: `itens` passa a ser o
  // aprovado e `itensOriginais` o que a contratada tinha proposto.
  ajustadoPeloGestor?: boolean;
  itensOriginais?: OrcamentoItem[];
  observacaoAprovacao?: string;
}

// O que a tela manda ao criar orçamento: só item e quantidade. Nome e preço
// são copiados do item de contrato pela Cloud Function — preço é acordado no
// contrato, não se propõe outro.
export interface OrcamentoPedidoItem {
  itemContratoId: string;
  quantidade: number;
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
  // Preenchidos na execução (executarOS). `itensExecutados` guarda orçado ×
  // executado por item; a diferença voltou ao disponível do contrato.
  dataExecucao?: string;
  executadoPor?: string;
  itensExecutados?: { itemContratoId: string; nome: string; orcado: number; executado: number }[];
  observacaoExecucao?: string;
  // Caminhos no Storage das fotos da execução (até 3).
  fotosExecucao?: string[];
}

/* Notificações ------------------------------------------------------------ */

// Aviso interno (sino no topo). Endereçado a um perfil inteiro ou a uma
// pessoa; com `empresaContratadaId`, só à contratada indicada. Um documento
// por evento; `lidaPor` guarda quem já leu.
export interface Notificacao {
  id: string;
  paraPerfil?: PerfilEmpresa;
  paraUsuarioId?: string;
  empresaContratadaId?: string;
  titulo: string;
  texto: string;
  link?: string;
  alvo?: { tipo: 'chamado' | 'ordemServico' | 'orcamento' | 'contrato'; id: string; numero?: string };
  data: string;
  lidaPor: string[];
}

// Monitor da preventiva agendada (operacao/preventiva da empresa).
export interface OperacaoPreventiva {
  ultimaExecucao?: string;
  ultimaOrigem?: 'agendada' | 'manual';
  ultimoResultado?: { gerados: number; duplicados: number; ignorados: number } | null;
  ultimoErro?: string | null;
  ultimaAgendada?: string;
  ultimaAgendadaOk?: boolean;
  ultimaGeracao?: string;
  totalExecucoes?: number;
}

/* Usuários ---------------------------------------------------------------- */

export interface Usuario {
  id: string;
  nome: string;
  email: string;
  perfil: PerfilUsuario;
  unidadeId?: string;
  empresaContratadaId?: string;
  // Preenchidos só na sessão (vêm do backend no login), não no cadastro.
  empresaId?: string;
  empresaNome?: string;
  // Administrador da plataforma. Sozinho (perfil admin_plataforma) ou junto
  // de um perfil de empresa, quando ele tem cadastro na demonstração.
  adminPlataforma?: boolean;
}

/* Manutenção preventiva --------------------------------------------------- */

// Um plano não cria fluxo próprio: na data certa ele gera um Chamado comum,
// e daí pra frente vale a máquina de estados que já existe (OS → orçamento →
// execução). Por isso aqui só moram a periodicidade e o que o plano consome.
export interface PlanoManutencao {
  id: string;
  nome: string;
  equipamentoId: string;
  periodicidadeDias: number;
  // Data (YYYY-MM-DD) do próximo serviço. O gerador avança este campo
  // depois de abrir o chamado.
  proximaExecucao: string;
  ultimaExecucao?: string;
  // Quantos dias antes da data o chamado deve ser aberto.
  antecedenciaDias: number;
  // Quem paga. Opcional porque nem todo plano nasce amarrado a contrato.
  contratoId?: string;
  itemContratoId?: string;
  quantidadePrevista?: number;
  ativo: boolean;
}

/* Log de auditoria -------------------------------------------------------- */

export type AlvoLog =
  | 'unidade'
  | 'bloco'
  | 'sala'
  | 'equipamento'
  | 'usuario'
  | 'contrato'
  | 'itemContrato'
  | 'planoManutencao'
  | 'chamado'
  | 'ordemServico'
  | 'orcamento'
  | 'empresaContratada';

export type OperacaoLog = 'criar' | 'editar' | 'excluir' | 'transicao' | 'importar';

export interface LogEntrada {
  id: string;
  // Chave estável no formato "<alvo>.<operacao>" (ex.: "contrato.editar").
  acao: string;
  alvo: AlvoLog;
  operacao: OperacaoLog;
  descricao: string;
  // ISO 8601 completo, com hora, pra ordenar ações do mesmo dia.
  data: string;
  // O uid do Firebase Auth é a autoria confiável.
  usuarioUid: string;
  usuarioNome: string;
  usuarioEmail: string;
  // Identidade do registro afetado.
  alvoId: string;
  alvoRotulo: string;
  // Id do registro "dono", quando o alvo é um filho (item → contrato,
  // orçamento → OS). Registros sem dono repetem o próprio id.
  alvoPaiId: string;
  // Campos que mudaram, quando faz sentido mostrar o antes/depois.
  detalhes?: Record<string, unknown>;
  // De onde veio: escrita direta do app ou Cloud Function.
  origem: 'app' | 'backend';
}
