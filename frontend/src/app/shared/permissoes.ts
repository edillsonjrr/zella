import type { PerfilUsuario } from './models';

/**
 * Quem pode entrar em cada rota.
 *
 * Fonte única da verdade: os guards de rota leem daqui e o menu lateral
 * também, pra ninguém ver um atalho que vai rejeitá-lo no clique. Rota que
 * não estiver neste mapa é tratada como negada, então uma tela nova sem
 * política declarada falha fechada em vez de ficar aberta por esquecimento.
 */
export const PERFIS_POR_ROTA: Record<string, PerfilUsuario[]> = {
  // Quem escaneia o QR Code entra como convidado e só chega até aqui.
  'chamados/novo': ['convidado', 'cliente', 'gestor', 'gestor_contratado', 'tecnico'],

  dashboard: ['cliente', 'gestor', 'gestor_contratado', 'tecnico'],
  'ordens-servico': ['cliente', 'gestor', 'gestor_contratado', 'tecnico'],
  'ordens-servico/nova': ['gestor', 'gestor_contratado'],

  // Contrato e saldo são dinheiro: cliente e técnico ficam de fora.
  contratos: ['gestor', 'gestor_contratado'],
  'contratos/importar': ['gestor'],
  'painel-saldo': ['gestor', 'gestor_contratado'],
  'painel-gerencial': ['gestor'],

  // Cadastro e administração do sistema são só do gestor.
  unidades: ['gestor'],
  usuarios: ['gestor'],
  preventiva: ['gestor'],
  qrcodes: ['gestor'],
  logs: ['gestor'],
  contratadas: ['gestor'],
  'minha-conta': ['cliente', 'gestor', 'gestor_contratado', 'tecnico'],

  // Operação da plataforma: só o administrador, que não entra em mais nada.
  empresas: ['admin_plataforma']
};

// Pra onde cada perfil vai depois do login ou quando é barrado numa rota.
export function rotaInicial(perfil: PerfilUsuario): string {
  if (perfil === 'admin_plataforma') return '/empresas';
  if (perfil === 'convidado') return '/chamados/novo';
  return '/dashboard';
}

export function podeAcessar(perfil: PerfilUsuario, rota: string, adminPlataforma = false): boolean {
  const chave = normalizar(rota);
  // Admin com empresa: entra como gestor e ainda assim abre Empresas.
  if (adminPlataforma && chave === 'empresas') return true;
  return PERFIS_POR_ROTA[chave]?.includes(perfil) ?? false;
}

// O menu guarda as rotas com barra inicial ('/logs'); o mapa usa a forma do
// Router, sem barra ('logs').
function normalizar(rota: string): string {
  return rota.replace(/^\/+/, '').split('?')[0];
}
