import type { Notificacao, PerfilUsuario } from './models';
import type { DataService } from './data.service';

export interface Destino {
  rota: string;
  params: Record<string, string>;
}

/**
 * Para onde o clique numa notificação leva: o item exato, não a lista.
 *
 * Usa o `alvo` gravado pelas functions (existe também nas notificações
 * antigas, que só tinham `link: '/ordens-servico'`). A tela de destino lê o
 * parâmetro (?chamado=, ?os=, ?pedido=, ?contrato=) e abre o painel do item.
 */
export function destinoDaNotificacao(n: Notificacao, perfil: PerfilUsuario, ds: DataService): Destino | null {
  const alvo = n.alvo;
  const cliente = perfil === 'cliente';
  if (alvo?.id) {
    switch (alvo.tipo) {
      case 'chamado':
        return cliente ? { rota: '/meus-pedidos', params: { pedido: alvo.id } } : { rota: '/dashboard', params: { chamado: alvo.id } };
      case 'ordemServico': {
        if (cliente) {
          const chamado = ds.chamados().find(c => c.ordemServicoId === alvo.id) ?? ds.chamados().find(c => c.id === ds.getOSById(alvo.id)?.chamadoId);
          return chamado ? { rota: '/meus-pedidos', params: { pedido: chamado.id } } : { rota: '/meus-pedidos', params: {} };
        }
        return { rota: '/ordens-servico', params: { os: alvo.id } };
      }
      case 'orcamento': {
        const osId = ds.getOrcamentoById(alvo.id)?.osId;
        return osId ? { rota: '/ordens-servico', params: { os: osId } } : { rota: '/ordens-servico', params: {} };
      }
      case 'contrato':
        return { rota: '/contratos', params: { contrato: alvo.id } };
    }
  }
  if (!n.link) return null;
  const [rota, consulta] = n.link.split('?');
  return { rota, params: Object.fromEntries(new URLSearchParams(consulta ?? '')) };
}
