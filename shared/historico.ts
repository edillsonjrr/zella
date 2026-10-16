/**
 * Histórico em linguagem comum (Z0.2 e Z0.6).
 *
 * Duas peças, ambas puras (compilam no app e nas functions, e o teste
 * functions/test/historico.test.mjs confere sem navegador):
 *
 * - `montarLinhaDoTempo`: a linha do tempo de um chamado e da OS dele. Os
 *   marcos (aberto, OS criada, orçamento enviado, aprovado, serviço feito,
 *   encerrado) saem dos próprios registros, que todo perfil que vê o chamado
 *   já lê. Quando o perfil também lê `logs` (só a gestão, pelas rules), a
 *   entrada do log substitui o marco equivalente e traz hora e autor.
 *   Antes, o painel lia só `logs`: o técnico e a contratada recebiam
 *   "permission-denied", o app engolia o erro e mostrava "Nenhuma ação
 *   registrada"; e, para a gestão, o chamado não via o orçamento nem a
 *   execução (gravados com o id da OS) e a OS não via a abertura nem o
 *   encerramento (gravados com o id do chamado).
 *
 * - `descreverDetalhes`: o objeto `detalhes` de uma entrada do log vira
 *   linhas em português ("Próxima execução: 20/10/2026"), sem nome de campo
 *   cru nem data ISO.
 */
import type { Chamado, LogEntrada, Orcamento, OrdemServico } from './dominio';

/* Textos ------------------------------------------------------------------ */

/** "1 item", "2 itens". */
export function plural(n: number, singular: string, varios: string): string {
  return `${n.toLocaleString('pt-BR')} ${n === 1 ? singular : varios}`;
}

/**
 * Número de OS para usar depois da palavra "OS" ou sozinho, sem repetir o
 * prefixo: "OS-2026-0096", nunca "OS OS-2026-0096".
 */
export function rotuloOS(numero: string | null | undefined): string {
  const n = (numero ?? '').trim();
  if (!n) return 'OS';
  return /^OS[-\s]/i.test(n) ? n : `OS ${n}`;
}

/**
 * Tira o prefixo repetido de textos já gravados ("OS OS-2026-0096" vira
 * "OS-2026-0096"; o mesmo para "CH CH-"). Só muda o que a tela mostra.
 */
export function limparTexto(texto: string | null | undefined): string {
  return (texto ?? '').replace(/\b(OS|CH|ORC)\s+(?=\1-)/g, '');
}

const DATA = /^(\d{4})-(\d{2})-(\d{2})$/;
const DATA_HORA = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/;

/** "2026-10-13" vira "13/10/2026"; com hora, "13/10/2026 às 14:05". */
export function dataBr(valor: string | null | undefined): string {
  const v = (valor ?? '').trim();
  const d = DATA.exec(v);
  if (d) return `${d[3]}/${d[2]}/${d[1]}`;
  if (DATA_HORA.test(v)) {
    const data = new Date(v);
    if (!Number.isNaN(data.getTime())) {
      const dia = data.toLocaleDateString('pt-BR');
      const hora = data.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
      return `${dia} às ${hora}`;
    }
  }
  return v;
}

function reais(n: number): string {
  return n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

/* Detalhes do log em português -------------------------------------------- */

// Nome de cada campo gravado em `detalhes`, como a pessoa lê.
const ROTULO_CAMPO: Record<string, string> = {
  equipamento: 'Equipamento',
  unidade: 'Unidade',
  unidadeId: 'Unidade',
  sala: 'Sala',
  solicitante: 'Quem pediu',
  slaDias: 'Prazo',
  local: 'Onde fica',
  urgencia: 'Urgência',
  responsavel: 'Responsável',
  chamado: 'Chamado',
  contrato: 'Contrato',
  contratoId: 'Contrato',
  tecnico: 'Técnico',
  tecnicoId: 'Técnico',
  os: 'OS',
  itens: 'Itens',
  total: 'Total',
  itensForaContrato: 'Itens fora do contrato',
  totalForaContrato: 'Total fora do contrato',
  totalAprovado: 'Total aprovado',
  substituiu: 'Trocou um orçamento anterior',
  situacao: 'Situação',
  status: 'Situação',
  statusPara: 'Situação do chamado',
  itensReservados: 'Itens com saldo separado',
  ajustes: 'Ajustes de quantidade',
  foraContrato: 'Fora do contrato',
  aprovados: 'aprovados',
  recusados: 'recusados',
  devolvidoAoContrato: 'Voltou ao saldo livre',
  saldoDevolvido: 'Voltou ao saldo livre',
  motivo: 'Motivo',
  osCanceladaJunto: 'OS cancelada junto',
  osEncerradaJunto: 'OS encerrada junto',
  osAnterior: 'OS anterior',
  plano: 'Plano',
  vencimento: 'Vencimento',
  proximaExecucao: 'Próxima execução',
  ultimaExecucao: 'Última execução',
  periodicidadeDias: 'Repete a cada',
  ativo: 'Ativo',
  aditivo: 'Aditivo nº',
  vigenciaFim: 'Fim da vigência',
  disponivelZerado: 'Saldo livre zerado',
  osCanceladas: 'OS canceladas',
  loteContratos: 'Contratos no mesmo lote',
  nome: 'Nome',
  sigla: 'Sigla',
  blocosRemovidos: 'Blocos removidos',
  salasRemovidas: 'Salas removidas',
  equipamentosRemovidos: 'Equipamentos removidos',
  patrimonio: 'Patrimônio',
  perfil: 'Perfil',
  perfilAnterior: 'Perfil anterior',
  perfilNovo: 'Perfil novo',
  email: 'E-mail',
  fornecedor: 'Fornecedor',
  quantidade: 'Quantidade',
  quantidadeContratada: 'Quantidade contratada',
  precoUnitario: 'Preço por unidade',
  unidadeMedida: 'Unidade de medida',
  descricao: 'Descrição',
  item: 'Item',
  orcado: 'orçado',
  executado: 'feito'
};

const CAMPOS_MOEDA = new Set(['total', 'totalForaContrato', 'totalAprovado', 'precoUnitario']);
const CAMPOS_DIAS = new Set(['slaDias', 'periodicidadeDias']);
// Ids: viram nome pela função `nome` da tela; sem nome, a linha some (um id
// solto não diz nada a ninguém).
const CAMPOS_ID = new Set(['unidadeId', 'contratoId', 'tecnicoId', 'osCanceladaJunto', 'osEncerradaJunto', 'osAnterior', 'responsavel', 'tecnico']);
const URGENCIA: Record<string, string> = { baixa: 'Pode esperar', media: 'Atrapalha o trabalho', alta: 'Urgente' };
const PERFIL: Record<string, string> = {
  cliente: 'Solicitante',
  gestor: 'Gestor',
  gestor_contratado: 'Responsável da contratada',
  tecnico: 'Técnico',
  admin_plataforma: 'Admin da plataforma',
  convidado: 'Convidado'
};

/** Resolve um id (técnico, unidade, contrato, OS) para nome. */
export type ResolverNome = (campo: string, id: string) => string | undefined;

/** "proximaExecucao" vira "Proxima execucao": último recurso para campo novo sem rótulo. */
function campoParaTexto(campo: string): string {
  const palavras = campo.replace(/([a-z0-9])([A-Z])/g, '$1 $2').replace(/[_-]+/g, ' ').toLowerCase();
  return palavras.charAt(0).toUpperCase() + palavras.slice(1);
}

export function rotuloCampo(campo: string): string {
  return ROTULO_CAMPO[campo] ?? campoParaTexto(campo);
}

function valorTexto(campo: string, valor: unknown, nome?: ResolverNome): string | null {
  if (valor === null || valor === undefined || valor === '') return null;
  if (typeof valor === 'boolean') return valor ? 'sim' : 'não';
  if (typeof valor === 'number') {
    if (CAMPOS_MOEDA.has(campo)) return reais(valor);
    if (CAMPOS_DIAS.has(campo)) return plural(valor, 'dia', 'dias');
    return valor.toLocaleString('pt-BR');
  }
  if (typeof valor === 'string') {
    if (CAMPOS_ID.has(campo)) return nome?.(campo, valor) ?? null;
    if (campo === 'urgencia') return URGENCIA[valor] ?? valor;
    if (campo === 'perfil' || campo === 'perfilAnterior' || campo === 'perfilNovo') return PERFIL[valor] ?? valor;
    return limparTexto(dataBr(valor));
  }
  if (Array.isArray(valor)) {
    const partes = valor.map((v) => itemTexto(v, nome)).filter((t): t is string => !!t);
    return partes.length ? partes.join('; ') : null;
  }
  if (typeof valor === 'object') {
    const o = valor as Record<string, unknown>;
    if ('de' in o && 'para' in o) {
      const de = valorTexto(campo, o['de'], nome);
      const para = valorTexto(campo, o['para'], nome);
      if (de === null && para === null) return null;
      return `${de ?? 'nenhum'} → ${para ?? 'nenhum'}`;
    }
    const partes = Object.entries(o)
      .map(([k, v]) => {
        const t = valorTexto(k, v, nome);
        return t === null ? null : `${rotuloCampo(k).toLowerCase()}: ${t}`;
      })
      .filter((t): t is string => !!t);
    return partes.length ? partes.join(', ') : null;
  }
  return String(valor);
}

// Uma linha de lista (itens do orçamento, do aditivo, da execução).
function itemTexto(v: unknown, nome?: ResolverNome): string | null {
  if (v === null || v === undefined) return null;
  if (typeof v !== 'object') return valorTexto('', v, nome);
  const o = v as Record<string, unknown>;
  const titulo = (o['nome'] ?? o['item'] ?? o['descricao']) as string | undefined;
  if (typeof o['orcado'] === 'number' && typeof o['executado'] === 'number') {
    return `${titulo ?? 'Item'}: feito ${o['executado']} de ${o['orcado']}`;
  }
  if ('de' in o && 'para' in o) {
    return `${titulo ?? 'Item'}: ${o['de'] ?? '—'} → ${o['para'] ?? '—'}`;
  }
  if (typeof o['quantidade'] === 'number') {
    return `${titulo ?? 'Item'}: ${o['quantidade']}${typeof o['unidade'] === 'string' ? ` ${o['unidade']}` : ''}`;
  }
  const resto = Object.entries(o)
    .filter(([k]) => !['nome', 'item', 'descricao', 'id', 'itemContratoId'].includes(k))
    .map(([k, valor]) => {
      const t = valorTexto(k, valor, nome);
      return t === null ? null : `${rotuloCampo(k).toLowerCase()} ${t}`;
    })
    .filter((t): t is string => !!t);
  if (titulo) return resto.length ? `${titulo} (${resto.join(', ')})` : titulo;
  return resto.length ? resto.join(', ') : null;
}

/**
 * Linhas legíveis do objeto `detalhes` de uma entrada do log. Campos vazios
 * e ids sem nome somem; datas, dinheiro, prazos, perfis e urgência saem em
 * português.
 */
export function descreverDetalhes(detalhes: Record<string, unknown> | null | undefined, nome?: ResolverNome): string[] {
  if (!detalhes) return [];
  const linhas: string[] = [];
  for (const [campo, valor] of Object.entries(detalhes)) {
    const texto = valorTexto(campo, valor, nome);
    if (texto === null) continue;
    linhas.push(`${rotuloCampo(campo)}: ${texto}`);
  }
  return linhas;
}

/* Linha do tempo do chamado e da OS --------------------------------------- */

export type TipoEvento =
  | 'aberto'
  | 'os'
  | 'orcamento'
  | 'aprovado'
  | 'recusado'
  | 'executado'
  | 'encerrado'
  | 'cancelado'
  | 'reaberto'
  | 'outro';

export interface EventoLinhaDoTempo {
  // Identifica o marco, para o log substituir o marco tirado do registro.
  chave: string;
  tipo: TipoEvento;
  // Data (AAAA-MM-DD) ou data e hora (ISO). Vazio quando o registro não
  // guarda a data (orçamento recusado sem log).
  quando: string;
  // "13/10/2026" ou "13/10/2026 às 14:05"; vazio sem data.
  quandoTexto: string;
  titulo: string;
  detalhe: string;
  // Quem fez; "Automático" para a preventiva. Vazio quando o registro não diz.
  autor: string;
  automatico: boolean;
}

export interface FonteLinhaDoTempo {
  chamado: Chamado;
  // OS do chamado (a atual e as de atendimentos anteriores, se reaberto).
  ordens: OrdemServico[];
  // Orçamentos dessas OS, quando o perfil lê orçamentos.
  orcamentos: Orcamento[];
  // Entradas do log desses registros, quando o perfil lê o log (gestão).
  logs?: LogEntrada[];
  // Nome de quem tem cadastro (executou, etc.), pelo id.
  nomeUsuario?: (id: string) => string | undefined;
  // Nome da empresa contratada, pelo id.
  nomeContratada?: (id: string) => string | undefined;
}

const ORDEM_TIPO: Record<TipoEvento, number> = {
  aberto: 0,
  reaberto: 1,
  os: 2,
  orcamento: 3,
  recusado: 4,
  aprovado: 4,
  executado: 5,
  encerrado: 6,
  cancelado: 6,
  outro: 3
};

const SISTEMA = 'sistema';

function evento(e: Omit<EventoLinhaDoTempo, 'quandoTexto' | 'automatico'> & { automatico?: boolean }): EventoLinhaDoTempo {
  return { ...e, quandoTexto: dataBr(e.quando), automatico: !!e.automatico };
}

function resumoOrcamento(o: Pick<Orcamento, 'itens' | 'itensForaContrato'>): string {
  const doContrato = o.itens?.length ?? 0;
  const fora = o.itensForaContrato?.length ?? 0;
  const partes: string[] = [];
  if (doContrato) partes.push(plural(doContrato, 'item do contrato', 'itens do contrato'));
  if (fora) partes.push(plural(fora, 'item fora do contrato', 'itens fora do contrato'));
  return partes.join(' e ');
}

/** Marcos tirados só dos registros (chamado, OS, orçamentos). */
function marcosDosRegistros(f: FonteLinhaDoTempo): EventoLinhaDoTempo[] {
  const { chamado } = f;
  const preventiva = chamado.origem === 'preventiva';
  const lista: EventoLinhaDoTempo[] = [
    evento({
      chave: 'aberto',
      tipo: 'aberto',
      quando: chamado.dataCriacao,
      titulo: preventiva ? 'Chamado aberto pela manutenção preventiva' : 'Chamado aberto',
      detalhe: chamado.equipamento,
      autor: preventiva ? 'Automático' : chamado.solicitanteNome ?? '',
      automatico: preventiva
    })
  ];

  for (const os of f.ordens) {
    const contratada = os.empresaContratadaId ? f.nomeContratada?.(os.empresaContratadaId) : undefined;
    lista.push(
      evento({
        chave: `os:${os.id}`,
        tipo: 'os',
        quando: os.dataCriacao,
        titulo: 'OS criada e enviada à empresa contratada',
        detalhe: [rotuloOS(os.numero), contratada].filter(Boolean).join(' · '),
        autor: ''
      })
    );

    const orcamentos = f.orcamentos.filter((o) => o.osId === os.id).sort((a, b) => a.dataCriacao.localeCompare(b.dataCriacao));
    for (const o of orcamentos) {
      lista.push(
        evento({
          chave: `orcamento:${o.id}`,
          tipo: 'orcamento',
          quando: o.dataCriacao,
          titulo: o.situacao === 'Substituído' ? 'Orçamento enviado (trocado depois por um novo)' : 'Orçamento enviado para aprovação',
          detalhe: resumoOrcamento(o),
          autor: ''
        })
      );
      if (o.situacao === 'Aprovado') {
        lista.push(
          evento({
            chave: `aprovado:${o.id}`,
            tipo: 'aprovado',
            quando: o.dataAprovacao ?? o.dataCriacao,
            titulo: 'Orçamento aprovado pela gestão',
            // O motivo do ajuste aparece aqui: antes a contratada via só que
            // houve ajuste, sem saber por quê.
            detalhe: o.ajustadoPeloGestor
              ? `Aprovado com ajuste de quantidade${o.observacaoAprovacao?.trim() ? `. Motivo: ${o.observacaoAprovacao.trim().replace(/[.!]$/, '')}` : ''}. O saldo do contrato ficou separado para o serviço.`
              : 'O saldo do contrato ficou separado para o serviço.',
            autor: ''
          })
        );
      }
      if (o.situacao === 'Rejeitado') {
        // O orçamento não guarda o dia da recusa; sem o log, fica sem data.
        lista.push(
          evento({
            chave: `recusado:${o.id}`,
            tipo: 'recusado',
            quando: '',
            titulo: 'Orçamento recusado pela gestão',
            detalhe: 'A empresa contratada precisa mandar um novo orçamento.',
            autor: ''
          })
        );
      }
    }

    if (os.dataExecucao && (os.situacao === 'Executada' || os.situacao === 'Encerrada')) {
      const sobra = (os.itensExecutados ?? []).some((i) => i.executado < i.orcado);
      lista.push(
        evento({
          chave: `executado:${os.id}`,
          tipo: 'executado',
          quando: os.dataExecucao,
          titulo: 'Serviço feito',
          detalhe: [comPonto(os.observacaoExecucao), sobra ? 'Parte do que estava separado não foi usada e voltou ao saldo livre.' : '']
            .filter(Boolean)
            .join(' '),
          autor: (os.executadoPor && f.nomeUsuario?.(os.executadoPor)) || ''
        })
      );
    }
  }

  if (chamado.status === 'Encerrado' && chamado.dataFechamento) {
    lista.push(
      evento({
        chave: `encerrado:${chamado.ordemServicoId ?? '-'}`,
        tipo: 'encerrado',
        quando: chamado.dataFechamento,
        titulo: 'Chamado encerrado',
        detalhe: 'A gestão conferiu o serviço e fechou o chamado.',
        autor: ''
      })
    );
  }
  if (chamado.status === 'Cancelado' && chamado.dataFechamento) {
    lista.push(
      evento({
        chave: `cancelado:${chamado.ordemServicoId ?? '-'}`,
        tipo: 'cancelado',
        quando: chamado.dataFechamento,
        titulo: 'Chamado cancelado',
        detalhe: '',
        autor: ''
      })
    );
  }
  return lista;
}

function campo<T>(detalhes: Record<string, unknown> | undefined | null, nome: string): T | undefined {
  return (detalhes ?? undefined)?.[nome] as T | undefined;
}

function paraDe(detalhes: Record<string, unknown> | undefined | null, nome: string): string | undefined {
  const v = campo<{ para?: unknown }>(detalhes, nome);
  return v && typeof v === 'object' && typeof v.para === 'string' ? v.para : undefined;
}

/** O marco que uma entrada do log representa, no mesmo formato. */
function marcoDoLog(log: LogEntrada, f: FonteLinhaDoTempo): EventoLinhaDoTempo {
  const automatico = log.usuarioUid === SISTEMA;
  const base = {
    quando: log.data,
    autor: automatico ? 'Automático' : log.usuarioNome,
    automatico
  };
  const d = log.detalhes;
  const motivo = campo<string>(d, 'motivo');

  if (log.alvo === 'chamado' && log.operacao === 'criar') {
    return evento({
      ...base,
      chave: 'aberto',
      tipo: 'aberto',
      titulo: automatico ? 'Chamado aberto pela manutenção preventiva' : 'Chamado aberto',
      detalhe: campo<string>(d, 'equipamento') ?? f.chamado.equipamento
    });
  }
  if (log.alvo === 'ordemServico' && log.operacao === 'criar') {
    const os = f.ordens.find((o) => o.id === log.alvoId);
    const contratada = os?.empresaContratadaId ? f.nomeContratada?.(os.empresaContratadaId) : undefined;
    return evento({
      ...base,
      chave: `os:${log.alvoId}`,
      tipo: 'os',
      titulo: 'OS criada e enviada à empresa contratada',
      detalhe: [rotuloOS(log.alvoRotulo), contratada].filter(Boolean).join(' · ')
    });
  }
  if (log.alvo === 'orcamento' && log.operacao === 'criar') {
    const orc = f.orcamentos.find((o) => o.id === log.alvoId);
    const itens = campo<number>(d, 'itens') ?? 0;
    const fora = campo<number>(d, 'itensForaContrato') ?? 0;
    const partes: string[] = [];
    if (itens) partes.push(plural(itens, 'item do contrato', 'itens do contrato'));
    if (fora) partes.push(plural(fora, 'item fora do contrato', 'itens fora do contrato'));
    return evento({
      ...base,
      chave: `orcamento:${log.alvoId}`,
      tipo: 'orcamento',
      titulo: orc?.situacao === 'Substituído' ? 'Orçamento enviado (trocado depois por um novo)' : 'Orçamento enviado para aprovação',
      detalhe: partes.join(' e ')
    });
  }
  if (log.alvo === 'orcamento' && log.operacao === 'transicao') {
    const para = paraDe(d, 'situacao');
    if (para === 'Aprovado') {
      const ajustes = campo<unknown[]>(d, 'ajustes');
      return evento({
        ...base,
        chave: `aprovado:${log.alvoId}`,
        tipo: 'aprovado',
        titulo: 'Orçamento aprovado pela gestão',
        detalhe:
          Array.isArray(ajustes) && ajustes.length
            ? 'Aprovado com ajuste de quantidade. O saldo do contrato ficou separado para o serviço.'
            : 'O saldo do contrato ficou separado para o serviço.'
      });
    }
    if (para === 'Rejeitado') {
      return evento({
        ...base,
        chave: `recusado:${log.alvoId}`,
        tipo: 'recusado',
        titulo: 'Orçamento recusado pela gestão',
        detalhe: 'A empresa contratada precisa mandar um novo orçamento.'
      });
    }
  }
  if (log.alvo === 'ordemServico' && log.operacao === 'transicao' && paraDe(d, 'situacao') === 'Executada') {
    const os = f.ordens.find((o) => o.id === log.alvoId);
    const devolvido = campo<number>(d, 'devolvidoAoContrato') ?? 0;
    return evento({
      ...base,
      chave: `executado:${log.alvoId}`,
      tipo: 'executado',
      titulo: 'Serviço feito',
      detalhe: [comPonto(os?.observacaoExecucao), devolvido ? 'Parte do que estava separado não foi usada e voltou ao saldo livre.' : '']
        .filter(Boolean)
        .join(' ')
    });
  }
  if (log.alvo === 'chamado' && log.operacao === 'transicao') {
    const para = paraDe(d, 'status');
    if (para === 'Encerrado') {
      return evento({
        ...base,
        chave: `encerrado:${campo<string>(d, 'osEncerradaJunto') ?? '-'}`,
        tipo: 'encerrado',
        titulo: 'Chamado encerrado',
        detalhe: 'A gestão conferiu o serviço e fechou o chamado.'
      });
    }
    if (para === 'Cancelado') {
      return evento({
        ...base,
        chave: `cancelado:${campo<string>(d, 'osCanceladaJunto') ?? '-'}`,
        tipo: 'cancelado',
        titulo: 'Chamado cancelado',
        detalhe: motivo ? `Motivo: ${motivo}` : ''
      });
    }
    if (para === 'Aberto') {
      return evento({
        ...base,
        chave: `reaberto:${log.id}`,
        tipo: 'reaberto',
        titulo: 'Chamado reaberto',
        detalhe: motivo ? `Motivo: ${motivo}. Um novo atendimento começa.` : 'Um novo atendimento começa.'
      });
    }
  }
  // Demais ações (responsável, técnico designado): a frase que a function
  // gravou, sem o prefixo repetido.
  const titulo =
    log.alvo === 'ordemServico' && log.operacao === 'editar'
      ? 'Técnico da OS'
      : log.alvo === 'chamado' && log.operacao === 'editar'
        ? 'Responsável na gestão'
        : 'Registro';
  return evento({ ...base, chave: `log:${log.id}`, tipo: 'outro', titulo, detalhe: limparTexto(log.descricao) });
}

function compararEventos(a: EventoLinhaDoTempo, b: EventoLinhaDoTempo): number {
  // Sem data (recusa sem log): logo depois do orçamento a que se refere.
  const diaA = a.quando.slice(0, 10);
  const diaB = b.quando.slice(0, 10);
  if (diaA && diaB && diaA !== diaB) return diaA.localeCompare(diaB);
  const comHora = a.quando.length > 10 && b.quando.length > 10;
  if (comHora && a.quando !== b.quando) return a.quando.localeCompare(b.quando);
  return ORDEM_TIPO[a.tipo] - ORDEM_TIPO[b.tipo];
}

/**
 * Linha do tempo do chamado e de tudo o que veio dele, do mais antigo ao
 * mais recente. Cada marco aparece uma vez: o do log, se houver, senão o do
 * registro.
 */
export function montarLinhaDoTempo(f: FonteLinhaDoTempo): EventoLinhaDoTempo[] {
  const porChave = new Map<string, EventoLinhaDoTempo>();
  for (const e of marcosDosRegistros(f)) porChave.set(e.chave, e);
  // Log mais antigo primeiro: se o mesmo marco tiver duas entradas, vale a
  // mais recente.
  const logs = [...(f.logs ?? [])].sort((a, b) => a.data.localeCompare(b.data));
  for (const log of logs) {
    const e = marcoDoLog(log, f);
    const doRegistro = porChave.get(e.chave);
    // O log não tem o nome de quem pediu quando foi o convidado do QR; o
    // registro tem.
    if (doRegistro && !e.autor) e.autor = doRegistro.autor;
    porChave.set(e.chave, e);
  }

  // Recusa sem data fica colada no orçamento dela.
  const eventos = [...porChave.values()];
  for (const e of eventos) {
    if (e.quando) continue;
    const id = e.chave.split(':')[1];
    const orc = eventos.find((x) => x.chave === `orcamento:${id}`);
    if (orc) e.quando = orc.quando.slice(0, 10);
  }
  return eventos.sort(compararEventos);
}

/** Ids cujo log interessa à linha do tempo (chamado, OS e orçamentos). */
export function idsDaLinhaDoTempo(f: Pick<FonteLinhaDoTempo, 'chamado' | 'ordens' | 'orcamentos'>): string[] {
  return [...new Set([f.chamado.id, ...f.ordens.map((o) => o.id), ...f.orcamentos.map((o) => o.id)])];
}

// A observação de quem fez o serviço termina com ponto antes do texto do
// sistema: antes as duas frases grudavam ("troquei 6 lâmpadas Parte do...").
function comPonto(texto: string | null | undefined): string {
  const t = (texto ?? '').trim();
  if (!t) return '';
  return /[.!?…]$/.test(t) ? t : `${t}.`;
}
