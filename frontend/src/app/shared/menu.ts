import type { PerfilUsuario } from './models';
import { podeAcessar } from './permissoes';

export interface ItemMenu {
  // Igual ao título da página que o item abre.
  label: string;
  // Nome curto para a barra de baixo do celular, quando o label não cabe.
  curto?: string;
  route: string;
  icon: string;
  // Palavras a mais para a busca global (Ctrl+K) achar a página.
  termos?: string;
}

/** Seção do menu. Sem título = sempre aberta, no topo. */
export interface SecaoMenu {
  id: string;
  titulo?: string;
  itens: ItemMenu[];
}

/**
 * Páginas do sistema, na ordem do menu lateral. A busca global lê a mesma
 * lista, então uma página nova entra nos dois lugares de uma vez.
 */
export const SECOES_MENU: SecaoMenu[] = [
  {
    id: 'operacao',
    itens: [
      { label: 'Meus pedidos', route: '/meus-pedidos', icon: 'checklist', termos: 'conserto solicitação' },
      { label: 'Chamados', route: '/dashboard', icon: 'support_agent', termos: 'pedidos conserto quadro' },
      { label: 'Ordens de serviço', curto: 'Ordens', route: '/ordens-servico', icon: 'assignment', termos: 'os execução orçamento' },
      { label: 'Manutenção preventiva', curto: 'Preventiva', route: '/preventiva', icon: 'calendar_check', termos: 'planos agenda' }
    ]
  },
  {
    id: 'gestao',
    titulo: 'Gestão',
    itens: [
      { label: 'Contratos', route: '/contratos', icon: 'description', termos: 'itens vigência' },
      { label: 'Saldo dos contratos', curto: 'Saldo', route: '/painel-saldo', icon: 'account_balance_wallet', termos: 'consumo reservado livre' },
      { label: 'Painel gerencial', curto: 'Painel', route: '/painel-gerencial', icon: 'bar_chart', termos: 'indicadores relatórios' }
    ]
  },
  {
    id: 'cadastros',
    titulo: 'Cadastros',
    itens: [
      { label: 'Empresas clientes', curto: 'Empresas', route: '/empresas', icon: 'business', termos: 'clientes plataforma' },
      { label: 'Unidades', route: '/unidades', icon: 'location_on', termos: 'blocos salas prédios' },
      { label: 'Equipamentos', route: '/equipamentos', icon: 'devices', termos: 'patrimônio aparelhos' },
      { label: 'Usuários', route: '/usuarios', icon: 'group', termos: 'pessoas equipe acesso' },
      { label: 'Empresas contratadas', curto: 'Contratadas', route: '/contratadas', icon: 'handyman', termos: 'prestadoras fornecedores' }
    ]
  },
  {
    id: 'ferramentas',
    titulo: 'Ferramentas',
    itens: [
      { label: 'Importar contratos', route: '/contratos/importar', icon: 'upload_file', termos: 'planilha pdf' },
      { label: 'QR Codes', route: '/qrcodes', icon: 'qr_code', termos: 'etiquetas plaquetas' },
      { label: 'Histórico de alterações', route: '/logs', icon: 'clock', termos: 'log auditoria' }
    ]
  }
];

/**
 * Seções com só as páginas que o perfil abre. É o mesmo mapa que os guards
 * de rota consultam, então nenhum atalho visível leva a um redirecionamento.
 */
export function secoesDoPerfil(perfil: PerfilUsuario, adminPlataforma = false): SecaoMenu[] {
  return SECOES_MENU
    .map(secao => ({ ...secao, itens: secao.itens.filter(item => podeAcessar(perfil, item.route, adminPlataforma)) }))
    .filter(secao => secao.itens.length > 0);
}
