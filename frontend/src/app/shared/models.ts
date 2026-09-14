// 'convidado' não é um perfil cadastrável: é o que a sessão anônima de quem
// escaneou um QR Code recebe. Ele não aparece na tela de usuários e a única
// rota que aceita esse perfil é a de abertura de chamado.
// 'admin_plataforma' é quem opera a plataforma (cria empresas clientes).
// Não pertence a empresa nenhuma e só acessa a tela de empresas.
export type PerfilUsuario = 'cliente' | 'gestor' | 'gestor_contratado' | 'tecnico' | 'convidado' | 'admin_plataforma';

// Cliente da plataforma. Todas as demais coleções vivem dentro do documento
// dele (empresasClientes/{id}/...), e é isso que isola um cliente do outro.
export interface EmpresaCliente {
  id: string;
  nome: string;
  ativa: boolean;
  gestorEmail?: string;
}

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

// Alvo genérico pro dialog de QR Code: qualquer um dos 4 níveis mapeáveis
// (unidade, bloco, sala, equipamento) sabe se descrever com esses 4 campos.
export type QrAlvoTipo = 'unidade' | 'bloco' | 'sala' | 'equipamento';

export interface QrAlvo {
  tipo: QrAlvoTipo;
  id: string;
  titulo: string;
  subtitulo: string;
}

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

export interface Contrato {
  id: string;
  numero: string;
  fornecedor: string;
  empresaContratadaId?: string;
  vigenciaInicio: string;
  vigenciaFim: string;
  itens: ItemContrato[];
  status: 'Ativo' | 'Crítico' | 'Encerrado';
  // Quantos aditivos o contrato já recebeu.
  totalAditivos?: number;
}

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
  situacao: 'Aberto' | 'Em atendimento' | 'Convertido' | 'Cancelado';
  status: 'Aberto' | 'Em atendimento' | 'Em orçamento' | 'Orçamento aprovado' | 'A ser finalizado' | 'Executado' | 'Encerrado' | 'Cancelado';
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

export interface OrcamentoItem {
  itemContratoId: string;
  nome: string;
  quantidade: number;
  precoUnitario: number;
}

export interface Orcamento {
  id: string;
  osId: string;
  empresaContratadaId?: string;
  // Substituído: orçamento pendente que foi reenviado antes de ser decidido.
  situacao: 'Pendente' | 'Aprovado' | 'Rejeitado' | 'Substituído';
  itens: OrcamentoItem[];
  dataCriacao: string;
}

// O que a tela manda ao criar orçamento: só item e quantidade. Nome e preço
// são copiados do item de contrato pela Cloud Function — preço é acordado no
// contrato, não se propõe outro.
export interface OrcamentoPedidoItem {
  itemContratoId: string;
  quantidade: number;
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

export interface OrdemServico {
  id: string;
  numero: string;
  chamadoId: string;
  contratoId: string;
  // Copiados na criação; é por eles que as rules filtram o que cada perfil vê.
  unidadeId?: string;
  empresaContratadaId?: string;
  tecnicoId?: string;
  situacao: 'Aberta' | 'Em vistoria' | 'Aprovada' | 'Rejeitada' | 'Executada' | 'Encerrada' | 'Cancelada';
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
  // Preenchidos só na sessão (vêm do backend no login), não no cadastro.
  empresaId?: string;
  empresaNome?: string;
  // Administrador da plataforma. Sozinho (perfil admin_plataforma) ou junto
  // de um perfil de empresa, quando ele tem cadastro na demonstração.
  adminPlataforma?: boolean;
}

/* Manutenção preventiva -------------------------------------------------- */

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
  // Quantos dias antes da data o chamado deve ser aberto, pra equipe ter
  // tempo de se organizar.
  antecedenciaDias: number;
  // Quem paga. Opcional porque nem todo plano nasce amarrado a contrato —
  // mas sem isso não dá pra projetar consumo futuro.
  contratoId?: string;
  itemContratoId?: string;
  quantidadePrevista?: number;
  ativo: boolean;
}

/* Log de auditoria ------------------------------------------------------ */

// Tipo do registro que a ação afetou. Serve pra filtrar a tela de logs e pra
// montar o histórico dentro de cada painel de detalhe.
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
  // O texto legível vive em `descricao`; a chave é pra filtro e agrupamento.
  acao: string;
  alvo: AlvoLog;
  operacao: OperacaoLog;
  descricao: string;
  // ISO 8601 completo — precisa de hora, não só a data, pra ordenar o
  // histórico de ações feitas no mesmo dia.
  data: string;
  // O uid do Firebase Auth é a autoria confiável: o id do Usuario vem de um
  // casamento por e-mail que pode falhar e cair no usuário de demonstração.
  usuarioUid: string;
  usuarioNome: string;
  usuarioEmail: string;
  // Identidade do registro afetado, pro histórico por registro.
  alvoId: string;
  alvoRotulo: string;
  // Id do registro "dono", quando o alvo é um filho: um item de contrato
  // guarda aqui o id do contrato. É o que permite o painel do contrato
  // mostrar, numa consulta só, o histórico dele E o dos itens dele.
  // Registros que não são filhos de ninguém repetem o próprio id.
  alvoPaiId: string;
  // Campos que mudaram, quando faz sentido mostrar o antes/depois.
  detalhes?: Record<string, unknown>;
  // De onde veio: escrita direta do app ou Cloud Function.
  origem: 'app' | 'backend';
}
