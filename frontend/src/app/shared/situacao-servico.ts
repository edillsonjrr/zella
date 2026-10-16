import type { Chamado, Orcamento, OrdemServico, PerfilUsuario } from './models';
import {
  agoraDaChave,
  CHAVES_SITUACAO,
  EXPLICACAO_FIM,
  rotuloDaChave,
  situacaoDoServico,
  type ChaveSituacao,
  type SituacaoServico
} from '../../../../shared/situacao';

/**
 * A máquina de situações (shared/situacao.ts) com o que só a tela precisa:
 * a classe do selo e um atalho que acha a OS e o orçamento do chamado.
 * Chamado e OS mostram sempre a mesma situação, e cada uma diz quem age.
 */
export { agoraDaChave, CHAVES_SITUACAO, EXPLICACAO_FIM, rotuloDaChave, situacaoDoServico, type ChaveSituacao, type SituacaoServico };

const CLASSE_SELO: Record<ChaveSituacao, string> = {
  novo: 'badge--aberta',
  'aguardando-orcamento': 'badge--vistoria',
  'orcamento-recusado': 'badge--rejeitada',
  'aguardando-aprovacao': 'badge--vistoria',
  aprovado: 'badge--aprovada',
  'servico-feito': 'badge--executada',
  encerrado: 'badge--encerrada',
  cancelado: 'badge--neutra'
};

// Tom do ponto colorido do grupo na lista de chamados.
const COR_GRUPO: Record<ChaveSituacao, string> = {
  novo: 'info',
  'aguardando-orcamento': 'warning',
  'orcamento-recusado': 'danger',
  'aguardando-aprovacao': 'primary',
  aprovado: 'success',
  'servico-feito': 'primary-accent',
  encerrado: 'neutral',
  cancelado: 'neutral'
};

export function classeDoSelo(chave: ChaveSituacao): string {
  return CLASSE_SELO[chave];
}

export function corDoGrupo(chave: ChaveSituacao): string {
  return COR_GRUPO[chave];
}

/** O que a tela tem à mão para decidir a situação de um chamado ou de uma OS. */
export interface FonteSituacao {
  getOSById(id: string): OrdemServico | undefined;
  getChamadoById(id: string): Chamado | undefined;
  getOrcamentoByOS(osId: string): Orcamento | undefined;
}

export function situacaoDoChamado(fonte: FonteSituacao, chamado: Chamado, perfil?: PerfilUsuario | string | null): SituacaoServico {
  const os = chamado.ordemServicoId ? fonte.getOSById(chamado.ordemServicoId) : undefined;
  const orcamento = os ? fonte.getOrcamentoByOS(os.id) : undefined;
  return situacaoDoServico({ chamado, os, orcamento, perfil });
}

export function situacaoDaOS(fonte: FonteSituacao, os: OrdemServico, perfil?: PerfilUsuario | string | null): SituacaoServico {
  // A OS manda (o chamado pode estar num atendimento novo, se foi reaberto).
  return situacaoDoServico({ os, orcamento: fonte.getOrcamentoByOS(os.id), perfil });
}
