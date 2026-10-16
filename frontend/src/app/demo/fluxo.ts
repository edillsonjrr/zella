import { plural, rotuloOS } from '../../../../shared/historico';
import { situacaoDoServico } from '../../../../shared/situacao';
import type {
  AditivoContrato,
  AlvoLog,
  Chamado,
  ItemForaContrato,
  ItemForaContratoExecutado,
  ItemForaContratoPedido,
  LogEntrada,
  Notificacao,
  OperacaoLog,
  Orcamento,
  OrcamentoItem,
  OrcamentoPedidoItem,
  OrdemServico,
  PerfilEmpresa,
  PerfilUsuario,
  PlanoManutencao,
  QrAlvoTipo,
  SituacaoOS,
  UrgenciaChamado
} from '../shared/models';
import type { Ator, DadosDemo } from './tipos';

/**
 * As regras das Cloud Functions, refeitas em memória para a demonstração.
 *
 * Cada função aqui espelha uma callable de functions/src (criarChamado,
 * criarOS, aprovarOrcamento, executarOS...): mesmas conferências, mesmas
 * mensagens de recusa, mesmo movimento de saldo, mesmo log e mesmos avisos
 * no sino. Recebem os dados já copiados pelo banco (BancoDemo.alterar), que
 * só grava se a função terminar sem erro — o papel da transação.
 */

/** Frase fixa para o que depende de servidor e não acontece na demonstração. */
export const AVISO_DEMO = 'Na demonstração isto não sai de verdade.';

const SLA_DIAS = 5;
const MAX_FOTOS_EXECUCAO = 3;
const LOCAL_MAX = 120;

function falha(mensagem: string): never {
  throw new Error(mensagem);
}

export function hojeISO(): string {
  return new Date().toISOString().split('T')[0];
}

export function somarDias(dataISO: string, dias: number): string {
  const d = new Date(`${dataISO}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + dias);
  return d.toISOString().split('T')[0];
}

let sequencia = 0;
/** Id novo, no estilo dos ids automáticos do Firestore (curto, sem repetir). */
export function novoId(): string {
  sequencia = (sequencia + 1) % 1296;
  return `${Date.now().toString(36)}${sequencia.toString(36).padStart(2, '0')}${Math.random().toString(36).slice(2, 6)}`;
}

function reais(valor: number): string {
  return valor.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

function itensTexto(n: number): string {
  return plural(n, 'item', 'itens');
}

function situacaoTexto(situacao: string): string {
  return situacaoDoServico({ os: { situacao: situacao as SituacaoOS } }).rotulo.toLowerCase();
}

function agregarPorItem(itens: OrcamentoItem[]): Map<string, number> {
  const mapa = new Map<string, number>();
  for (const item of itens) mapa.set(item.itemContratoId, (mapa.get(item.itemContratoId) ?? 0) + item.quantidade);
  return mapa;
}

function centavos(v: number): number {
  return Math.round(v * 100) / 100;
}

/* Contadores, log e avisos ------------------------------------------------ */

function proximoNumero(d: DadosDemo, prefixo: 'CH' | 'OS' | 'ORC'): string {
  const ano = new Date().getFullYear();
  const chave = `${prefixo}-${ano}`;
  const proximo = (d.contadores[chave] ?? 0) + 1;
  d.contadores[chave] = proximo;
  return `${chave}-${String(proximo).padStart(4, '0')}`;
}

export interface RegistroLog {
  alvo: AlvoLog;
  operacao: OperacaoLog;
  descricao: string;
  alvoId: string;
  alvoRotulo: string;
  alvoPaiId?: string;
  detalhes?: Record<string, unknown>;
}

export function registrarLog(d: DadosDemo, autor: Pick<Ator, 'uid' | 'nome' | 'email'>, r: RegistroLog, origem: LogEntrada['origem'] = 'backend'): void {
  d.logs.push({
    id: novoId(),
    acao: `${r.alvo}.${r.operacao}`,
    alvo: r.alvo,
    operacao: r.operacao,
    descricao: r.descricao,
    data: new Date().toISOString(),
    usuarioUid: autor.uid,
    usuarioNome: autor.nome,
    usuarioEmail: autor.email,
    alvoId: r.alvoId,
    alvoRotulo: r.alvoRotulo,
    alvoPaiId: r.alvoPaiId ?? r.alvoId,
    ...(r.detalhes ? { detalhes: r.detalhes } : {}),
    origem
  });
}

function notificar(d: DadosDemo, n: Omit<Notificacao, 'id' | 'data' | 'lidaPor'>): void {
  // Campo vazio não entra: a leitura filtra por campo, como a consulta real.
  const limpo = Object.fromEntries(Object.entries(n).filter(([, v]) => v !== undefined)) as typeof n;
  d.notificacoes.push({ id: novoId(), ...limpo, data: new Date().toISOString(), lidaPor: [] });
}

/** Avisa quem abriu o chamado (functions/src/notificacoes.ts). */
function avisarSolicitante(d: DadosDemo, chamado: Chamado, autorUsuarioId: string, aviso: { titulo: string; texto: string }): void {
  const id = chamado.solicitanteId;
  if (!id || id === 'sistema' || id === autorUsuarioId) return;
  const solicitante = d.usuarios.find(u => u.id === id);
  if (!solicitante) return;
  const link = solicitante.perfil === 'cliente' ? `/meus-pedidos?pedido=${chamado.id}` : `/dashboard?chamado=${chamado.id}`;
  notificar(d, {
    paraUsuarioId: id,
    titulo: aviso.titulo,
    texto: aviso.texto,
    link,
    alvo: { tipo: 'chamado', id: chamado.id, numero: chamado.numero }
  });
}

/* Permissões (functions/src/admin.ts) -------------------------------------- */

function exigirPerfil(ator: Ator, permitidos: readonly PerfilEmpresa[]): void {
  if (!permitidos.includes(ator.perfil as PerfilEmpresa)) falha('Seu perfil não pode fazer esta ação.');
}

function daContratada(ator: Ator): boolean {
  return ator.perfil === 'gestor_contratado' || ator.perfil === 'tecnico';
}

function exigirMesmaContratada(ator: Ator, dono: { empresaContratadaId?: string | null } | undefined): void {
  if (!daContratada(ator)) return;
  if (!ator.empresaContratadaId || dono?.empresaContratadaId !== ator.empresaContratadaId) {
    falha('Este registro pertence a outra empresa contratada.');
  }
}

function exigirTecnicoDesignado(ator: Ator, os: { tecnicoId?: string | null }): void {
  if (ator.perfil !== 'tecnico') return;
  if (os.tecnicoId && os.tecnicoId !== ator.usuarioId) falha('Esta OS está designada a outro técnico.');
}

function quemOrca(d: DadosDemo, empresaContratadaId: string | undefined): 'prestadora' | 'tecnico' {
  if (!empresaContratadaId) return 'tecnico';
  return d.usuarios.some(u => u.empresaContratadaId === empresaContratadaId && u.perfil === 'gestor_contratado') ? 'prestadora' : 'tecnico';
}

function textoParaTecnico(situacao: string, orca: 'prestadora' | 'tecnico'): string {
  if (situacao === 'Aprovada') return 'O orçamento já foi aprovado: faça o serviço e registre como feito.';
  if (orca === 'tecnico') return 'Confira o pedido e envie o orçamento para a gestão aprovar.';
  return 'Sua empresa manda o orçamento. Depois que a gestão aprovar, você faz o serviço e registra como feito.';
}

function chamadoOu404(d: DadosDemo, id: string): Chamado {
  return d.chamados.find(c => c.id === id) ?? falha('Chamado não encontrado.');
}

function osOu404(d: DadosDemo, id: string): OrdemServico {
  return d.ordensServico.find(o => o.id === id) ?? falha('Ordem de serviço não encontrada.');
}

/* Chamados (chamados.ts, fluxoChamado.ts, execucao.ts) ---------------------- */

const ROTULO_URGENCIA: Record<UrgenciaChamado, string> = {
  baixa: 'pode esperar',
  media: 'atrapalha o trabalho',
  alta: 'urgente'
};

export interface EntradaChamado {
  titulo: string;
  equipamento: string;
  numeroSerie?: string;
  descricao: string;
  unidadeId?: string;
  solicitanteNome: string;
  // Foto já reduzida para caber no navegador (data URL).
  foto?: string;
  local?: string;
  urgencia?: UrgenciaChamado;
  equipamentoId?: string;
}

/** O que o QR Code aponta, já resolvido a partir do token. */
export interface AlvoQr {
  tipo: QrAlvoTipo;
  id: string;
  unidadeId: string;
  unidadeNome: string | null;
  nome?: string;
}

/** validarQrToken: na demonstração o token é "tipo.id", sem prazo. */
export function resolverQrToken(d: DadosDemo, token: string): AlvoQr {
  const [tipo, ...resto] = (token ?? '').split('.');
  const id = resto.join('.');
  const invalido = () => falha('Este link do QR Code não vale mais. Escaneie a plaqueta de novo.');
  const unidadeNome = (unidadeId: string) => d.unidades.find(u => u.id === unidadeId)?.nome ?? null;
  switch (tipo) {
    case 'unidade': {
      const u = d.unidades.find(x => x.id === id) ?? invalido();
      return { tipo, id, unidadeId: u.id, unidadeNome: u.nome, nome: u.nome };
    }
    case 'bloco': {
      const b = d.blocos.find(x => x.id === id) ?? invalido();
      return { tipo, id, unidadeId: b.unidadeId, unidadeNome: unidadeNome(b.unidadeId), nome: b.nome };
    }
    case 'sala': {
      const s = d.salas.find(x => x.id === id) ?? invalido();
      return { tipo, id, unidadeId: s.unidadeId, unidadeNome: unidadeNome(s.unidadeId), nome: s.nome };
    }
    case 'equipamento': {
      const e = d.equipamentos.find(x => x.id === id) ?? invalido();
      return { tipo, id, unidadeId: e.unidadeId, unidadeNome: unidadeNome(e.unidadeId), nome: e.nome };
    }
    default:
      return invalido();
  }
}

export function criarChamado(d: DadosDemo, ator: Ator, dados: EntradaChamado, qr?: AlvoQr): { id: string; numero: string } {
  const local = (dados.local ?? '').trim();
  if (local.length > LOCAL_MAX) falha(`O campo "Onde fica" aceita até ${LOCAL_MAX} letras.`);
  let unidadeId: string;
  let solicitanteId: string;
  let equipamentoId = dados.equipamentoId || undefined;

  if (qr) {
    unidadeId = qr.unidadeId;
    solicitanteId = ator.uid;
    equipamentoId = qr.tipo === 'equipamento' ? qr.id : undefined;
  } else {
    if (ator.perfil === 'convidado') falha('Escaneie o QR Code para abrir um chamado.');
    exigirPerfil(ator, ['cliente', 'gestor']);
    if (!dados.unidadeId) falha('Informe a unidade.');
    unidadeId = dados.unidadeId;
    solicitanteId = ator.usuarioId;
    if (ator.perfil === 'cliente' && ator.unidadeId && ator.unidadeId !== unidadeId) {
      falha('O solicitante só abre chamado na própria unidade.');
    }
    if (equipamentoId) {
      const equipamento = d.equipamentos.find(e => e.id === equipamentoId);
      if (!equipamento) falha('O equipamento escolhido não está no cadastro. Escolha "Outro" e descreva.');
      if (equipamento.unidadeId !== unidadeId) falha('O equipamento escolhido é de outra unidade.');
    }
  }

  if (!dados.equipamento || !dados.descricao || !dados.solicitanteNome?.trim()) {
    falha('Preencha equipamento, descrição e seu nome.');
  }
  const solicitanteNome = dados.solicitanteNome.trim().slice(0, 120);
  const numero = proximoNumero(d, 'CH');
  const hoje = hojeISO();
  const id = novoId();

  const chamado: Chamado = {
    id,
    numero,
    titulo: dados.titulo || dados.equipamento,
    equipamento: dados.equipamento,
    descricao: dados.descricao,
    unidadeId,
    solicitanteId,
    solicitanteNome,
    status: 'Aberto',
    dataCriacao: hoje,
    dataVencimento: somarDias(hoje, SLA_DIAS),
    possuiFoto: !!dados.foto,
    origem: 'manual'
  };
  if (dados.numeroSerie) chamado.numeroSerie = dados.numeroSerie;
  // Na demonstração a foto fica no próprio registro, no lugar do caminho
  // do Storage (shared/arquivos.demo.ts lê dali).
  if (dados.foto) chamado.fotoPath = dados.foto;
  if (local) chamado.local = local;
  if (dados.urgencia) chamado.urgencia = dados.urgencia;
  if (equipamentoId) chamado.equipamentoId = equipamentoId;
  d.chamados.push(chamado);

  registrarLog(d, { ...ator, nome: ator.usuarioId ? ator.nome : solicitanteNome }, {
    alvo: 'chamado',
    operacao: 'criar',
    descricao: `Abriu o chamado ${numero} — ${dados.equipamento}`,
    alvoId: id,
    alvoRotulo: numero,
    detalhes: { equipamento: dados.equipamento, unidadeId, solicitante: solicitanteNome, slaDias: SLA_DIAS, local: local || null, urgencia: dados.urgencia ?? null }
  });

  const urgencia = dados.urgencia ? ` Urgência: ${ROTULO_URGENCIA[dados.urgencia]}.` : '';
  notificar(d, {
    paraPerfil: 'gestor',
    titulo: `Novo chamado ${numero}`,
    texto: `${solicitanteNome} abriu "${dados.equipamento}". Prazo: ${SLA_DIAS} dias.${urgencia}`,
    link: `/dashboard?chamado=${id}`,
    alvo: { tipo: 'chamado', id, numero }
  });
  return { id, numero };
}

export function atribuirResponsavelChamado(d: DadosDemo, ator: Ator, chamadoId: string, gestorId: string | null): void {
  exigirPerfil(ator, ['gestor']);
  const chamado = chamadoOu404(d, chamadoId);
  const nomeGestor = gestorId ? (d.usuarios.find(u => u.id === gestorId)?.nome ?? gestorId) : 'ninguém';
  const anterior = chamado.responsavelId ?? null;
  if (gestorId) chamado.responsavelId = gestorId;
  else delete chamado.responsavelId;
  registrarLog(d, ator, {
    alvo: 'chamado',
    operacao: 'editar',
    descricao: gestorId ? `Atribuiu o chamado ${chamado.numero} a ${nomeGestor}` : `Removeu o responsável do chamado ${chamado.numero}`,
    alvoId: chamadoId,
    alvoRotulo: chamado.numero,
    detalhes: { responsavel: { de: anterior, para: gestorId } }
  });
}

export function cancelarChamado(d: DadosDemo, ator: Ator, chamadoId: string, motivoBruto?: string): void {
  exigirPerfil(ator, ['gestor', 'gestor_contratado']);
  const motivo = (motivoBruto ?? '').trim().slice(0, 300);
  const chamado = chamadoOu404(d, chamadoId);
  if (['Executado', 'Encerrado', 'Cancelado'].includes(chamado.status)) {
    falha(`O chamado ${chamado.numero} está "${situacaoDoServico({ chamado: { status: chamado.status } }).rotulo.toLowerCase()}" e não pode mais ser cancelado.`);
  }
  // A contratada só cancela chamado dos próprios contratos.
  if (ator.perfil === 'gestor_contratado') {
    const dono = chamado.empresaContratadaId ? chamado : d.ordensServico.find(o => o.id === chamado.ordemServicoId);
    exigirMesmaContratada(ator, dono);
  }

  let saldoDevolvido = 0;
  const statusAnterior = chamado.status;
  if (chamado.ordemServicoId) {
    const os = d.ordensServico.find(o => o.id === chamado.ordemServicoId);
    if (os && os.situacao === 'Aprovada' && os.orcamentoId) {
      const orcamento = d.orcamentos.find(o => o.id === os.orcamentoId);
      if (orcamento?.situacao === 'Aprovado') {
        const contrato = d.contratos.find(c => c.id === os.contratoId);
        for (const [itemId, qtd] of agregarPorItem(orcamento.itens)) {
          const item = contrato?.itens.find(i => i.id === itemId);
          if (!item) continue;
          // Devolve o que está de fato separado, para a conta do item fechar.
          const devolver = Math.min(item.quantidadeReservada, qtd);
          item.quantidadeReservada -= devolver;
          item.quantidadeDisponivel += devolver;
          saldoDevolvido += devolver;
        }
      }
    }
    if (os && os.situacao !== 'Executada' && os.situacao !== 'Encerrada') os.situacao = 'Cancelada';
  }

  chamado.status = 'Cancelado';
  chamado.dataFechamento = hojeISO();

  registrarLog(d, ator, {
    alvo: 'chamado',
    operacao: 'transicao',
    descricao: `Cancelou o chamado ${chamado.numero}${motivo ? ` — ${motivo}` : ''}`,
    alvoId: chamadoId,
    alvoRotulo: chamado.numero,
    detalhes: { status: { de: statusAnterior, para: 'Cancelado' }, motivo: motivo || null, osCanceladaJunto: chamado.ordemServicoId ?? null, saldoDevolvido }
  });
  avisarSolicitante(d, chamado, ator.usuarioId, {
    titulo: `Pedido ${chamado.numero} cancelado`,
    texto: motivo ? `O pedido foi cancelado. Motivo: ${motivo}` : 'O pedido foi cancelado. Se o problema continuar, faça um novo pedido.'
  });
}

export function reabrirChamado(d: DadosDemo, ator: Ator, chamadoId: string, motivoBruto?: string): void {
  exigirPerfil(ator, ['gestor']);
  const motivo = (motivoBruto ?? '').trim().slice(0, 300);
  const chamado = chamadoOu404(d, chamadoId);
  if (!['Encerrado', 'Cancelado'].includes(chamado.status)) {
    falha(`O chamado ${chamado.numero} ainda está em andamento; só reabre depois de encerrado ou cancelado.`);
  }
  const statusAnterior = chamado.status;
  const osAnterior = chamado.ordemServicoId ?? null;
  chamado.status = 'Aberto';
  delete chamado.dataFechamento;
  delete chamado.ordemServicoId;
  delete chamado.empresaContratadaId;
  registrarLog(d, ator, {
    alvo: 'chamado',
    operacao: 'transicao',
    descricao: `Reabriu o chamado ${chamado.numero}${motivo ? ` — ${motivo}` : ''}`,
    alvoId: chamadoId,
    alvoRotulo: chamado.numero,
    detalhes: { status: { de: statusAnterior, para: 'Aberto' }, motivo: motivo || null, osAnterior }
  });
}

export function encerrarChamado(d: DadosDemo, ator: Ator, chamadoId: string): void {
  exigirPerfil(ator, ['gestor']);
  const chamado = chamadoOu404(d, chamadoId);
  if (chamado.status !== 'Executado') {
    falha(
      `O chamado ${chamado.numero} ainda não teve o serviço registrado como feito. Só dá para encerrar depois disso; se o serviço não vai acontecer, cancele o chamado.`
    );
  }
  const statusAnterior = chamado.status;
  chamado.status = 'Encerrado';
  chamado.dataFechamento = hojeISO();
  const os = chamado.ordemServicoId ? d.ordensServico.find(o => o.id === chamado.ordemServicoId) : undefined;
  if (os) os.situacao = 'Encerrada';

  registrarLog(d, ator, {
    alvo: 'chamado',
    operacao: 'transicao',
    descricao: `Encerrou o chamado ${chamado.numero}`,
    alvoId: chamadoId,
    alvoRotulo: chamado.numero,
    detalhes: { status: { de: statusAnterior, para: 'Encerrado' }, osEncerradaJunto: chamado.ordemServicoId ?? null }
  });
  avisarSolicitante(d, chamado, ator.usuarioId, {
    titulo: `Pedido ${chamado.numero} concluído`,
    texto: 'A gestão conferiu e encerrou o pedido. Abra para ver o resumo do serviço.'
  });
}

/* Ordens de serviço (ordensServico.ts) ------------------------------------ */

export function criarOS(d: DadosDemo, ator: Ator, dados: { chamadoId: string; contratoId: string; tecnicoId?: string }): { id: string; numero: string } {
  exigirPerfil(ator, ['gestor']);
  const { chamadoId, contratoId, tecnicoId } = dados;
  if (!chamadoId || !contratoId) falha('Informe o chamado de origem e o contrato.');

  const tecnico = tecnicoId ? d.usuarios.find(u => u.id === tecnicoId) : undefined;
  if (tecnicoId && (!tecnico || tecnico.perfil !== 'tecnico')) falha('O usuário escolhido não é um técnico.');

  const chamado = chamadoOu404(d, chamadoId);
  if (chamado.ordemServicoId) falha('Este chamado já tem uma ordem de serviço.');
  if (chamado.status === 'Cancelado') falha('Chamado cancelado não recebe OS. Reabra-o antes.');

  const contrato = d.contratos.find(c => c.id === contratoId) ?? falha('Contrato não encontrado.');
  const hoje = hojeISO();
  if (contrato.status === 'Encerrado' || contrato.vigenciaFim < hoje) falha(`O contrato ${contrato.numero} está encerrado ou vencido.`);
  exigirMesmaContratada(ator, contrato);
  if (tecnico && contrato.empresaContratadaId && tecnico.empresaContratadaId !== contrato.empresaContratadaId) {
    falha('O técnico precisa ser da empresa contratada do contrato escolhido.');
  }
  const orca = tecnicoId ? quemOrca(d, contrato.empresaContratadaId) : 'tecnico';

  const numero = proximoNumero(d, 'OS');
  const id = novoId();
  const os: OrdemServico = {
    id,
    numero,
    chamadoId,
    contratoId,
    unidadeId: chamado.unidadeId,
    situacao: 'Aberta',
    dataCriacao: hoje
  };
  if (tecnicoId) os.tecnicoId = tecnicoId;
  if (contrato.empresaContratadaId) os.empresaContratadaId = contrato.empresaContratadaId;
  d.ordensServico.push(os);
  chamado.status = 'Em atendimento';
  chamado.ordemServicoId = id;
  if (contrato.empresaContratadaId) chamado.empresaContratadaId = contrato.empresaContratadaId;
  else delete chamado.empresaContratadaId;

  registrarLog(d, ator, {
    alvo: 'ordemServico',
    operacao: 'criar',
    descricao: `Criou a ${rotuloOS(numero)} a partir do chamado ${chamado.numero}`,
    alvoId: id,
    alvoRotulo: numero,
    alvoPaiId: chamadoId,
    detalhes: { chamado: chamado.numero, contratoId, tecnicoId: tecnicoId ?? null }
  });

  if (contrato.empresaContratadaId) {
    notificar(d, {
      paraPerfil: 'gestor_contratado',
      empresaContratadaId: contrato.empresaContratadaId,
      titulo: `Nova ${rotuloOS(numero)}`,
      texto: `Aberta no contrato ${contrato.numero} para o chamado ${chamado.numero}. Aguarda o orçamento da sua empresa.`,
      link: `/ordens-servico?os=${id}`,
      alvo: { tipo: 'ordemServico', id, numero }
    });
  }
  if (tecnicoId) {
    notificar(d, {
      paraUsuarioId: tecnicoId,
      titulo: `${rotuloOS(numero)} designada a você`,
      texto: `Chamado ${chamado.numero}: ${chamado.equipamento}. ${textoParaTecnico('Aberta', orca)}`,
      link: `/ordens-servico?os=${id}`,
      alvo: { tipo: 'ordemServico', id, numero }
    });
  }
  avisarSolicitante(d, chamado, ator.usuarioId, {
    titulo: `Pedido ${chamado.numero} encaminhado`,
    texto: `Seu pedido foi enviado à empresa contratada (${rotuloOS(numero)}). Ela vai avaliar o serviço.`
  });
  return { id, numero };
}

export function atribuirTecnicoOS(d: DadosDemo, ator: Ator, osId: string, tecnicoId: string | null): void {
  exigirPerfil(ator, ['gestor', 'gestor_contratado']);
  if (!osId) falha('Informe a OS.');
  const tecnico = tecnicoId ? d.usuarios.find(u => u.id === tecnicoId) : undefined;
  if (tecnicoId && (!tecnico || tecnico.perfil !== 'tecnico')) falha('O usuário informado não é um técnico.');
  const os = osOu404(d, osId);
  exigirMesmaContratada(ator, os);
  if (['Executada', 'Encerrada', 'Cancelada'].includes(os.situacao)) {
    falha(`A ${rotuloOS(os.numero)} já foi ${os.situacao === 'Cancelada' ? 'cancelada' : 'feita'} e não muda mais de técnico.`);
  }
  if (tecnico && os.empresaContratadaId && tecnico.empresaContratadaId !== os.empresaContratadaId) {
    falha('O técnico precisa ser da empresa contratada desta OS.');
  }
  const anterior = os.tecnicoId ?? null;
  if (tecnicoId) os.tecnicoId = tecnicoId;
  else delete os.tecnicoId;

  registrarLog(d, ator, {
    alvo: 'ordemServico',
    operacao: 'editar',
    descricao: tecnicoId ? `Designou a ${rotuloOS(os.numero)} a ${tecnico?.nome ?? tecnicoId}` : `Removeu o técnico da ${rotuloOS(os.numero)}`,
    alvoId: osId,
    alvoRotulo: os.numero,
    detalhes: { tecnico: { de: anterior, para: tecnicoId ?? null } }
  });
  if (tecnicoId) {
    notificar(d, {
      paraUsuarioId: tecnicoId,
      titulo: `${rotuloOS(os.numero)} designada a você`,
      texto: textoParaTecnico(os.situacao, quemOrca(d, os.empresaContratadaId)),
      link: `/ordens-servico?os=${osId}`,
      alvo: { tipo: 'ordemServico', id: osId, numero: os.numero }
    });
  }
}

/* Orçamentos (orcamentos.ts, foraContrato.ts) ----------------------------- */

const SITUACOES_OS_ABERTAS_A_ORCAMENTO = ['Aberta', 'Em vistoria', 'Rejeitada'];
const SITUACOES_OS_COM_DECISAO = ['Aberta', 'Em vistoria'];

function validarItensForaContrato(entrada: ItemForaContratoPedido[] | undefined): ItemForaContrato[] {
  if (!entrada?.length) return [];
  if (entrada.length > 20) falha('No máximo 20 itens fora do contrato por orçamento.');
  return entrada.map((item, i) => {
    const linha = i + 1;
    const descricao = (item.descricao ?? '').trim().replace(/\s+/g, ' ');
    const unidade = (item.unidade ?? '').trim();
    if (descricao.length < 3) falha(`Item fora do contrato ${linha}: escreva a descrição (pelo menos 3 letras).`);
    if (descricao.length > 200) falha(`Item fora do contrato ${linha}: a descrição passa de 200 letras.`);
    if (!unidade || unidade.length > 20) falha(`Item fora do contrato ${linha}: informe a unidade (un, m, h...).`);
    if (!(item.quantidade > 0)) falha(`Item fora do contrato ${linha}: a quantidade precisa ser maior que zero.`);
    if (!(item.precoUnitario > 0)) falha(`Item fora do contrato ${linha}: o preço unitário precisa ser maior que zero.`);
    return { id: `fc${linha}`, descricao, quantidade: item.quantidade, unidade, precoUnitario: centavos(item.precoUnitario) };
  });
}

function totalForaContrato(itens: ItemForaContrato[] | undefined, soAprovados = false): number {
  return centavos((itens ?? []).filter(i => !soAprovados || i.decisao === 'Aprovado').reduce((s, i) => s + i.quantidade * i.precoUnitario, 0));
}

export function criarOrcamento(d: DadosDemo, ator: Ator, osId: string, pedidos: OrcamentoPedidoItem[], foraPedido: ItemForaContratoPedido[] = []): { id: string } {
  exigirPerfil(ator, ['tecnico', 'gestor_contratado']);
  const foraContrato = validarItensForaContrato(foraPedido);
  if (!osId || (!pedidos.length && !foraContrato.length)) falha('Informe a OS e ao menos um item.');
  for (const p of pedidos) {
    if (!p.itemContratoId) falha('Item de contrato inválido no orçamento.');
    if (!(p.quantidade > 0)) falha('Toda linha do orçamento precisa de quantidade maior que zero.');
  }
  const os = osOu404(d, osId);
  exigirMesmaContratada(ator, os);
  exigirTecnicoDesignado(ator, os);
  if (!SITUACOES_OS_ABERTAS_A_ORCAMENTO.includes(os.situacao)) {
    falha(`A ${rotuloOS(os.numero)} está "${situacaoTexto(os.situacao)}" e não aceita novo orçamento.`);
  }
  const contrato = d.contratos.find(c => c.id === os.contratoId);
  // Nome e preço saem do item de contrato, não do que a tela mandou.
  const itens: OrcamentoItem[] = pedidos.map(p => {
    const item = contrato?.itens.find(i => i.id === p.itemContratoId) ?? falha(`Item ${p.itemContratoId} não pertence ao contrato desta OS.`);
    return { itemContratoId: p.itemContratoId, nome: item.nome, quantidade: p.quantidade, precoUnitario: Number(item.precoUnitario) || 0 };
  });

  // Pendente anterior sai de cena como Substituído (reenvio).
  const anterior = os.orcamentoId ? d.orcamentos.find(o => o.id === os.orcamentoId && o.situacao === 'Pendente') : undefined;
  if (anterior) anterior.situacao = 'Substituído';
  proximoNumero(d, 'ORC');

  const id = novoId();
  const orcamento: Orcamento = {
    id,
    osId,
    situacao: 'Pendente',
    itens,
    dataCriacao: hojeISO(),
    ...(foraContrato.length ? { itensForaContrato: foraContrato } : {})
  };
  if (os.empresaContratadaId) orcamento.empresaContratadaId = os.empresaContratadaId;
  d.orcamentos.push(orcamento);
  os.situacao = 'Em vistoria';
  os.orcamentoId = id;
  const chamado = d.chamados.find(c => c.id === os.chamadoId);
  if (chamado) chamado.status = 'Em orçamento';

  const totalContrato = itens.reduce((soma, i) => soma + i.quantidade * i.precoUnitario, 0);
  const totalFora = totalForaContrato(foraContrato);
  registrarLog(d, ator, {
    alvo: 'orcamento',
    operacao: 'criar',
    descricao: `Enviou o orçamento da ${rotuloOS(os.numero)} com ${itensTexto(itens.length)}${foraContrato.length ? ` e ${plural(foraContrato.length, 'item fora do contrato', 'itens fora do contrato')}` : ''}`,
    alvoId: id,
    alvoRotulo: os.numero,
    alvoPaiId: osId,
    detalhes: {
      os: os.numero,
      itens: itens.length,
      total: totalContrato,
      ...(foraContrato.length ? { itensForaContrato: foraContrato.length, totalForaContrato: totalFora } : {}),
      substituiu: anterior?.id ?? null
    }
  });
  notificar(d, {
    paraPerfil: 'gestor',
    titulo: `Orçamento para aprovar na ${rotuloOS(os.numero)}`,
    texto: foraContrato.length
      ? `${ator.nome} enviou um orçamento com ${itensTexto(itens.length)} do contrato (${reais(totalContrato)}) e ${itensTexto(foraContrato.length)} fora do contrato (${reais(totalFora)}, à parte). Aguarda sua aprovação.`
      : `${ator.nome} enviou um orçamento com ${itensTexto(itens.length)}, total ${reais(totalContrato)}. Aguarda sua aprovação.`,
    link: `/ordens-servico?os=${osId}`,
    alvo: { tipo: 'orcamento', id, numero: os.numero }
  });
  return { id };
}

function aplicarDecisoes(itens: ItemForaContrato[] | undefined, decisoes: { id: string; aprovado: boolean }[] | undefined) {
  const lista = itens ?? [];
  if (!lista.length) {
    if (decisoes?.length) falha('Este orçamento não tem itens fora do contrato.');
    return { itens: [] as ItemForaContrato[], aprovados: 0, recusados: 0 };
  }
  if (!decisoes) falha('Decida cada item fora do contrato: aprovar ou recusar.');
  const porId = new Map<string, boolean>();
  for (const dec of decisoes) {
    if (!lista.some(i => i.id === dec.id)) falha(`O item ${dec.id} não está entre os itens fora do contrato deste orçamento.`);
    porId.set(dec.id, dec.aprovado);
  }
  const semDecisao = lista.filter(i => !porId.has(i.id));
  if (semDecisao.length) falha(`Decida cada item fora do contrato: falta ${semDecisao.map(i => `"${i.descricao}"`).join(', ')}.`);
  const decididos = lista.map(i => ({ ...i, decisao: (porId.get(i.id) ? 'Aprovado' : 'Recusado') as ItemForaContrato['decisao'] }));
  const aprovados = decididos.filter(i => i.decisao === 'Aprovado').length;
  return { itens: decididos, aprovados, recusados: decididos.length - aprovados };
}

function resumoForaContrato(dec: { aprovados: number; recusados: number }): string {
  if (!dec.aprovados && !dec.recusados) return '';
  const partes: string[] = [];
  if (dec.aprovados) partes.push(`${dec.aprovados} aprovado${dec.aprovados === 1 ? '' : 's'}`);
  if (dec.recusados) partes.push(`${dec.recusados} recusado${dec.recusados === 1 ? '' : 's'}`);
  return `Fora do contrato: ${partes.join(', ')}. `;
}

export function aprovarOrcamento(
  d: DadosDemo,
  ator: Ator,
  orcamentoId: string,
  ajustes?: { itemContratoId: string; quantidade: number }[],
  observacaoBruta?: string,
  decisoesFora?: { id: string; aprovado: boolean }[]
): void {
  exigirPerfil(ator, ['gestor']);
  const observacao = (observacaoBruta ?? '').trim().slice(0, 500);
  if (!orcamentoId) falha('Informe o orçamento.');
  for (const a of ajustes ?? []) {
    if (!a.itemContratoId || !(a.quantidade >= 0)) falha('Ajuste precisa de item e quantidade maior ou igual a zero.');
  }
  const orcamento = d.orcamentos.find(o => o.id === orcamentoId) ?? falha('Orçamento não encontrado.');
  if (orcamento.situacao !== 'Pendente') falha('Este orçamento já foi decidido.');
  const os = osOu404(d, orcamento.osId);
  if (!SITUACOES_OS_COM_DECISAO.includes(os.situacao)) {
    falha(`A ${rotuloOS(os.numero)} está "${situacaoTexto(os.situacao)}"; este orçamento não pode mais ser aprovado.`);
  }
  if (os.orcamentoId && os.orcamentoId !== orcamentoId) {
    falha(`Este não é o orçamento atual da ${rotuloOS(os.numero)}. Abra a OS de novo e confira o orçamento mais recente.`);
  }
  const chamado = d.chamados.find(c => c.id === os.chamadoId);
  const foraContrato = aplicarDecisoes(orcamento.itensForaContrato, decisoesFora);

  const orcadoPorItem = agregarPorItem(orcamento.itens);
  let itensFinais = orcamento.itens;
  const ajustesAplicados: { itemContratoId: string; nome: string; de: number; para: number }[] = [];
  if (ajustes?.length) {
    const desejado = new Map(ajustes.map(a => [a.itemContratoId, a.quantidade]));
    for (const [id, qtd] of desejado) {
      if (!orcadoPorItem.has(id)) falha(`Item ${id} não está neste orçamento.`);
      if (qtd > orcadoPorItem.get(id)!) falha(`Ajuste acima do orçado para o item ${id}: peça um novo orçamento à contratada.`);
    }
    const porId = new Map<string, OrcamentoItem>();
    for (const linha of orcamento.itens) {
      const atual = porId.get(linha.itemContratoId);
      porId.set(linha.itemContratoId, atual ? { ...atual, quantidade: atual.quantidade + linha.quantidade } : { ...linha });
    }
    itensFinais = [];
    for (const [id, linha] of porId) {
      const nova = desejado.has(id) ? desejado.get(id)! : linha.quantidade;
      if (nova !== linha.quantidade) ajustesAplicados.push({ itemContratoId: id, nome: linha.nome, de: linha.quantidade, para: nova });
      if (nova > 0) itensFinais.push({ ...linha, quantidade: nova });
    }
    if (!itensFinais.length && !foraContrato.aprovados) falha('O ajuste zerou todos os itens; rejeite o orçamento em vez de aprovar.');
  }
  if (!itensFinais.length && !foraContrato.aprovados) falha('Nenhum item foi aprovado; recuse o orçamento em vez de aprovar.');

  // Confere o saldo de todos os itens antes de mexer em qualquer um.
  const contrato = d.contratos.find(c => c.id === os.contratoId);
  const porItem = agregarPorItem(itensFinais);
  for (const [itemId, solicitado] of porItem) {
    const item = contrato?.itens.find(i => i.id === itemId) ?? falha(`Item de contrato ${itemId} não encontrado.`);
    if (item.quantidadeDisponivel < solicitado) {
      const un = item.unidadeMedida?.trim() || 'un';
      const qtd = (n: number) => `${n.toLocaleString('pt-BR')} ${un}`;
      falha(`Saldo insuficiente para "${item.nome}": o orçamento pede ${qtd(solicitado)}, e o contrato só tem ${qtd(item.quantidadeDisponivel)} livres. Reduza a quantidade ou faça um aditivo.`);
    }
  }
  for (const [itemId, solicitado] of porItem) {
    const item = contrato!.itens.find(i => i.id === itemId)!;
    item.quantidadeReservada += solicitado;
    item.quantidadeDisponivel -= solicitado;
  }

  const itensOriginais = orcamento.itens;
  orcamento.situacao = 'Aprovado';
  orcamento.dataAprovacao = hojeISO();
  if (ajustesAplicados.length) {
    orcamento.itens = itensFinais;
    orcamento.itensOriginais = itensOriginais;
    orcamento.ajustadoPeloGestor = true;
  }
  if (foraContrato.itens.length) orcamento.itensForaContrato = foraContrato.itens;
  if (observacao) orcamento.observacaoAprovacao = observacao;
  os.situacao = 'Aprovada';
  os.orcamentoId = orcamentoId;
  if (chamado) chamado.status = 'A ser finalizado';

  registrarLog(d, ator, {
    alvo: 'orcamento',
    operacao: 'transicao',
    descricao: `Aprovou o orçamento da ${rotuloOS(os.numero)}${ajustesAplicados.length ? ` com ${plural(ajustesAplicados.length, 'ajuste', 'ajustes')} de quantidade` : ''}${foraContrato.itens.length ? ` (fora do contrato: ${plural(foraContrato.aprovados, 'aprovado', 'aprovados')}, ${plural(foraContrato.recusados, 'recusado', 'recusados')})` : ''}${observacao ? ` — ${observacao}` : ''}`,
    alvoId: orcamentoId,
    alvoRotulo: os.numero,
    alvoPaiId: orcamento.osId,
    detalhes: {
      situacao: { de: 'Pendente', para: 'Aprovado' },
      itensReservados: porItem.size,
      ajustes: ajustesAplicados,
      ...(foraContrato.itens.length
        ? { foraContrato: { aprovados: foraContrato.aprovados, recusados: foraContrato.recusados, totalAprovado: totalForaContrato(foraContrato.itens, true) } }
        : {})
    }
  });
  notificar(d, {
    paraPerfil: 'tecnico',
    empresaContratadaId: os.empresaContratadaId,
    paraUsuarioId: os.tecnicoId,
    titulo: `Orçamento da ${rotuloOS(os.numero)} aprovado`,
    texto: `${ajustesAplicados.length ? `Aprovado com ajuste de quantidade em ${itensTexto(ajustesAplicados.length)}. ` : ''}${resumoForaContrato(foraContrato)}Faça o serviço e registre como feito.`,
    link: `/ordens-servico?os=${orcamento.osId}`,
    alvo: { tipo: 'ordemServico', id: orcamento.osId, numero: os.numero }
  });
  notificar(d, {
    paraPerfil: 'gestor_contratado',
    empresaContratadaId: os.empresaContratadaId,
    titulo: `Orçamento da ${rotuloOS(os.numero)} aprovado`,
    texto: `${resumoForaContrato(foraContrato)}O serviço está liberado: o técnico faz e registra como feito.`,
    link: `/ordens-servico?os=${orcamento.osId}`,
    alvo: { tipo: 'ordemServico', id: orcamento.osId, numero: os.numero }
  });
  if (chamado) {
    avisarSolicitante(d, chamado, ator.usuarioId, {
      titulo: `Pedido ${chamado.numero} aprovado`,
      texto: 'O conserto foi aprovado. Agora o técnico vai fazer o serviço.'
    });
  }
}

export function rejeitarOrcamento(d: DadosDemo, ator: Ator, orcamentoId: string): void {
  exigirPerfil(ator, ['gestor']);
  if (!orcamentoId) falha('Informe o orçamento.');
  const orcamento = d.orcamentos.find(o => o.id === orcamentoId) ?? falha('Orçamento não encontrado.');
  if (orcamento.situacao !== 'Pendente') falha('Este orçamento já foi decidido.');
  const os = osOu404(d, orcamento.osId);
  if (!SITUACOES_OS_COM_DECISAO.includes(os.situacao)) {
    falha(`A ${rotuloOS(os.numero)} está "${situacaoTexto(os.situacao)}"; este orçamento não pode mais ser recusado.`);
  }
  const orca = quemOrca(d, orcamento.empresaContratadaId);
  orcamento.situacao = 'Rejeitado';
  os.situacao = 'Rejeitada';
  const chamado = d.chamados.find(c => c.id === os.chamadoId);
  if (chamado) chamado.status = 'Em atendimento';

  registrarLog(d, ator, {
    alvo: 'orcamento',
    operacao: 'transicao',
    descricao: `Recusou o orçamento da ${rotuloOS(os.numero)}`,
    alvoId: orcamentoId,
    alvoRotulo: os.numero,
    alvoPaiId: orcamento.osId,
    detalhes: { situacao: { de: 'Pendente', para: 'Rejeitado' } }
  });
  notificar(d, {
    paraPerfil: 'gestor_contratado',
    empresaContratadaId: os.empresaContratadaId,
    titulo: `Orçamento da ${rotuloOS(os.numero)} recusado`,
    texto: 'Revise os itens e envie um novo orçamento.',
    link: `/ordens-servico?os=${orcamento.osId}`,
    alvo: { tipo: 'ordemServico', id: orcamento.osId, numero: os.numero }
  });
  if (os.tecnicoId && orca === 'tecnico') {
    notificar(d, {
      paraUsuarioId: os.tecnicoId,
      titulo: `Orçamento da ${rotuloOS(os.numero)} recusado`,
      texto: 'Revise os itens e envie um novo orçamento.',
      link: `/ordens-servico?os=${orcamento.osId}`,
      alvo: { tipo: 'ordemServico', id: orcamento.osId, numero: os.numero }
    });
  }
}

/* Execução (execucao.ts) --------------------------------------------------- */

function unidadesDevolvidas(n: number): string {
  return n === 1 ? '1 unidade voltou' : `${n} unidades voltaram`;
}

function registrarExecucaoForaContrato(itens: ItemForaContrato[] | undefined, execucao: { id: string; quantidadeExecutada: number }[] | undefined): ItemForaContratoExecutado[] {
  const aprovados = (itens ?? []).filter(i => i.decisao === 'Aprovado');
  const usado = new Map<string, number>(aprovados.map(i => [i.id, i.quantidade]));
  for (const e of execucao ?? []) {
    if (!(e.quantidadeExecutada >= 0)) falha('Quantidade usada do item fora do contrato precisa ser um número maior ou igual a zero.');
    const item = aprovados.find(i => i.id === e.id) ?? falha(`O item ${e.id} não é um item fora do contrato aprovado nesta OS.`);
    if (e.quantidadeExecutada > item.quantidade) falha(`Usado acima do aprovado em "${item.descricao}": máximo ${item.quantidade}.`);
    usado.set(e.id, e.quantidadeExecutada);
  }
  return aprovados.map(i => ({ id: i.id, descricao: i.descricao, unidade: i.unidade, aprovado: i.quantidade, executado: usado.get(i.id)! }));
}

export function executarOS(
  d: DadosDemo,
  ator: Ator,
  osId: string,
  parciais?: { itemContratoId: string; quantidadeExecutada: number }[],
  observacaoBruta?: string,
  fotos: string[] = [],
  foraExecucao?: { id: string; quantidadeExecutada: number }[]
): void {
  exigirPerfil(ator, ['tecnico', 'gestor_contratado']);
  const observacao = (observacaoBruta ?? '').trim().slice(0, 500);
  if (!osId) falha('Informe a OS.');
  for (const p of parciais ?? []) {
    if (!(p.quantidadeExecutada >= 0)) falha('Quantidade executada precisa ser um número maior ou igual a zero.');
  }
  if (fotos.length > MAX_FOTOS_EXECUCAO) falha(`Envie no máximo ${MAX_FOTOS_EXECUCAO} fotos.`);

  const os = osOu404(d, osId);
  exigirMesmaContratada(ator, os);
  exigirTecnicoDesignado(ator, os);
  if (os.situacao !== 'Aprovada') falha('O serviço só pode ser registrado depois que a gestão aprovar o orçamento.');
  const orcamento = os.orcamentoId ? d.orcamentos.find(o => o.id === os.orcamentoId) : undefined;
  if (orcamento?.situacao !== 'Aprovado') {
    falha(`A ${rotuloOS(os.numero)} não tem orçamento aprovado. Peça à empresa contratada um orçamento e à gestão a aprovação antes de registrar o serviço.`);
  }

  const foraContrato = registrarExecucaoForaContrato(orcamento.itensForaContrato, foraExecucao);
  const orcado = agregarPorItem(orcamento.itens);
  const executadoPorItem = new Map(orcado);
  for (const p of parciais ?? []) {
    if (!orcado.has(p.itemContratoId)) falha(`Item ${p.itemContratoId} não está no orçamento desta OS.`);
    if (p.quantidadeExecutada > orcado.get(p.itemContratoId)!) {
      falha(`Executado acima do orçado para o item ${p.itemContratoId}: máximo ${orcado.get(p.itemContratoId)}.`);
    }
    executadoPorItem.set(p.itemContratoId, p.quantidadeExecutada);
  }

  // Separado → usado pelo executado; a sobra volta ao livre. A conta
  // contratada = livre + separado + usado não muda.
  const contrato = d.contratos.find(c => c.id === os.contratoId);
  let devolvido = 0;
  const resumo: { itemContratoId: string; nome: string; orcado: number; executado: number }[] = [];
  for (const [id, qtdOrcada] of orcado) {
    const item = contrato?.itens.find(i => i.id === id);
    if (!item) continue;
    const qtdExecutada = executadoPorItem.get(id)!;
    const liberado = Math.min(item.quantidadeReservada, qtdOrcada);
    item.quantidadeReservada -= liberado;
    item.quantidadeConsumida += qtdExecutada;
    item.quantidadeDisponivel += liberado - qtdExecutada;
    devolvido += Math.max(0, qtdOrcada - qtdExecutada);
    resumo.push({ itemContratoId: id, nome: item.nome, orcado: qtdOrcada, executado: qtdExecutada });
  }

  os.situacao = 'Executada';
  os.dataExecucao = hojeISO();
  os.executadoPor = ator.usuarioId;
  os.itensExecutados = resumo;
  if (foraContrato.length) os.itensForaContratoExecutados = foraContrato;
  if (observacao) os.observacaoExecucao = observacao;
  // Fotos ficam no próprio registro, no lugar do caminho do Storage.
  if (fotos.length) os.fotosExecucao = fotos;
  const chamado = d.chamados.find(c => c.id === os.chamadoId);
  if (chamado) chamado.status = 'Executado';

  registrarLog(d, ator, {
    alvo: 'ordemServico',
    operacao: 'transicao',
    descricao: `Registrou o serviço da ${rotuloOS(os.numero)} como feito${devolvido ? ` (parcial: ${unidadesDevolvidas(devolvido)} ao contrato)` : ''}${observacao ? ` — ${observacao}` : ''}`,
    alvoId: osId,
    alvoRotulo: os.numero,
    detalhes: {
      situacao: { de: 'Aprovada', para: 'Executada' },
      chamado: { statusPara: 'Executado' },
      itens: resumo,
      devolvidoAoContrato: devolvido,
      ...(foraContrato.length ? { foraContrato } : {})
    }
  });
  notificar(d, {
    paraPerfil: 'gestor',
    titulo: `Serviço feito na ${rotuloOS(os.numero)}`,
    texto: devolvido
      ? `Feito em parte: ${unidadesDevolvidas(devolvido)} ao saldo livre do contrato. Confira e encerre o chamado.`
      : 'Confira o serviço e encerre o chamado.',
    link: `/ordens-servico?os=${osId}`,
    alvo: { tipo: 'ordemServico', id: osId, numero: os.numero }
  });
  if (chamado) {
    avisarSolicitante(d, chamado, ator.usuarioId, {
      titulo: `Serviço feito no pedido ${chamado.numero}`,
      texto: `${ator.nome} registrou o serviço como feito. Falta a gestão encerrar o pedido.`
    });
  }
}

/* Contratos (aditivos.ts) -------------------------------------------------- */

export function aditivarContrato(
  d: DadosDemo,
  ator: Ator,
  dados: { contratoId: string; motivo: string; novaVigenciaFim?: string; itens?: { itemContratoId: string; novaQuantidadeContratada: number }[] }
): number {
  exigirPerfil(ator, ['gestor']);
  const motivo = (dados.motivo ?? '').trim().slice(0, 500);
  const novaVigenciaFim = dados.novaVigenciaFim?.trim() || undefined;
  const pedidos = dados.itens ?? [];
  if (!dados.contratoId) falha('Informe o contrato.');
  if (!motivo) falha('Informe o motivo do aditivo.');
  if (novaVigenciaFim !== undefined && !/^\d{4}-\d{2}-\d{2}$/.test(novaVigenciaFim)) falha('Data de vigência inválida.');
  for (const p of pedidos) {
    if (!p.itemContratoId) falha('Item inválido no aditivo.');
    if (!(p.novaQuantidadeContratada >= 0)) falha('Quantidade contratada precisa ser um número maior ou igual a zero.');
  }
  const ids = pedidos.map(p => p.itemContratoId);
  if (new Set(ids).size !== ids.length) falha('O mesmo item aparece mais de uma vez no aditivo.');
  if (!pedidos.length && !novaVigenciaFim) falha('O aditivo precisa alterar a vigência ou ao menos um item.');

  const contrato = d.contratos.find(c => c.id === dados.contratoId) ?? falha('Contrato não encontrado.');
  if (contrato.status === 'Encerrado') falha(`O contrato ${contrato.numero} está encerrado e não recebe aditivo.`);

  const mudancasItens: AditivoContrato['itens'] = [];
  const novosLivres = new Map<string, number>();
  for (const pedido of pedidos) {
    const item = contrato.itens.find(i => i.id === pedido.itemContratoId) ?? falha(`Item ${pedido.itemContratoId} não pertence a este contrato.`);
    const atual = item.quantidadeContratada;
    const nova = pedido.novaQuantidadeContratada;
    if (nova === atual) continue;
    const comprometido = item.quantidadeReservada + item.quantidadeConsumida;
    if (nova < comprometido) {
      falha(`"${item.nome}": não dá para reduzir para ${nova}. Já há ${comprometido} ${comprometido === 1 ? 'separado ou usado' : 'separados ou usados'}; o mínimo é ${comprometido}.`);
    }
    novosLivres.set(item.id, nova - comprometido);
    mudancasItens.push({ itemContratoId: item.id, nome: item.nome, quantidadeContratada: { de: atual, para: nova } });
  }

  let mudancaVigencia: AditivoContrato['vigenciaFim'];
  if (novaVigenciaFim && novaVigenciaFim !== contrato.vigenciaFim) {
    if (novaVigenciaFim < contrato.vigenciaFim) falha('Aditivo só estende a vigência; para encurtar, encerre o contrato.');
    if (novaVigenciaFim <= contrato.vigenciaInicio) falha('A nova vigência precisa terminar depois do início do contrato.');
    mudancaVigencia = { de: contrato.vigenciaFim, para: novaVigenciaFim };
  }
  if (!mudancasItens.length && !mudancaVigencia) falha('Nada mudou: o aditivo repete os valores atuais do contrato.');

  for (const m of mudancasItens) {
    const item = contrato.itens.find(i => i.id === m.itemContratoId)!;
    item.quantidadeContratada = m.quantidadeContratada.para;
    item.quantidadeDisponivel = novosLivres.get(m.itemContratoId)!;
  }
  const numero = (contrato.totalAditivos ?? 0) + 1;
  d.aditivos.push({
    id: novoId(),
    numero,
    contratoId: contrato.id,
    data: new Date().toISOString(),
    motivo,
    ...(mudancaVigencia ? { vigenciaFim: mudancaVigencia } : {}),
    itens: mudancasItens,
    autorUid: ator.uid,
    autorNome: ator.nome
  });
  contrato.totalAditivos = numero;
  if (mudancaVigencia) contrato.vigenciaFim = mudancaVigencia.para;

  registrarLog(d, ator, {
    alvo: 'contrato',
    operacao: 'editar',
    descricao: `Aditivo nº ${numero} do contrato ${contrato.numero} — ${motivo}`,
    alvoId: contrato.id,
    alvoRotulo: contrato.numero,
    detalhes: { aditivo: numero, motivo, vigenciaFim: mudancaVigencia ?? null, itens: mudancasItens.map(m => ({ item: m.nome, ...m.quantidadeContratada })) }
  });
  return numero;
}

export function encerrarContrato(d: DadosDemo, ator: Ator, contratoId: string, motivoBruto: string): { disponivelZerado: number; osCanceladas: string[] } {
  exigirPerfil(ator, ['gestor']);
  const motivo = (motivoBruto ?? '').trim().slice(0, 500);
  if (!contratoId) falha('Informe o contrato.');
  if (!motivo) falha('Informe o motivo do encerramento.');
  const contrato = d.contratos.find(c => c.id === contratoId) ?? falha('Contrato não encontrado.');
  if (contrato.status === 'Encerrado') falha(`O contrato ${contrato.numero} já está encerrado.`);

  const ordens = d.ordensServico.filter(o => o.contratoId === contratoId);
  const comReserva = ordens.filter(o => o.situacao === 'Aprovada');
  if (comReserva.length) {
    falha(
      `Há ${comReserva.length} ${comReserva.length === 1 ? 'OS aprovada' : 'OS aprovadas'} com saldo separado neste contrato (${comReserva.map(o => o.numero).join(', ')}). Registre o serviço ou cancele os chamados antes de encerrar.`
    );
  }

  let disponivelZerado = 0;
  const itensAditivo: AditivoContrato['itens'] = [];
  for (const item of contrato.itens) {
    const disp = item.quantidadeDisponivel;
    if (disp > 0) {
      itensAditivo.push({ itemContratoId: item.id, nome: item.nome, quantidadeContratada: { de: item.quantidadeContratada, para: item.quantidadeContratada - disp } });
      item.quantidadeContratada -= disp;
      item.quantidadeDisponivel = 0;
      disponivelZerado += disp;
    }
  }

  const osCanceladas: string[] = [];
  for (const os of ordens.filter(o => ['Aberta', 'Em vistoria', 'Rejeitada'].includes(o.situacao))) {
    os.situacao = 'Cancelada';
    osCanceladas.push(os.numero);
    const chamado = d.chamados.find(c => c.id === os.chamadoId);
    if (chamado) {
      chamado.status = 'Aberto';
      delete chamado.ordemServicoId;
      delete chamado.empresaContratadaId;
    }
  }

  const numeroAditivo = (contrato.totalAditivos ?? 0) + 1;
  d.aditivos.push({
    id: novoId(),
    numero: numeroAditivo,
    contratoId,
    data: new Date().toISOString(),
    motivo: `Encerramento: ${motivo}`,
    itens: itensAditivo,
    autorUid: ator.uid,
    autorNome: ator.nome
  });
  const statusAnterior = contrato.status;
  contrato.status = 'Encerrado';
  contrato.totalAditivos = numeroAditivo;
  contrato.encerradoEm = hojeISO();
  contrato.motivoEncerramento = motivo;

  registrarLog(d, ator, {
    alvo: 'contrato',
    operacao: 'transicao',
    descricao: `Encerrou o contrato ${contrato.numero} — ${motivo}`,
    alvoId: contratoId,
    alvoRotulo: contrato.numero,
    detalhes: { status: { de: statusAnterior, para: 'Encerrado' }, disponivelZerado, osCanceladas }
  });
  if (contrato.empresaContratadaId) {
    notificar(d, {
      paraPerfil: 'gestor_contratado',
      empresaContratadaId: contrato.empresaContratadaId,
      titulo: `Contrato ${contrato.numero} encerrado`,
      texto: osCanceladas.length ? `OS canceladas junto: ${osCanceladas.join(', ')}.` : 'Nenhuma OS pendente foi afetada.',
      link: '/contratos',
      alvo: { tipo: 'contrato', id: contratoId, numero: contrato.numero }
    });
  }
  return { disponivelZerado, osCanceladas };
}

/* Preventiva (preventiva.ts) ------------------------------------------------ */

const AUTOR_SISTEMA = { uid: 'sistema', nome: 'Manutenção preventiva (automático)', email: '' };

/** "Abrir chamados vencendo": a mesma rotina do agendamento das 6h. */
export function rodarPreventiva(d: DadosDemo, ator: Ator): { gerados: number; duplicados: number; ignorados: number } {
  exigirPerfil(ator, ['gestor']);
  const hoje = hojeISO();
  let gerados = 0;
  let duplicados = 0;
  let ignorados = 0;

  for (const plano of d.planosManutencao.filter(p => p.ativo)) {
    if (plano.proximaExecucao > somarDias(hoje, plano.antecedenciaDias)) continue;
    const equipamento = d.equipamentos.find(e => e.id === plano.equipamentoId);
    if (!equipamento) {
      ignorados++;
      continue;
    }
    // Id determinístico por plano e data: rodar de novo não duplica.
    const id = `prev_${plano.id}_${plano.proximaExecucao}`;
    if (d.chamados.some(c => c.id === id)) {
      duplicados++;
      continue;
    }
    gerarChamadoDoPlano(d, plano, equipamento.nome, equipamento.unidadeId, id, hoje);
    gerados++;
  }

  const anterior = d.operacaoPreventiva;
  const agora = new Date().toISOString();
  d.operacaoPreventiva = {
    ...(anterior ?? {}),
    ultimaExecucao: agora,
    ultimaOrigem: 'manual',
    ultimoResultado: { gerados, duplicados, ignorados },
    ultimoErro: null,
    ...(gerados ? { ultimaGeracao: agora } : {}),
    totalExecucoes: (anterior?.totalExecucoes ?? 0) + 1
  };
  return { gerados, duplicados, ignorados };
}

function gerarChamadoDoPlano(d: DadosDemo, plano: PlanoManutencao, equipamentoNome: string, unidadeId: string, id: string, hoje: string): void {
  const numero = proximoNumero(d, 'CH');
  const proxima = somarDias(plano.proximaExecucao, plano.periodicidadeDias);
  d.chamados.push({
    id,
    numero,
    titulo: plano.nome,
    equipamento: equipamentoNome,
    descricao: `Manutenção preventiva programada: ${plano.nome}. Gerada automaticamente pelo plano a cada ${plano.periodicidadeDias} dias.`,
    unidadeId,
    solicitanteId: 'sistema',
    solicitanteNome: 'Manutenção preventiva',
    status: 'Aberto',
    dataCriacao: hoje,
    dataVencimento: plano.proximaExecucao,
    possuiFoto: false,
    origem: 'preventiva',
    planoId: plano.id,
    equipamentoId: plano.equipamentoId
  });
  const vencimento = plano.proximaExecucao;
  plano.ultimaExecucao = plano.proximaExecucao;
  plano.proximaExecucao = proxima;
  registrarLog(d, AUTOR_SISTEMA, {
    alvo: 'chamado',
    operacao: 'criar',
    descricao: `Chamado ${numero} aberto automaticamente pelo plano "${plano.nome}"`,
    alvoId: id,
    alvoRotulo: numero,
    detalhes: { plano: plano.nome, equipamento: equipamentoNome, vencimento, proximaExecucao: proxima }
  });
}

/* Perfis ------------------------------------------------------------------- */

export function perfilEhDaEmpresa(perfil: PerfilUsuario): perfil is PerfilEmpresa {
  return perfil === 'cliente' || perfil === 'gestor' || perfil === 'gestor_contratado' || perfil === 'tecnico';
}
