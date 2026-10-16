/**
 * Dados de demonstração (empresa "demo"), montados sem tocar no Firestore.
 *
 * Fica separado de seed.ts para que o teste (test/seed.test.mjs) confira a
 * coerência sem subir emulador nem inicializar o Admin SDK. A regra que o
 * teste cobra é a mesma das Cloud Functions:
 *
 *   contratada = disponível + reservada + consumida
 *
 * e, além disso, reservada e consumida de cada item saem das OS e dos
 * orçamentos do próprio seed (OS "Aprovada" separa; "Executada" e
 * "Encerrada" usam o executado). Por isso os números dos itens não são
 * digitados: são calculados no fim de `montarDadosSeed`.
 */
import type {
  Chamado,
  ContratoCabecalho,
  Equipamento,
  ItemContrato,
  Orcamento,
  OrcamentoItem,
  OrdemServico,
  Sala,
  Bloco,
  Unidade,
  StatusChamado,
  SituacaoOS
} from './types';

export const EMPRESA_DEMO = 'demo';

export interface UsuarioSeed {
  id: string;
  nome: string;
  email: string;
  perfil: string;
  unidadeId?: string;
  empresaContratadaId?: string;
}

export interface ContratoSeed extends ContratoCabecalho {
  itens: (ItemContrato & { empresaId: string })[];
}

export interface DadosSeed {
  unidades: Unidade[];
  blocos: Bloco[];
  salas: Sala[];
  equipamentos: Equipamento[];
  usuarios: UsuarioSeed[];
  empresasContratadas: { id: string; nome: string }[];
  contratos: ContratoSeed[];
  chamados: Chamado[];
  ordensServico: OrdemServico[];
  orcamentos: Orcamento[];
  contadores: { id: string; valor: number }[];
}

const unidades: Unidade[] = [
  { id: 'u1', nome: 'Senai Santa Maria', sigla: 'SAM' },
  { id: 'u2', nome: 'Senai Taguatinga', sigla: 'TAG' },
  { id: 'u3', nome: 'Senai Gama', sigla: 'GAM' },
  { id: 'u4', nome: 'Senai Sobradinho', sigla: 'SOB' }
];

const blocos: Bloco[] = [
  { id: 'b1', unidadeId: 'u1', nome: 'Bloco A' },
  { id: 'b2', unidadeId: 'u1', nome: 'Bloco B' },
  { id: 'b3', unidadeId: 'u2', nome: 'Bloco Administrativo' }
];

const salas: Sala[] = [
  { id: 's1', unidadeId: 'u1', blocoId: 'b1', nome: 'Sala 101' },
  { id: 's2', unidadeId: 'u1', blocoId: 'b2', nome: 'Sala 12' },
  { id: 's3', unidadeId: 'u1', nome: 'Auditório Principal' },
  { id: 's4', unidadeId: 'u2', blocoId: 'b3', nome: 'Sala de Reuniões' }
];

const equipamentos: Equipamento[] = [
  { id: 'e1', unidadeId: 'u1', blocoId: 'b2', salaId: 's2', nome: 'Ar Split 12000 BTUs', patrimonio: 'PAT-0021' },
  { id: 'e2', unidadeId: 'u1', salaId: 's3', nome: 'Projetor Epson', patrimonio: 'PAT-0088' },
  { id: 'e3', unidadeId: 'u1', blocoId: 'b1', salaId: 's1', nome: 'Quadro de distribuição elétrica', patrimonio: 'PAT-0103' },
  { id: 'e4', unidadeId: 'u2', blocoId: 'b3', salaId: 's4', nome: 'Bebedouro elétrico', patrimonio: 'PAT-0140' },
  { id: 'e5', unidadeId: 'u2', blocoId: 'b3', salaId: 's4', nome: 'Ar Split 18000 BTUs', patrimonio: 'PAT-0141' }
];

const usuarios: UsuarioSeed[] = [
  { id: 'usr1', nome: 'Ana Souza', email: 'ana@senai.br', perfil: 'cliente', unidadeId: 'u1' },
  { id: 'usr2', nome: 'Bruno Lima', email: 'bruno@senai.br', perfil: 'cliente', unidadeId: 'u2' },
  { id: 'usr3', nome: 'Carla Dias', email: 'carla@senai.br', perfil: 'gestor' },
  { id: 'usr4', nome: 'Diego Rocha', email: 'diego@eletricasul.com.br', perfil: 'gestor_contratado', empresaContratadaId: 'c2' },
  { id: 'usr5', nome: 'Eduardo Nunes', email: 'eduardo@eletricasul.com.br', perfil: 'tecnico', empresaContratadaId: 'c2' },
  { id: 'usr6', nome: 'Fernanda Melo', email: 'fernanda@eletricasul.com.br', perfil: 'tecnico', empresaContratadaId: 'c2' }
];

// Só o que foi contratado. Separado, usado e livre são calculados.
interface ItemBase {
  id: string;
  nome: string;
  unidadeMedida: string;
  quantidadeContratada: number;
  precoUnitario: number;
}

const contratosBase: (ContratoCabecalho & { itens: ItemBase[] })[] = [
  {
    id: 'c1',
    numero: 'CTR-2026-001',
    fornecedor: 'Ar Condicionado Ltda',
    empresaContratadaId: 'c1',
    vigenciaInicio: '2026-01-01',
    vigenciaFim: '2026-12-31',
    status: 'Ativo',
    itens: [
      { id: 'i1', nome: 'Filtro de ar', unidadeMedida: 'un', quantidadeContratada: 60, precoUnitario: 45.0 },
      { id: 'i2', nome: 'Carga de gás R-410A', unidadeMedida: 'kg', quantidadeContratada: 20, precoUnitario: 120.0 },
      { id: 'i3', nome: 'Limpeza de unidade evaporadora', unidadeMedida: 'un', quantidadeContratada: 60, precoUnitario: 180.0 }
    ]
  },
  {
    id: 'c2',
    numero: 'CTR-2026-002',
    fornecedor: 'Elétrica Sul',
    empresaContratadaId: 'c2',
    vigenciaInicio: '2026-03-01',
    vigenciaFim: '2027-02-28',
    status: 'Ativo',
    itens: [
      { id: 'i4', nome: 'Lâmpada LED 9W', unidadeMedida: 'un', quantidadeContratada: 1000, precoUnitario: 18.5 },
      { id: 'i5', nome: 'Troca de reator', unidadeMedida: 'un', quantidadeContratada: 80, precoUnitario: 220.0 }
    ]
  },
  {
    id: 'c3',
    numero: 'CTR-2026-003',
    fornecedor: 'Hidráulica Norte',
    empresaContratadaId: 'c3',
    vigenciaInicio: '2026-02-15',
    vigenciaFim: '2027-02-14',
    status: 'Ativo',
    itens: [{ id: 'i6', nome: 'Serviço hidráulico predial', unidadeMedida: 'h', quantidadeContratada: 70, precoUnitario: 150.0 }]
  }
];

// Histórico dos últimos 6 meses — volume para os gráficos do Painel
// gerencial e para o "Histórico de uso" do saldo.
const MESES_HISTORICO = ['2026-04', '2026-05', '2026-06', '2026-07', '2026-08', '2026-09'];
// Uma operação saudável: os meses antigos estão fechados (encerrados, alguns
// cancelados antes de virar OS e dois com o serviço feito esperando a
// conferência), e o que está em andamento é do mês
// mais recente. Só dois chamados antigos continuam abertos e atrasados
// (ch-ger-28, que espera o orçamento da Elétrica Sul, e ch-ger-34, que
// espera a aprovação): é o "Em atraso" do Painel gerencial. Antes quase todo
// mês tinha chamados parados, e a lista inteira saía em vermelho.
const STATUS_POR_MES: StatusChamado[][] = [
  ['Encerrado', 'Encerrado', 'Encerrado', 'Encerrado', 'Encerrado', 'Encerrado', 'Encerrado', 'Encerrado'],
  ['Encerrado', 'Encerrado', 'Encerrado', 'Encerrado', 'Encerrado', 'Encerrado', 'Encerrado', 'Encerrado'],
  ['Encerrado', 'Encerrado', 'Encerrado', 'Encerrado', 'Cancelado', 'Encerrado', 'Encerrado', 'Encerrado'],
  ['Encerrado', 'Encerrado', 'Cancelado', 'Em atendimento', 'Encerrado', 'Encerrado', 'Encerrado', 'Encerrado'],
  ['Cancelado', 'Em orçamento', 'Encerrado', 'Encerrado', 'Encerrado', 'Executado', 'Cancelado', 'Executado'],
  ['Aberto', 'Aberto', 'Em atendimento', 'Aberto', 'Em orçamento', 'Orçamento aprovado']
];
// O que a pessoa escreveu ao pedir, como num pedido de verdade (antes era
// "Chamado do histórico de demonstração", que aparecia no cartão do técnico).
const PROBLEMAS_HISTORICO = [
  'Parou de funcionar hoje de manhã.',
  'Está fazendo um barulho estranho e esquenta.',
  'Liga e desliga sozinho ao longo do dia.',
  'Está pingando água no chão.',
  'Funciona só às vezes; precisa de uma avaliação.'
];
const UNIDADES_HISTORICO = ['u1', 'u2', 'u3', 'u4'];
// Os dois técnicos são da Elétrica Sul (c2): só as OS desse contrato têm
// técnico. Nas outras contratadas ninguém tem cadastro no seed.
const TECNICOS_C2 = ['usr5', 'usr6'];
// Quem pede é da unidade do chamado: Ana em Santa Maria, Bruno em
// Taguatinga; nas outras unidades, a gestora abre (gestor abre em qualquer uma).
const SOLICITANTE_POR_UNIDADE: Record<string, { id: string; nome: string }> = {
  u1: { id: 'usr1', nome: 'Ana Souza' },
  u2: { id: 'usr2', nome: 'Bruno Lima' },
  u3: { id: 'usr3', nome: 'Carla Dias' },
  u4: { id: 'usr3', nome: 'Carla Dias' }
};
// Cada equipamento vai para o contrato que cobre o conserto dele: ar-condicionado
// na Ar Condicionado Ltda (c1), iluminação na Elétrica Sul (c2), água na
// Hidráulica Norte (c3). Antes o contrato saía de uma conta à parte, e a
// luminária caía no contrato de ar-condicionado e a câmera na hidráulica.
const EQUIPAMENTOS_HISTORICO: { nome: string; contratoId: 'c1' | 'c2' | 'c3' }[] = [
  { nome: 'Ar Split 12000 BTUs - Sala 12', contratoId: 'c1' },
  { nome: 'Luminária - Corredor do Bloco A', contratoId: 'c2' },
  { nome: 'Bebedouro - Corredor', contratoId: 'c3' },
  { nome: 'Ar Split 18000 BTUs - Sala de Reuniões', contratoId: 'c1' },
  { nome: 'Reator da luminária - Biblioteca', contratoId: 'c2' },
  { nome: 'Bomba d’água - Casa de máquinas', contratoId: 'c3' },
  { nome: 'Ar Split 9000 BTUs - Secretaria', contratoId: 'c1' },
  { nome: 'Torneira - Banheiro do Bloco B', contratoId: 'c3' },
  // Posição 8: é o equipamento do ch-ger-28, que espera o orçamento da
  // Elétrica Sul (a dica do Diego na demonstração aponta para ele).
  { nome: 'Lâmpadas - Sala de aula 3', contratoId: 'c2' },
  { nome: 'Refletor - Estacionamento', contratoId: 'c2' }
];
// Urgência que quem pediu escolheu (antes o histórico saía "Não informada").
const URGENCIAS_HISTORICO: Chamado['urgencia'][] = ['media', 'baixa', 'alta', 'media', 'baixa'];

function pad(n: number, tamanho = 2): string {
  return String(n).padStart(tamanho, '0');
}

/**
 * Numera chamados e OS na ordem em que foram abertos: CH-2026-0001 é o mais
 * antigo, e o próximo pedido recebe o número seguinte ao último da lista.
 * Antes o histórico ia de CH-2026-0201 a 0246, os recentes eram 0100 a 0103
 * e o pedido novo saía CH-2026-0104, no meio. Empate de data mantém a ordem
 * em que foram montados. Devolve os contadores para o próximo número.
 */
export function numerarEmOrdem(chamados: Chamado[], ordensServico: OrdemServico[]): { id: string; valor: number }[] {
  const porData = <T extends { dataCriacao: string }>(lista: T[]) =>
    lista.map((item, i) => ({ item, i })).sort((a, b) => a.item.dataCriacao.localeCompare(b.item.dataCriacao) || a.i - b.i);
  porData(chamados).forEach(({ item }, k) => (item.numero = `CH-2026-${pad(k + 1, 4)}`));
  porData(ordensServico).forEach(({ item }, k) => (item.numero = `OS-2026-${pad(k + 1, 4)}`));
  return [
    { id: 'CH-2026', valor: chamados.length },
    { id: 'OS-2026', valor: ordensServico.length }
  ];
}

export function addDias(data: string, dias: number): string {
  const [ano, mes, dia] = data.split('-').map(Number);
  const d = new Date(Date.UTC(ano, mes - 1, dia + dias));
  return d.toISOString().split('T')[0];
}

// Situação da OS que o fluxo das functions deixaria para cada status do
// chamado: OS recém-criada fica "Aberta"; orçamento enviado, "Em vistoria";
// aprovado, "Aprovada"; serviço feito, "Executada"; encerrado, "Encerrada".
function situacaoOSDoStatus(status: StatusChamado): SituacaoOS {
  switch (status) {
    case 'Em atendimento':
      return 'Aberta';
    case 'Em orçamento':
      return 'Em vistoria';
    case 'Orçamento aprovado':
    case 'A ser finalizado':
      return 'Aprovada';
    case 'Executado':
      return 'Executada';
    case 'Encerrado':
      return 'Encerrada';
    default:
      return 'Aberta';
  }
}

function precoDe(itemId: string): { nome: string; preco: number } {
  for (const c of contratosBase) {
    const item = c.itens.find((i) => i.id === itemId);
    if (item) return { nome: item.nome, preco: item.precoUnitario };
  }
  throw new Error(`Item ${itemId} não existe no seed.`);
}

function linha(itemId: string, quantidade: number): OrcamentoItem {
  const { nome, preco } = precoDe(itemId);
  return { itemContratoId: itemId, nome, quantidade, precoUnitario: preco };
}

// Itens do orçamento de cada OS histórica, variando com o número dela.
function itensDoOrcamento(contratoId: string, n: number): OrcamentoItem[] {
  if (contratoId === 'c1') {
    const itens = [linha('i1', 2 + (n % 4))];
    if (n % 2 === 0) itens.push(linha('i3', 2 + (n % 3)));
    if (n % 4 === 1) itens.push(linha('i2', 2));
    return itens;
  }
  if (contratoId === 'c2') {
    const itens = [linha('i4', 4 + (n % 7))];
    if (n % 2 === 0) itens.push(linha('i5', 1));
    return itens;
  }
  return [linha('i6', 3 + (n % 4))];
}

/**
 * Monta todos os dados. `hoje` (YYYY-MM-DD) ancora os chamados recentes da
 * demonstração, para que prazo e atraso façam sentido no dia em que o seed
 * roda; o histórico fica nos meses fixos acima.
 */
export function montarDadosSeed(hoje: string): DadosSeed {
  const chamados: Chamado[] = [];
  const ordensServico: OrdemServico[] = [];
  const orcamentos: Orcamento[] = [];

  /* Chamados recentes, um por momento do fluxo (o número sai no fim) ----- */

  // Aberto: a gestora ainda vai encaminhar.
  chamados.push({
    id: 'ch1', numero: '', titulo: 'Ar-condicionado não liga', equipamento: 'Ar Split 12000 BTUs', equipamentoId: 'e1',
    descricao: 'A sala 12 do bloco B está sem ar-condicionado há 2 dias.', unidadeId: 'u1', local: 'Bloco B, sala 12', urgencia: 'alta',
    solicitanteId: 'usr1', solicitanteNome: 'Ana Souza', status: 'Aberto', dataCriacao: addDias(hoje, -1), dataVencimento: addDias(hoje, 4),
    possuiFoto: false, origem: 'manual'
  });

  // Em orçamento: a Elétrica Sul mandou orçamento; a gestora aprova.
  chamados.push({
    id: 'ch2', numero: '', titulo: 'Troca de lâmpadas da sala de reuniões', equipamento: 'Luminárias da sala de reuniões',
    descricao: 'Quatro lâmpadas queimadas na sala de reuniões.', unidadeId: 'u2', local: 'Bloco Administrativo, sala de reuniões', urgencia: 'media',
    solicitanteId: 'usr2', solicitanteNome: 'Bruno Lima', status: 'Em orçamento', dataCriacao: addDias(hoje, -4), dataVencimento: addDias(hoje, 1),
    responsavelId: 'usr3', ordemServicoId: 'os1', possuiFoto: false, origem: 'manual'
  });
  ordensServico.push({
    id: 'os1', numero: '', chamadoId: 'ch2', contratoId: 'c2', unidadeId: 'u2', empresaContratadaId: 'c2', tecnicoId: 'usr6',
    situacao: 'Em vistoria', orcamentoId: 'orc1', dataCriacao: addDias(hoje, -3)
  });
  orcamentos.push({ id: 'orc1', osId: 'os1', empresaContratadaId: 'c2', situacao: 'Pendente', itens: [linha('i4', 4)], dataCriacao: addDias(hoje, -2) });

  // Aprovado: o técnico Eduardo registra o serviço feito.
  chamados.push({
    id: 'ch4', numero: '', titulo: 'Luzes do corredor apagadas', equipamento: 'Luminárias do corredor do Bloco A',
    descricao: 'Metade das luzes do corredor do bloco A não acende. À noite fica escuro para sair das salas.', unidadeId: 'u1',
    local: 'Bloco A, corredor do térreo', urgencia: 'media', solicitanteId: 'usr1', solicitanteNome: 'Ana Souza', status: 'A ser finalizado',
    dataCriacao: addDias(hoje, -3), dataVencimento: addDias(hoje, 2), responsavelId: 'usr3', ordemServicoId: 'os3', possuiFoto: false, origem: 'manual'
  });
  ordensServico.push({
    id: 'os3', numero: '', chamadoId: 'ch4', contratoId: 'c2', unidadeId: 'u1', empresaContratadaId: 'c2', tecnicoId: 'usr5',
    situacao: 'Aprovada', orcamentoId: 'orc3', dataCriacao: addDias(hoje, -2)
  });
  orcamentos.push({
    id: 'orc3', osId: 'os3', empresaContratadaId: 'c2', situacao: 'Aprovado', itens: [linha('i4', 6), linha('i5', 1)],
    dataCriacao: addDias(hoje, -2), dataAprovacao: addDias(hoje, -1)
  });

  // Executado: serviço feito em parte; a gestora confere e encerra.
  chamados.push({
    id: 'ch3', numero: '', titulo: 'Vazamento na tubulação do banheiro', equipamento: 'Tubulação do banheiro do térreo',
    descricao: 'Vazamento constante na tubulação do banheiro do térreo. O chão fica molhado.', unidadeId: 'u1', local: 'Térreo, banheiro masculino',
    urgencia: 'alta', solicitanteId: 'usr1', solicitanteNome: 'Ana Souza', status: 'Executado', dataCriacao: addDias(hoje, -9),
    dataVencimento: addDias(hoje, -4), responsavelId: 'usr3', ordemServicoId: 'os2', possuiFoto: false, origem: 'manual'
  });
  ordensServico.push({
    id: 'os2', numero: '', chamadoId: 'ch3', contratoId: 'c3', unidadeId: 'u1', empresaContratadaId: 'c3', situacao: 'Executada',
    orcamentoId: 'orc2', dataCriacao: addDias(hoje, -8), dataExecucao: addDias(hoje, -2),
    itensExecutados: [{ itemContratoId: 'i6', nome: 'Serviço hidráulico predial', orcado: 3, executado: 2 }],
    observacaoExecucao: 'Troquei a vedação do registro. Uma das horas previstas não foi necessária.'
  });
  orcamentos.push({
    id: 'orc2', osId: 'os2', empresaContratadaId: 'c3', situacao: 'Aprovado', itens: [linha('i6', 3)],
    dataCriacao: addDias(hoje, -7), dataAprovacao: addDias(hoje, -6)
  });

  /* Histórico ----------------------------------------------------------- */

  let n = 0;
  MESES_HISTORICO.forEach((mes, mesIdx) => {
    STATUS_POR_MES[mesIdx].forEach((status, idx) => {
      n++;
      const dataCriacao = `${mes}-${pad(((idx * 5) % 26) + 2)}`;
      const unidadeId = UNIDADES_HISTORICO[n % UNIDADES_HISTORICO.length];
      const { nome: equipamento, contratoId } = EQUIPAMENTOS_HISTORICO[n % EQUIPAMENTOS_HISTORICO.length];
      const solicitante = SOLICITANTE_POR_UNIDADE[unidadeId];
      const id = `ch-ger-${pad(n)}`;

      const chamado: Chamado = {
        id,
        numero: '', // numerado no fim, na ordem de abertura
        titulo: `Manutenção — ${equipamento}`,
        equipamento,
        descricao: PROBLEMAS_HISTORICO[n % PROBLEMAS_HISTORICO.length],
        unidadeId,
        solicitanteId: solicitante.id,
        solicitanteNome: solicitante.nome,
        status,
        dataCriacao,
        dataVencimento: addDias(dataCriacao, 5),
        urgencia: URGENCIAS_HISTORICO[n % URGENCIAS_HISTORICO.length],
        possuiFoto: false,
        origem: 'manual'
      };
      chamados.push(chamado);
      // Cancelado aqui é o pedido desistido antes de virar OS: sem OS e sem
      // gasto no contrato.
      if (status === 'Aberto' || status === 'Cancelado') return;

      const tecnicoId = contratoId === 'c2' ? TECNICOS_C2[n % TECNICOS_C2.length] : undefined;
      const situacao = situacaoOSDoStatus(status);
      const osId = `os-ger-${pad(n)}`;
      const dataOS = addDias(dataCriacao, 1);
      chamado.responsavelId = 'usr3';
      chamado.ordemServicoId = osId;
      if (status === 'Encerrado') chamado.dataFechamento = addDias(dataCriacao, 10);

      const os: OrdemServico = {
        id: osId,
        numero: '',
        chamadoId: id,
        contratoId,
        unidadeId,
        empresaContratadaId: contratoId,
        tecnicoId,
        situacao,
        dataCriacao: dataOS
      };
      ordensServico.push(os);
      if (situacao === 'Aberta') return;

      const orcamentoId = `orc-ger-${pad(n)}`;
      const itens = itensDoOrcamento(contratoId, n);
      const aprovado = situacao !== 'Em vistoria';
      orcamentos.push({
        id: orcamentoId,
        osId,
        empresaContratadaId: contratoId,
        situacao: aprovado ? 'Aprovado' : 'Pendente',
        itens,
        dataCriacao: addDias(dataCriacao, 2),
        ...(aprovado ? { dataAprovacao: addDias(dataCriacao, 3) } : {})
      });
      os.orcamentoId = orcamentoId;

      if (situacao === 'Executada' || situacao === 'Encerrada') {
        // A cada cinco, um serviço feito em parte: a sobra voltou ao livre.
        const parcial = n % 5 === 0;
        os.dataExecucao = addDias(dataCriacao, 7);
        if (tecnicoId) os.executadoPor = tecnicoId;
        os.itensExecutados = itens.map((i, k) => ({
          itemContratoId: i.itemContratoId,
          nome: i.nome,
          orcado: i.quantidade,
          executado: parcial && k === 0 && i.quantidade > 1 ? i.quantidade - 1 : i.quantidade
        }));
        os.observacaoExecucao = parcial ? 'Serviço feito. Uma unidade não precisou ser usada.' : 'Serviço feito e testado no local.';
      }
    });
  });

  // Chamado com OS leva a empresa contratada da OS, como faz criarOS: é o
  // campo que a regra de leitura da contratada confere.
  for (const chamado of chamados) {
    const os = ordensServico.find((o) => o.id === chamado.ordemServicoId);
    if (os?.empresaContratadaId) chamado.empresaContratadaId = os.empresaContratadaId;
  }

  /* Saldo calculado a partir das OS -------------------------------------- */

  const reservada = new Map<string, number>();
  const consumida = new Map<string, number>();
  const somar = (mapa: Map<string, number>, id: string, qtd: number) => mapa.set(id, (mapa.get(id) ?? 0) + qtd);
  for (const os of ordensServico) {
    const orc = orcamentos.find((o) => o.id === os.orcamentoId);
    if (os.situacao === 'Aprovada' && orc?.situacao === 'Aprovado') {
      for (const i of orc.itens) somar(reservada, i.itemContratoId, i.quantidade);
    }
    if (os.situacao === 'Executada' || os.situacao === 'Encerrada') {
      for (const i of os.itensExecutados ?? []) somar(consumida, i.itemContratoId, i.executado);
    }
  }

  const contratos: ContratoSeed[] = contratosBase.map(({ itens, ...cabecalho }) => ({
    ...cabecalho,
    itens: itens.map((i) => {
      const res = reservada.get(i.id) ?? 0;
      const cons = consumida.get(i.id) ?? 0;
      const disponivel = i.quantidadeContratada - res - cons;
      if (disponivel < 0) {
        throw new Error(`Seed: "${i.nome}" usa mais do que foi contratado (${res + cons} de ${i.quantidadeContratada}).`);
      }
      return {
        ...i,
        empresaId: EMPRESA_DEMO,
        quantidadeReservada: res,
        quantidadeConsumida: cons,
        quantidadeDisponivel: disponivel
      };
    })
  }));

  return {
    unidades,
    blocos,
    salas,
    equipamentos,
    usuarios,
    empresasContratadas: contratosBase.map((c) => ({ id: c.id, nome: c.fornecedor })),
    contratos,
    chamados,
    ordensServico,
    orcamentos,
    contadores: [...numerarEmOrdem(chamados, ordensServico), { id: 'ORC-2026', valor: orcamentos.length }]
  };
}
