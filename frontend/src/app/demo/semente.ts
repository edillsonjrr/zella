import { addDias, montarDadosSeed, numerarEmOrdem, type DadosSeed } from '../../../../functions/src/seedDados';
import { rotuloOS } from '../../../../shared/historico';
import type { Contrato, LogEntrada, Notificacao, PerfilUsuario, PlanoManutencao, Usuario } from '../shared/models';
import type { DadosDemo } from './tipos';

/**
 * Dados de exemplo da demonstração.
 *
 * A base é a mesma do emulador (functions/src/seedDados.ts): unidades,
 * contratos, chamados, OS e orçamentos com o saldo de cada item calculado a
 * partir das próprias OS, para que contratada = livre + separado + usado.
 * Importar em vez de copiar mantém uma fonte só, já coberta pelo teste do
 * seed. O que o seed não tem (porque o emulador cria rodando as functions)
 * é montado aqui: planos de preventiva, avisos do sino e o histórico.
 */

export const EMPRESA_DEMO_ID = 'demo';
export const EMPRESA_DEMO_NOME = 'Senai DF (demonstração)';

// Dia de hoje no mesmo formato das functions (data UTC, AAAA-MM-DD).
export function hojeISO(): string {
  return new Date().toISOString().split('T')[0];
}

export function montarDadosDemo(hoje = hojeISO()): DadosDemo {
  const s = montarDadosSeed(hoje);
  trazerAbertosParaPerto(s, hoje);
  // As datas mudaram: numera de novo, para o número seguir a ordem de
  // abertura também aqui (o pedido novo recebe o seguinte ao último).
  const contadores = [...numerarEmOrdem(s.chamados, s.ordensServico), ...s.contadores.filter(c => !['CH-2026', 'OS-2026'].includes(c.id))];
  const usuarios: Usuario[] = s.usuarios.map(u => ({ ...u, perfil: u.perfil as PerfilUsuario }));
  const contratos: Contrato[] = s.contratos.map(c => ({ ...c, itens: c.itens.map(i => ({ ...i })) }));

  return {
    unidades: s.unidades,
    blocos: s.blocos,
    salas: s.salas,
    equipamentos: s.equipamentos,
    usuarios,
    empresasContratadas: s.empresasContratadas,
    contratos,
    aditivos: [],
    chamados: s.chamados,
    ordensServico: s.ordensServico,
    orcamentos: s.orcamentos,
    planosManutencao: planosDeExemplo(hoje),
    notificacoes: avisosIniciais(hoje, s),
    logs: historicoDoSeed(s, usuarios),
    // "O que você faz aqui" já conta como visto: na demonstração quem recebe
    // é o cartão de boas-vindas, que leva até ele.
    preferencias: Object.fromEntries(usuarios.map(u => [u.id, { boasVindasEm: `${hoje}T00:00:00.000Z` }])),
    operacaoPreventiva: null,
    contadores: Object.fromEntries(contadores.map(c => [c.id, c.valor]))
  };
}

// Dias entre duas datas AAAA-MM-DD (b - a).
function diasEntre(a: string, b: string): number {
  return Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / 86400000);
}

/**
 * O histórico do seed tem meses fixos (abril a setembro de 2026). Os chamados
 * do último mês que ainda estão em andamento passam a ter sido abertos nos
 * últimos dias, dentro do prazo: senão, com o passar das semanas, a lista
 * inteira sairia em vermelho e o "atrasado" perderia a força. Os dois antigos
 * que o seed deixa abertos de propósito continuam atrasados, mas há poucos
 * dias (9 e 12 dias de aberto, prazo de 5), e não desde julho: um exemplo
 * parado há 3 meses parecia sistema abandonado. OS e orçamento andam junto,
 * para a linha do tempo de cada um continuar na ordem certa.
 */
function trazerAbertosParaPerto(s: DadosSeed, hoje: string): void {
  const historico = s.chamados.filter(c => c.id.startsWith('ch-ger-'));
  const ultimoMes = historico.reduce((max, c) => (c.dataCriacao.slice(0, 7) > max ? c.dataCriacao.slice(0, 7) : max), '');
  const andando = (c: (typeof historico)[number]) => !['Executado', 'Encerrado', 'Cancelado'].includes(c.status);
  const emAndamento = historico
    .filter(c => c.dataCriacao.startsWith(ultimoMes) && andando(c))
    .sort((a, b) => b.dataCriacao.localeCompare(a.dataCriacao));
  const atrasados = historico
    .filter(c => !c.dataCriacao.startsWith(ultimoMes) && andando(c))
    .sort((a, b) => b.dataCriacao.localeCompare(a.dataCriacao));
  const destinos = [
    ...emAndamento.map((c, k) => ({ c, novaCriacao: addDias(hoje, -(k % 5)) })),
    ...atrasados.map((c, k) => ({ c, novaCriacao: addDias(hoje, -(9 + 3 * k)) }))
  ];
  destinos.forEach(({ c, novaCriacao }) => {
    const desloca = diasEntre(c.dataCriacao, novaCriacao);
    if (desloca <= 0) return;
    const mover = (data: string | undefined) => {
      if (!data) return data;
      const nova = addDias(data, desloca);
      return nova > hoje ? hoje : nova;
    };
    c.dataCriacao = novaCriacao;
    c.dataVencimento = addDias(novaCriacao, 5);
    const os = s.ordensServico.find(o => o.id === c.ordemServicoId);
    if (!os) return;
    os.dataCriacao = mover(os.dataCriacao)!;
    const orc = s.orcamentos.find(o => o.id === os.orcamentoId);
    if (!orc) return;
    orc.dataCriacao = mover(orc.dataCriacao)!;
    if (orc.dataAprovacao) orc.dataAprovacao = mover(orc.dataAprovacao);
  });
}

/**
 * Planos de preventiva. Dois vencem dentro da antecedência (um já atrasado),
 * para "Abrir chamados vencendo" ter o que fazer; os outros mostram a
 * agenda dos próximos meses.
 */
function planosDeExemplo(hoje: string): PlanoManutencao[] {
  return [
    {
      id: 'pl1', nome: 'Limpeza do ar-condicionado', equipamentoId: 'e1', periodicidadeDias: 90,
      proximaExecucao: addDias(hoje, 4), ultimaExecucao: addDias(hoje, -86), antecedenciaDias: 7,
      contratoId: 'c1', itemContratoId: 'i3', quantidadePrevista: 1, ativo: true
    },
    {
      id: 'pl2', nome: 'Limpeza do ar da sala de reuniões', equipamentoId: 'e5', periodicidadeDias: 90,
      proximaExecucao: addDias(hoje, -2), ultimaExecucao: addDias(hoje, -92), antecedenciaDias: 5,
      contratoId: 'c1', itemContratoId: 'i3', quantidadePrevista: 1, ativo: true
    },
    {
      id: 'pl3', nome: 'Revisão do quadro de distribuição', equipamentoId: 'e3', periodicidadeDias: 180,
      proximaExecucao: addDias(hoje, 38), ultimaExecucao: addDias(hoje, -142), antecedenciaDias: 10, ativo: true
    },
    {
      id: 'pl4', nome: 'Troca do filtro do bebedouro', equipamentoId: 'e4', periodicidadeDias: 120,
      proximaExecucao: addDias(hoje, 15), antecedenciaDias: 7, ativo: true
    },
    {
      id: 'pl5', nome: 'Revisão anual do projetor', equipamentoId: 'e2', periodicidadeDias: 365,
      proximaExecucao: addDias(hoje, 120), antecedenciaDias: 15, ativo: false
    }
  ];
}

// Hora fixa do dia, em UTC (11h UTC = 8h em Brasília).
function momento(dia: string, hora: number, minuto: number): string {
  return `${dia}T${String(hora).padStart(2, '0')}:${String(minuto).padStart(2, '0')}:00.000Z`;
}

/**
 * Avisos do sino que as functions teriam gravado até aqui, um por etapa
 * pendente dos chamados recentes do seed. Todos chegam sem ler.
 */
function avisosIniciais(hoje: string, s: DadosSeed): Notificacao[] {
  // Os números saem dos dados (são dados na ordem de abertura).
  const ch = (id: string) => s.chamados.find(c => c.id === id)?.numero ?? '';
  const os = (id: string) => s.ordensServico.find(o => o.id === id)?.numero ?? '';
  const aviso = (id: string, dia: number, hora: number, n: Omit<Notificacao, 'id' | 'data' | 'lidaPor'>): Notificacao => ({
    id,
    ...n,
    data: momento(addDias(hoje, dia), hora, 10 + dia * -3),
    lidaPor: []
  });
  return [
    aviso('av1', -1, 11, {
      paraPerfil: 'gestor',
      titulo: `Novo chamado ${ch('ch1')}`,
      texto: 'Ana Souza abriu "Ar Split 12000 BTUs". Prazo: 5 dias. Urgência: urgente.',
      link: '/dashboard?chamado=ch1',
      alvo: { tipo: 'chamado', id: 'ch1', numero: ch('ch1') }
    }),
    aviso('av2', -2, 16, {
      paraPerfil: 'gestor',
      titulo: `Orçamento para aprovar na ${os('os1')}`,
      texto: 'Diego Rocha enviou um orçamento com 1 item, total R$ 74,00. Aguarda sua aprovação.',
      link: '/ordens-servico?os=os1',
      alvo: { tipo: 'orcamento', id: 'orc1', numero: os('os1') }
    }),
    aviso('av3', -2, 19, {
      paraPerfil: 'gestor',
      titulo: `Serviço feito na ${os('os2')}`,
      texto: 'Feito em parte: 1 unidade voltou ao saldo livre do contrato. Confira e encerre o chamado.',
      link: '/ordens-servico?os=os2',
      alvo: { tipo: 'ordemServico', id: 'os2', numero: os('os2') }
    }),
    aviso('av4', -1, 14, {
      paraPerfil: 'tecnico',
      empresaContratadaId: 'c2',
      paraUsuarioId: 'usr5',
      titulo: `Orçamento da ${os('os3')} aprovado`,
      texto: 'Faça o serviço e registre como feito.',
      link: '/ordens-servico?os=os3',
      alvo: { tipo: 'ordemServico', id: 'os3', numero: os('os3') }
    }),
    aviso('av5', -1, 14, {
      paraPerfil: 'gestor_contratado',
      empresaContratadaId: 'c2',
      titulo: `Orçamento da ${os('os3')} aprovado`,
      texto: 'O serviço está liberado: o técnico faz e registra como feito.',
      link: '/ordens-servico?os=os3',
      alvo: { tipo: 'ordemServico', id: 'os3', numero: os('os3') }
    }),
    aviso('av6', -1, 14, {
      paraUsuarioId: 'usr1',
      titulo: `Pedido ${ch('ch4')} aprovado`,
      texto: 'O conserto foi aprovado. Agora o técnico vai fazer o serviço.',
      link: '/meus-pedidos?pedido=ch4',
      alvo: { tipo: 'chamado', id: 'ch4', numero: ch('ch4') }
    }),
    aviso('av7', -2, 19, {
      paraUsuarioId: 'usr1',
      titulo: `Serviço feito no pedido ${ch('ch3')}`,
      texto: 'A empresa contratada registrou o serviço como feito. Falta a gestão encerrar o pedido.',
      link: '/meus-pedidos?pedido=ch3',
      alvo: { tipo: 'chamado', id: 'ch3', numero: ch('ch3') }
    })
  ];
}

/**
 * O log que as functions teriam gravado para os chamados do seed: abertura,
 * OS, orçamento, aprovação, serviço feito e encerramento, cada um com autor
 * e hora. É o que dá conteúdo ao "Histórico de alterações" e às horas da
 * linha do tempo de cada chamado.
 */
function historicoDoSeed(s: DadosSeed, usuarios: Usuario[]): LogEntrada[] {
  const logs: LogEntrada[] = [];
  const pessoa = (id: string | undefined) => usuarios.find(u => u.id === id);
  const gestora = pessoa('usr3')!;
  const contratada = (empresaContratadaId: string | undefined) => {
    // Só a Elétrica Sul tem gente cadastrada; nas outras, a própria empresa.
    if (empresaContratadaId === 'c2') return pessoa('usr4')!;
    const nome = s.empresasContratadas.find(e => e.id === empresaContratadaId)?.nome ?? 'Empresa contratada';
    return { id: `equipe-${empresaContratadaId}`, nome: `Equipe da ${nome}`, email: '' };
  };
  let n = 0;
  const registrar = (
    quando: string,
    autor: { id: string; nome: string; email: string },
    e: Pick<LogEntrada, 'alvo' | 'operacao' | 'descricao' | 'alvoId' | 'alvoRotulo'> & { alvoPaiId?: string; detalhes?: Record<string, unknown> }
  ) => {
    n++;
    logs.push({
      id: `log-seed-${String(n).padStart(3, '0')}`,
      acao: `${e.alvo}.${e.operacao}`,
      alvo: e.alvo,
      operacao: e.operacao,
      descricao: e.descricao,
      data: quando,
      usuarioUid: autor.id,
      usuarioNome: autor.nome,
      usuarioEmail: autor.email,
      alvoId: e.alvoId,
      alvoRotulo: e.alvoRotulo,
      alvoPaiId: e.alvoPaiId ?? e.alvoId,
      ...(e.detalhes ? { detalhes: e.detalhes } : {}),
      origem: 'backend'
    });
  };

  for (const c of s.chamados) {
    const solicitante = pessoa(c.solicitanteId) ?? { id: c.solicitanteId, nome: c.solicitanteNome, email: '' };
    registrar(momento(c.dataCriacao, 11, 5), solicitante, {
      alvo: 'chamado', operacao: 'criar', descricao: `Abriu o chamado ${c.numero} — ${c.equipamento}`,
      alvoId: c.id, alvoRotulo: c.numero,
      detalhes: { equipamento: c.equipamento, unidadeId: c.unidadeId, solicitante: c.solicitanteNome, slaDias: 5, local: c.local ?? null, urgencia: c.urgencia ?? null }
    });

    const os = s.ordensServico.find(o => o.id === c.ordemServicoId);
    if (!os) continue;
    registrar(momento(os.dataCriacao, 13, 20), gestora, {
      alvo: 'ordemServico', operacao: 'criar', descricao: `Criou a ${rotuloOS(os.numero)} a partir do chamado ${c.numero}`,
      alvoId: os.id, alvoRotulo: os.numero, alvoPaiId: c.id,
      detalhes: { chamado: c.numero, contratoId: os.contratoId, tecnicoId: os.tecnicoId ?? null }
    });

    const orc = s.orcamentos.find(o => o.id === os.orcamentoId);
    if (orc) {
      const total = orc.itens.reduce((soma, i) => soma + i.quantidade * i.precoUnitario, 0);
      registrar(momento(orc.dataCriacao, 14, 40), contratada(os.empresaContratadaId), {
        alvo: 'orcamento', operacao: 'criar',
        descricao: `Enviou o orçamento da ${rotuloOS(os.numero)} com ${orc.itens.length === 1 ? '1 item' : `${orc.itens.length} itens`}`,
        alvoId: orc.id, alvoRotulo: os.numero, alvoPaiId: os.id,
        detalhes: { os: os.numero, itens: orc.itens.length, total, substituiu: null }
      });
      if (orc.situacao === 'Aprovado') {
        registrar(momento(orc.dataAprovacao ?? orc.dataCriacao, 15, 10), gestora, {
          alvo: 'orcamento', operacao: 'transicao', descricao: `Aprovou o orçamento da ${rotuloOS(os.numero)}`,
          alvoId: orc.id, alvoRotulo: os.numero, alvoPaiId: os.id,
          detalhes: { situacao: { de: 'Pendente', para: 'Aprovado' }, itensReservados: new Set(orc.itens.map(i => i.itemContratoId)).size, ajustes: [] }
        });
      }
    }

    if (os.dataExecucao && os.itensExecutados) {
      const devolvido = os.itensExecutados.reduce((soma, i) => soma + Math.max(0, i.orcado - i.executado), 0);
      const autor = pessoa(os.executadoPor) ?? contratada(os.empresaContratadaId);
      registrar(momento(os.dataExecucao, 18, 30), autor, {
        alvo: 'ordemServico', operacao: 'transicao',
        descricao: `Registrou o serviço da ${rotuloOS(os.numero)} como feito${devolvido ? ` (parcial: ${devolvido === 1 ? '1 unidade voltou' : `${devolvido} unidades voltaram`} ao contrato)` : ''}`,
        alvoId: os.id, alvoRotulo: os.numero,
        detalhes: { situacao: { de: 'Aprovada', para: 'Executada' }, chamado: { statusPara: 'Executado' }, itens: os.itensExecutados, devolvidoAoContrato: devolvido }
      });
    }

    if (c.status === 'Encerrado' && c.dataFechamento) {
      registrar(momento(c.dataFechamento, 12, 0), gestora, {
        alvo: 'chamado', operacao: 'transicao', descricao: `Encerrou o chamado ${c.numero}`,
        alvoId: c.id, alvoRotulo: c.numero,
        detalhes: { status: { de: 'Executado', para: 'Encerrado' }, osEncerradaJunto: os.id }
      });
    }
  }
  return logs;
}
