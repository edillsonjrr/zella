import type {
  AditivoContrato,
  Bloco,
  Chamado,
  Contrato,
  EmpresaContratada,
  Equipamento,
  ItemContrato,
  Orcamento,
  OrdemServico,
  PlanoManutencao,
  Sala,
  Unidade,
  Usuario
} from './models';
import { situacaoDoServico } from './situacao-servico';
import { custoDoServico, linhasDoServico, servicoFeito, type CustoServico, type LinhaServico } from './servico-os';
import { contaSaldo, quantidade } from './saldo';
import { nomeUnidade, rotuloPatrimonio } from './rotulos';

/**
 * Dados do relatório do mês e do histórico do equipamento (Z3.2), sem PDF:
 * o desenho fica em shared/pdf/relatorios-pdf.ts.
 *
 * Tudo sai do que a sessão já lê (DataService), então cada perfil vê no
 * relatório o mesmo que vê nas telas: as regras do Firestore já cortaram o
 * resto. A responsável da contratada, por exemplo, só recebe os contratos,
 * as OS e os orçamentos da empresa dela, e não lê os planos preventivos.
 */

/** O que o relatório lê. O DataService atende a esta forma. */
export interface FonteRelatorio {
  contratos(): Contrato[];
  ordensServico(): OrdemServico[];
  chamados(): Chamado[];
  planosManutencao(): PlanoManutencao[];
  equipamentos(): Equipamento[];
  getOrcamentoByOS(osId: string): Orcamento | undefined;
  getUsuarioById(id: string): Usuario | undefined;
  getEmpresaContratadaById(id: string | undefined): EmpresaContratada | undefined;
  getUnidadeById(id: string): Unidade | undefined;
  getBlocoById(id: string): Bloco | undefined;
  getSalaById(id: string): Sala | undefined;
  getEquipamentoById(id: string): Equipamento | undefined;
  getContratoById(id: string): Contrato | undefined;
  getPlanoById(id: string): PlanoManutencao | undefined;
}

const MESES = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];

const pad = (n: number) => String(n).padStart(2, '0');

/** Data local (não UTC) em YYYY-MM-DD. */
export function isoLocal(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export interface PeriodoMes {
  ano: number;
  mes: number;
  inicio: string;
  fim: string;
  rotulo: string;
}

export function periodoDoMes(ano: number, mes: number): PeriodoMes {
  const ultimo = new Date(ano, mes, 0).getDate();
  return { ano, mes, inicio: `${ano}-${pad(mes)}-01`, fim: `${ano}-${pad(mes)}-${pad(ultimo)}`, rotulo: `${MESES[mes - 1]} de ${ano}` };
}

/** Últimos `quantos` meses, do atual para trás, para a escolha na tela. */
export function mesesRecentes(hoje = new Date(), quantos = 13): PeriodoMes[] {
  const lista: PeriodoMes[] = [];
  for (let i = 0; i < quantos; i++) {
    const d = new Date(hoje.getFullYear(), hoje.getMonth() - i, 1);
    lista.push(periodoDoMes(d.getFullYear(), d.getMonth() + 1));
  }
  return lista;
}

const dentro = (data: string | undefined, inicio: string, fim: string) => !!data && data.slice(0, 10) >= inicio && data.slice(0, 10) <= fim;

/* Nomes para a tela e o PDF ----------------------------------------------- */

export function nomeTecnico(fonte: FonteRelatorio, os: OrdemServico): string {
  const id = os.executadoPor ?? os.tecnicoId;
  const nome = id ? fonte.getUsuarioById(id)?.nome : undefined;
  if (nome) return nome;
  const contratada = fonte.getEmpresaContratadaById(os.empresaContratadaId)?.nome;
  return contratada ? `Equipe da ${contratada}` : 'Não informado';
}

export function equipamentoDoChamado(fonte: FonteRelatorio, ch: Chamado): string {
  const e = ch.equipamentoId ? fonte.getEquipamentoById(ch.equipamentoId) : undefined;
  const patrimonio = rotuloPatrimonio(e?.patrimonio);
  return patrimonio ? `${ch.equipamento} (${patrimonio})` : ch.equipamento;
}

export function localDoChamado(fonte: FonteRelatorio, ch: Chamado): string {
  const e = ch.equipamentoId ? fonte.getEquipamentoById(ch.equipamentoId) : undefined;
  const salaBloco = e ? [e.blocoId ? fonte.getBlocoById(e.blocoId)?.nome : '', fonte.getSalaById(e.salaId)?.nome].filter(Boolean).join(', ') : '';
  return [nomeUnidade(fonte.getUnidadeById(ch.unidadeId), ''), ch.local || salaBloco].filter(Boolean).join(' · ');
}

// O status gravado do chamado, no vocabulário único do chamado e da OS
// (shared/situacao.ts): o mesmo texto da tela, do relatório e da planilha.
export function rotuloStatusChamado(status: Chamado['status']): string {
  return situacaoDoServico({ chamado: { status } }).rotulo;
}

/* Saldo de um item numa data ---------------------------------------------- */

export interface QuantidadesItem {
  contratado: number;
  usado: number;
  separado: number;
  livre: number;
}

function somaDoItem(linhas: { itemContratoId: string; quantidade: number }[] | undefined, itemId: string): number {
  return (linhas ?? []).filter(l => l.itemContratoId === itemId).reduce((s, l) => s + l.quantidade, 0);
}

/**
 * Saldo do item como estava no fim do dia `corte`, refeito pelos registros:
 *
 * - contratado: o de hoje, a não ser que um aditivo depois do corte tenha
 *   mudado o item; aí vale o "de" do primeiro desses aditivos;
 * - usado: o que as OS executadas até o corte usaram;
 * - separado: o aprovado das OS aprovadas até o corte que ainda não tinham
 *   sido executadas nem canceladas;
 * - livre: contratado − usado − separado. A conta fecha por construção.
 *
 * OS cancelada sem data conhecida (chamado reaberto depois) conta como
 * cancelada antes do corte.
 */
export function quantidadesNoCorte(
  item: ItemContrato,
  contratoId: string,
  corte: string,
  ordens: OrdemServico[],
  orcamentoDaOS: (os: OrdemServico) => Orcamento | undefined,
  aditivos: AditivoContrato[],
  chamadoPorId: Map<string, Chamado>
): QuantidadesItem {
  const depois = aditivos
    .filter(a => (a.data ?? '').slice(0, 10) > corte && a.itens?.some(i => i.itemContratoId === item.id))
    .sort((a, b) => (a.data ?? '').localeCompare(b.data ?? '') || a.numero - b.numero);
  const contratado = depois.length
    ? depois[0].itens.find(i => i.itemContratoId === item.id)!.quantidadeContratada.de
    : item.quantidadeContratada;

  let usado = 0;
  let separado = 0;
  for (const os of ordens) {
    if (os.contratoId !== contratoId) continue;
    const orc = orcamentoDaOS(os);
    const aprovado = orc?.situacao === 'Aprovado' ? somaDoItem(orc.itens, item.id) : 0;
    const dataAprovacao = orc?.dataAprovacao ?? orc?.dataCriacao ?? os.dataCriacao;
    if (servicoFeito(os)) {
      const dataExecucao = os.dataExecucao ?? dataAprovacao;
      if (dataExecucao <= corte) {
        const exec = os.itensExecutados?.find(e => e.itemContratoId === item.id);
        usado += exec ? exec.executado : aprovado;
        continue;
      }
    }
    if (!aprovado || dataAprovacao > corte) continue;
    if (os.situacao === 'Cancelada') {
      const ch = chamadoPorId.get(os.chamadoId);
      const dataCancelamento = ch?.status === 'Cancelado' && ch.ordemServicoId === os.id ? ch.dataFechamento : undefined;
      if (!dataCancelamento || dataCancelamento <= corte) continue;
    }
    separado += aprovado;
  }
  const arred = (v: number) => Math.round(v * 1000) / 1000;
  return { contratado, usado: arred(usado), separado: arred(separado), livre: arred(contratado - usado - separado) };
}

/* Relatório do mês -------------------------------------------------------- */

export interface SaldoItemMes extends QuantidadesItem {
  nome: string;
  unidade: string;
  preco: number;
  conta: string;
}

export interface SaldoContratoMes {
  contratoId: string;
  numero: string;
  fornecedor: string;
  vigencia: string;
  encerrado: boolean;
  itens: SaldoItemMes[];
  valores: QuantidadesItem;
}

export interface ServicoMes {
  osNumero: string;
  chamadoNumero: string;
  data: string;
  situacao: string;
  equipamento: string;
  local: string;
  tecnico: string;
  contrato: string;
  preventiva: boolean;
  linhas: LinhaServico[];
  custo: CustoServico;
}

export interface ForaContratoMes {
  osNumero: string;
  data: string;
  descricao: string;
  usado: number;
  unidade: string;
  preco: number;
  total: number;
}

export interface PreventivaMes {
  dataPrevista: string;
  plano: string;
  equipamento: string;
  situacao: string;
  feita: boolean;
}

export interface ChamadoEmAberto {
  numero: string;
  titulo: string;
  equipamento: string;
  local: string;
  abertoEm: string;
  prazo: string;
  emAtraso: boolean;
  situacaoHoje: string;
}

export interface RelatorioMensal {
  periodo: PeriodoMes;
  contrato?: { numero: string; fornecedor: string };
  // Data a que o saldo se refere: o último dia do mês, ou hoje se o mês não acabou.
  dataCorte: string;
  posicaoDeHoje: boolean;
  saldos: SaldoContratoMes[];
  servicos: ServicoMes[];
  custo: CustoServico;
  foraContrato: ForaContratoMes[];
  preventivas: PreventivaMes[];
  preventivasFeitas: number;
  chamadosAbertosNoMes: number;
  emAberto: ChamadoEmAberto[];
  emAtraso: number;
  // Recortes que a pessoa precisa saber (perfil, filtro por contrato).
  observacoes: string[];
}

export interface OpcoesRelatorioMensal {
  ano: number;
  mes: number;
  contratoId?: string;
  aditivos: Map<string, AditivoContrato[]>;
  // Perfil da contratada: só o que tem OS da empresa dela.
  soDaContratada?: boolean;
  hoje?: Date;
}

export function montarRelatorioMensal(fonte: FonteRelatorio, opcoes: OpcoesRelatorioMensal): RelatorioMensal {
  const periodo = periodoDoMes(opcoes.ano, opcoes.mes);
  const hoje = isoLocal(opcoes.hoje ?? new Date());
  const posicaoDeHoje = periodo.fim >= hoje;
  const dataCorte = posicaoDeHoje ? hoje : periodo.fim;
  const filtro = opcoes.contratoId ? fonte.getContratoById(opcoes.contratoId) : undefined;
  const observacoes: string[] = [];

  const todasOrdens = fonte.ordensServico();
  const ordens = todasOrdens.filter(os => !filtro || os.contratoId === filtro.id);
  const chamadoPorId = new Map(fonte.chamados().map(c => [c.id, c]));
  const ordensPorChamado = new Map<string, OrdemServico[]>();
  for (const os of ordens) ordensPorChamado.set(os.chamadoId, [...(ordensPorChamado.get(os.chamadoId) ?? []), os]);
  const orcamentoDaOS = (os: OrdemServico) => fonte.getOrcamentoByOS(os.id);

  // Chamados que entram: todos, para o gestor sem filtro; senão, só os que
  // têm OS no recorte (do contrato escolhido ou da contratada).
  const recortado = !!filtro || !!opcoes.soDaContratada;
  const chamados = fonte.chamados().filter(c => !recortado || ordensPorChamado.has(c.id));
  if (opcoes.soDaContratada) observacoes.push('Mostra só os contratos, as OS e os chamados da sua empresa.');
  if (filtro) observacoes.push(`Chamados e preventivas: só os que têm OS no contrato ${filtro.numero}.`);

  /* Saldo dos contratos */
  const comMovimento = (contratoId: string) =>
    todasOrdens.some(os => os.contratoId === contratoId && (dentro(os.dataExecucao, periodo.inicio, periodo.fim) || dentro(orcamentoDaOS(os)?.dataAprovacao, periodo.inicio, periodo.fim)));
  const contratos = filtro
    ? [filtro]
    : fonte.contratos()
        .filter(c => (!c.vigenciaInicio || c.vigenciaInicio <= periodo.fim))
        .filter(c => !c.encerradoEm || c.encerradoEm >= periodo.inicio)
        .filter(c => !c.vigenciaFim || c.vigenciaFim >= periodo.inicio || comMovimento(c.id))
        .sort((a, b) => a.numero.localeCompare(b.numero, 'pt-BR'));

  const saldos: SaldoContratoMes[] = contratos.map(c => {
    const aditivos = opcoes.aditivos.get(c.id) ?? [];
    const itens = [...c.itens]
      .sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'))
      .map(item => {
        const q = posicaoDeHoje
          ? { contratado: item.quantidadeContratada, usado: item.quantidadeConsumida, separado: item.quantidadeReservada, livre: item.quantidadeDisponivel }
          : quantidadesNoCorte(item, c.id, dataCorte, todasOrdens, orcamentoDaOS, aditivos, chamadoPorId);
        return {
          ...q,
          nome: item.nome,
          unidade: item.unidadeMedida,
          preco: item.precoUnitario || 0,
          conta: contaSaldo({
            quantidadeContratada: q.contratado,
            quantidadeConsumida: q.usado,
            quantidadeReservada: q.separado,
            quantidadeDisponivel: q.livre,
            unidadeMedida: item.unidadeMedida
          })
        };
      });
    const emReais = (campo: keyof QuantidadesItem) => Math.round(itens.reduce((s, i) => s + i[campo] * i.preco, 0) * 100) / 100;
    return {
      contratoId: c.id,
      numero: c.numero,
      fornecedor: c.fornecedor,
      vigencia: [c.vigenciaInicio, c.vigenciaFim].filter(Boolean).map(d => d.split('-').reverse().join('/')).join(' a '),
      encerrado: c.status === 'Encerrado',
      itens,
      valores: { contratado: emReais('contratado'), usado: emReais('usado'), separado: emReais('separado'), livre: emReais('livre') }
    };
  });

  /* Serviços feitos no mês */
  const servicos: ServicoMes[] = ordens
    .filter(os => servicoFeito(os) && dentro(os.dataExecucao, periodo.inicio, periodo.fim))
    .sort((a, b) => (a.dataExecucao ?? '').localeCompare(b.dataExecucao ?? '') || a.numero.localeCompare(b.numero))
    .map(os => {
      const ch = chamadoPorId.get(os.chamadoId);
      const contrato = fonte.getContratoById(os.contratoId);
      const unidadeDoItem = (id: string) => contrato?.itens.find(i => i.id === id)?.unidadeMedida ?? '';
      const linhas = linhasDoServico(os, orcamentoDaOS(os), unidadeDoItem);
      return {
        osNumero: os.numero,
        chamadoNumero: ch?.numero ?? '',
        data: os.dataExecucao ?? '',
        situacao: os.situacao,
        equipamento: ch ? equipamentoDoChamado(fonte, ch) : '',
        local: ch ? localDoChamado(fonte, ch) : '',
        tecnico: nomeTecnico(fonte, os),
        contrato: contrato?.numero ?? '',
        preventiva: ch?.origem === 'preventiva',
        linhas,
        custo: custoDoServico(linhas)
      };
    });
  const centavos = (v: number) => Math.round(v * 100) / 100;
  const custo: CustoServico = {
    contrato: centavos(servicos.reduce((s, x) => s + x.custo.contrato, 0)),
    foraContrato: centavos(servicos.reduce((s, x) => s + x.custo.foraContrato, 0)),
    total: centavos(servicos.reduce((s, x) => s + x.custo.total, 0))
  };
  const foraContrato: ForaContratoMes[] = servicos.flatMap(s =>
    s.linhas
      .filter(l => l.foraDoContrato && l.usado > 0)
      .map(l => ({ osNumero: s.osNumero, data: s.data, descricao: l.nome, usado: l.usado, unidade: l.unidade, preco: l.precoUnitario, total: centavos(l.usado * l.precoUnitario) }))
  );

  /* Preventivas previstas no mês */
  const preventivas: PreventivaMes[] = [];
  const chamadosPreventivos = new Set<string>();
  for (const ch of chamados) {
    if (ch.origem !== 'preventiva' || !dentro(ch.dataVencimento, periodo.inicio, periodo.fim)) continue;
    chamadosPreventivos.add(ch.id);
    const doChamado = todasOrdens.filter(os => os.chamadoId === ch.id);
    const feita = doChamado.filter(servicoFeito).sort((a, b) => (b.dataExecucao ?? '').localeCompare(a.dataExecucao ?? ''))[0];
    const plano = ch.planoId ? fonte.getPlanoById(ch.planoId) : undefined;
    let situacao: string;
    if (feita) situacao = `Feita em ${dataBrCurta(feita.dataExecucao)}`;
    else if (ch.status === 'Cancelado') situacao = 'Cancelada';
    else if ((ch.dataVencimento ?? '') < dataCorte) situacao = 'Atrasada, ainda não feita';
    else situacao = doChamado.length ? 'Em andamento' : 'Chamado aberto, sem OS';
    preventivas.push({
      dataPrevista: ch.dataVencimento ?? '',
      plano: plano?.nome ?? ch.titulo,
      equipamento: equipamentoDoChamado(fonte, ch),
      situacao,
      feita: !!feita
    });
  }
  // Planos com data no mês cujo chamado ainda não foi aberto (só o gestor
  // lê os planos; a contratada vê só as preventivas que viraram OS dela).
  if (!opcoes.soDaContratada) {
    for (const plano of fonte.planosManutencao()) {
      if (!plano.ativo || !dentro(plano.proximaExecucao, periodo.inicio, periodo.fim)) continue;
      if (filtro && plano.contratoId !== filtro.id) continue;
      if (chamadoPorId.has(`prev_${plano.id}_${plano.proximaExecucao}`)) continue;
      const e = fonte.getEquipamentoById(plano.equipamentoId);
      preventivas.push({
        dataPrevista: plano.proximaExecucao,
        plano: plano.nome,
        equipamento: e ? [e.nome, rotuloPatrimonio(e.patrimonio)].filter(Boolean).join(' · ') : 'Equipamento removido',
        situacao: plano.proximaExecucao < dataCorte ? 'Prevista; o chamado não foi aberto' : 'Prevista; o chamado abre perto da data',
        feita: false
      });
    }
  } else {
    observacoes.push('Preventivas: só as que viraram OS para a sua empresa.');
  }
  preventivas.sort((a, b) => a.dataPrevista.localeCompare(b.dataPrevista) || a.plano.localeCompare(b.plano, 'pt-BR'));

  /* Chamados abertos e em atraso */
  const fimDoChamado = (ch: Chamado): string | undefined => {
    if (ch.status === 'Executado' || ch.status === 'Encerrado') {
      const datas = todasOrdens.filter(os => os.chamadoId === ch.id && servicoFeito(os) && os.dataExecucao).map(os => os.dataExecucao!);
      return datas.sort().pop() ?? ch.dataFechamento ?? ch.dataCriacao;
    }
    if (ch.status === 'Cancelado') return ch.dataFechamento ?? ch.dataCriacao;
    return undefined;
  };
  const emAberto: ChamadoEmAberto[] = chamados
    .filter(ch => ch.dataCriacao <= dataCorte)
    .filter(ch => {
      const fim = fimDoChamado(ch);
      return !fim || fim > dataCorte;
    })
    .map(ch => {
      const emAtraso = !!ch.dataVencimento && ch.dataVencimento < dataCorte;
      return {
        numero: ch.numero,
        titulo: ch.titulo,
        equipamento: equipamentoDoChamado(fonte, ch),
        local: localDoChamado(fonte, ch),
        abertoEm: ch.dataCriacao,
        prazo: ch.dataVencimento ?? '',
        emAtraso,
        situacaoHoje: rotuloStatusChamado(ch.status)
      };
    })
    .sort((a, b) => Number(b.emAtraso) - Number(a.emAtraso) || a.abertoEm.localeCompare(b.abertoEm) || a.numero.localeCompare(b.numero));

  return {
    periodo,
    contrato: filtro ? { numero: filtro.numero, fornecedor: filtro.fornecedor } : undefined,
    dataCorte,
    posicaoDeHoje,
    saldos,
    servicos,
    custo,
    foraContrato,
    preventivas,
    preventivasFeitas: preventivas.filter(p => p.feita).length,
    chamadosAbertosNoMes: chamados.filter(ch => dentro(ch.dataCriacao, periodo.inicio, periodo.fim)).length,
    emAberto,
    emAtraso: emAberto.filter(c => c.emAtraso).length,
    observacoes
  };
}

function dataBrCurta(iso: string | undefined): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso ?? '');
  return m ? `${m[3]}/${m[2]}/${m[1]}` : '';
}

/* Histórico de manutenção do equipamento ---------------------------------- */

export interface ServicoDoEquipamento {
  chamadoNumero: string;
  titulo: string;
  descricao: string;
  tipo: 'Preventiva' | 'Corretiva';
  plano: string;
  abertoEm: string;
  situacao: string;
  ordens: string;
  contrato: string;
  feitoEm: string;
  tecnico: string;
  observacao: string;
  linhas: LinhaServico[];
  custo: CustoServico;
}

export interface HistoricoEquipamento {
  equipamento: Equipamento;
  local: string;
  planos: { nome: string; periodicidade: string; proxima: string; ultima: string; ativo: boolean }[];
  servicos: ServicoDoEquipamento[];
  totais: { chamados: number; preventivas: number; corretivas: number; feitos: number; custo: CustoServico };
}

/**
 * Tudo o que já aconteceu com o equipamento: chamados ligados a ele pelo
 * cadastro (`equipamentoId`), pelos planos preventivos dele ou, nos
 * chamados antigos sem id, pelo nome na mesma unidade. Cada chamado leva as
 * OS que teve (um chamado reaberto ganha OS nova).
 */
export function montarHistoricoEquipamento(fonte: FonteRelatorio, equipamento: Equipamento): HistoricoEquipamento {
  const planosDele = fonte.planosManutencao().filter(p => p.equipamentoId === equipamento.id);
  const idsPlanos = new Set(planosDele.map(p => p.id));
  const nome = equipamento.nome.trim().toLowerCase();
  const chamados = fonte.chamados().filter(ch =>
    ch.equipamentoId === equipamento.id
    || (!!ch.planoId && idsPlanos.has(ch.planoId))
    || (!ch.equipamentoId && !ch.planoId && ch.unidadeId === equipamento.unidadeId && ch.equipamento.trim().toLowerCase() === nome)
  );

  const servicos = chamados
    .map((ch): ServicoDoEquipamento => {
      const ordens = fonte.ordensServico().filter(os => os.chamadoId === ch.id).sort((a, b) => a.dataCriacao.localeCompare(b.dataCriacao));
      const feitas = ordens.filter(servicoFeito);
      const ultima = feitas[feitas.length - 1];
      const linhas = feitas.flatMap(os => {
        const contrato = fonte.getContratoById(os.contratoId);
        return linhasDoServico(os, fonte.getOrcamentoByOS(os.id), id => contrato?.itens.find(i => i.id === id)?.unidadeMedida ?? '');
      });
      const plano = ch.planoId ? fonte.getPlanoById(ch.planoId) : undefined;
      return {
        chamadoNumero: ch.numero,
        titulo: ch.titulo,
        descricao: ch.descricao,
        tipo: ch.origem === 'preventiva' ? 'Preventiva' : 'Corretiva',
        plano: plano?.nome ?? '',
        abertoEm: ch.dataCriacao,
        situacao: rotuloStatusChamado(ch.status),
        ordens: ordens.map(os => `${os.numero} (${os.situacao})`).join(', '),
        contrato: [...new Set(ordens.map(os => fonte.getContratoById(os.contratoId)?.numero).filter(Boolean))].join(', '),
        feitoEm: ultima?.dataExecucao ?? '',
        tecnico: ultima ? nomeTecnico(fonte, ultima) : '',
        observacao: feitas.map(os => os.observacaoExecucao).filter(Boolean).join(' / '),
        linhas,
        custo: custoDoServico(linhas)
      };
    })
    .sort((a, b) => b.abertoEm.localeCompare(a.abertoEm) || b.chamadoNumero.localeCompare(a.chamadoNumero));

  const centavos = (v: number) => Math.round(v * 100) / 100;
  const sala = fonte.getSalaById(equipamento.salaId)?.nome;
  const bloco = equipamento.blocoId ? fonte.getBlocoById(equipamento.blocoId)?.nome : '';
  return {
    equipamento,
    local: [nomeUnidade(fonte.getUnidadeById(equipamento.unidadeId), ''), bloco, sala].filter(Boolean).join(' · '),
    planos: planosDele.map(p => ({
      nome: p.nome,
      periodicidade: `a cada ${quantidade(p.periodicidadeDias)} ${p.periodicidadeDias === 1 ? 'dia' : 'dias'}`,
      proxima: p.proximaExecucao,
      ultima: p.ultimaExecucao ?? '',
      ativo: p.ativo
    })),
    servicos,
    totais: {
      chamados: servicos.length,
      preventivas: servicos.filter(s => s.tipo === 'Preventiva').length,
      corretivas: servicos.filter(s => s.tipo === 'Corretiva').length,
      feitos: servicos.filter(s => !!s.feitoEm || s.linhas.length > 0).length,
      custo: {
        contrato: centavos(servicos.reduce((s, x) => s + x.custo.contrato, 0)),
        foraContrato: centavos(servicos.reduce((s, x) => s + x.custo.foraContrato, 0)),
        total: centavos(servicos.reduce((s, x) => s + x.custo.total, 0))
      }
    }
  };
}
