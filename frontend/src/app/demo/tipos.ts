import type {
  AditivoContrato,
  Bloco,
  Chamado,
  Contrato,
  EmpresaContratada,
  Equipamento,
  LogEntrada,
  Notificacao,
  OperacaoPreventiva,
  Orcamento,
  OrdemServico,
  PlanoManutencao,
  PreferenciasUsuario,
  Sala,
  Unidade,
  Usuario
} from '../shared/models';

/**
 * Tudo o que a empresa de demonstração tem, num objeto só: é o que a
 * demonstração guarda no navegador e o que "Voltar aos dados de exemplo"
 * refaz. No app de verdade cada lista é uma coleção do Firestore em
 * empresasClientes/{empresa}/...; aqui o contrato já carrega os itens.
 */
export interface DadosDemo {
  unidades: Unidade[];
  blocos: Bloco[];
  salas: Sala[];
  equipamentos: Equipamento[];
  usuarios: Usuario[];
  empresasContratadas: EmpresaContratada[];
  contratos: Contrato[];
  aditivos: AditivoContrato[];
  chamados: Chamado[];
  ordensServico: OrdemServico[];
  orcamentos: Orcamento[];
  planosManutencao: PlanoManutencao[];
  notificacoes: Notificacao[];
  logs: LogEntrada[];
  // preferencias/{usuarioId}
  preferencias: Record<string, PreferenciasUsuario>;
  // operacao/preventiva: só as execuções feitas pelo botão (não há agendamento).
  operacaoPreventiva: OperacaoPreventiva | null;
  // contadores/{prefixo}-{ano}
  contadores: Record<string, number>;
}

/** Quem faz a ação: a pessoa da sessão ou o visitante do QR Code. */
export interface Ator {
  // Id do cadastro (usuarios/{id}); vazio para o visitante do QR Code.
  usuarioId: string;
  // Identidade da sessão (no Firebase, o uid). Vai no log e no solicitante.
  uid: string;
  nome: string;
  email: string;
  perfil: Usuario['perfil'];
  unidadeId?: string;
  empresaContratadaId?: string;
}
