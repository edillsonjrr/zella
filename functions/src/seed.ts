// Popula o Firestore Emulator com os mesmos dados hoje hardcoded em
// frontend/src/app/shared/mock-data.service.ts — só pra comparar visualmente
// com o app atual enquanto o frontend ainda não fala com o backend de
// verdade. Rode com `npm run seed` (dentro de functions/), com os
// emulators já rodando (`firebase emulators:start`).
import { getAuth } from 'firebase-admin/auth';
import { db } from './admin';

interface UsuarioSeed {
  id: string;
  nome: string;
  email: string;
  perfil: string;
  unidadeId?: string;
  empresaContratadaId?: string;
}

const SENHA_PADRAO = 'senai123';

// Tudo do seed entra numa única empresa cliente de demonstração — é a
// subárvore que o app lê quando alguém dos usuários abaixo entra.
const EMPRESA_DEMO = 'demo';
const emp = db.collection('empresasClientes').doc(EMPRESA_DEMO);

const unidades = [
  { id: 'u1', nome: 'Senai Santa Maria', sigla: 'SAM' },
  { id: 'u2', nome: 'Senai Taguatinga', sigla: 'TAG' },
  { id: 'u3', nome: 'Senai Gama', sigla: 'GAM' },
  { id: 'u4', nome: 'Senai Sobradinho', sigla: 'SOB' }
];

const blocos = [
  { id: 'b1', unidadeId: 'u1', nome: 'Bloco A' },
  { id: 'b2', unidadeId: 'u1', nome: 'Bloco B' },
  { id: 'b3', unidadeId: 'u2', nome: 'Bloco Administrativo' }
];

const salas = [
  { id: 's1', unidadeId: 'u1', blocoId: 'b1', nome: 'Sala 101' },
  { id: 's2', unidadeId: 'u1', blocoId: 'b2', nome: 'Sala 12' },
  { id: 's3', unidadeId: 'u1', nome: 'Auditório Principal' },
  { id: 's4', unidadeId: 'u2', blocoId: 'b3', nome: 'Sala de Reuniões' }
];

const equipamentos = [
  { id: 'e1', unidadeId: 'u1', blocoId: 'b2', salaId: 's2', nome: 'Ar Split 12000 BTUs', patrimonio: 'PAT-0021' },
  { id: 'e2', unidadeId: 'u1', salaId: 's3', nome: 'Projetor Epson', patrimonio: 'PAT-0088' }
];

// Histórico dos últimos 6 meses — só pra dar volume realista aos gráficos
// do Painel Gerencial (espelha o gerador que existia em
// frontend/src/app/shared/mock-data.service.ts antes da migração pra
// Firestore). Os 3 chamados/2 OS acima continuam intocados.
const MESES_HISTORICO = ['2026-04', '2026-05', '2026-06', '2026-07', '2026-08', '2026-09'];
const STATUS_POR_MES: string[][] = [
  ['Encerrado', 'Encerrado', 'Executado', 'Encerrado', 'A ser finalizado', 'Encerrado', 'Executado', 'Encerrado'],
  ['Encerrado', 'Executado', 'Encerrado', 'A ser finalizado', 'Orçamento aprovado', 'Encerrado', 'Executado', 'Encerrado'],
  ['Executado', 'A ser finalizado', 'Encerrado', 'Orçamento aprovado', 'Em orçamento', 'Executado', 'Encerrado', 'A ser finalizado'],
  ['A ser finalizado', 'Orçamento aprovado', 'Em orçamento', 'Em atendimento', 'Executado', 'A ser finalizado', 'Orçamento aprovado', 'Encerrado'],
  ['Em atendimento', 'Em orçamento', 'Orçamento aprovado', 'Aberto', 'Em atendimento', 'A ser finalizado', 'Em orçamento', 'Executado'],
  ['Aberto', 'Aberto', 'Em atendimento', 'Aberto', 'Em orçamento', 'Aberto']
];
const UNIDADES_HISTORICO = ['u1', 'u2', 'u3', 'u4'];
const CONTRATOS_HISTORICO = ['c1', 'c2', 'c3'];
const TECNICOS_HISTORICO = ['usr5', 'usr6'];
const SOLICITANTES_HISTORICO = [
  { id: 'usr1', nome: 'Ana Souza' },
  { id: 'usr2', nome: 'Bruno Lima' }
];
const EQUIPAMENTOS_HISTORICO = [
  'Ar Split 12000 BTUs - Sala 12',
  'Projetor Epson - Auditório',
  'Bebedouro elétrico - Corredor',
  'Portão eletrônico - Entrada principal',
  'Bomba d’água - Casa de máquinas',
  'Luminária - Corredor Bloco A',
  'Ar Split 18000 BTUs - Sala de Reuniões',
  'Extintor de incêndio - Bloco B',
  'Câmera de segurança - Pátio',
  'Interfone - Portaria'
];

function pad2(n: number): string {
  return String(n).padStart(2, '0');
}

function addDias(data: string, dias: number): string {
  const [ano, mes, dia] = data.split('-').map(Number);
  const d = new Date(ano, mes - 1, dia + dias);
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

function situacaoDoStatus(status: string): string {
  if (status === 'Aberto') return 'Aberto';
  if (status === 'Executado' || status === 'Encerrado') return 'Convertido';
  return 'Em atendimento';
}

function situacaoOSDoStatus(status: string): string {
  switch (status) {
    case 'Em atendimento':
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

function gerarDadosHistoricos() {
  const chamadosHist: any[] = [];
  const osHist: any[] = [];
  let contador = 0;

  MESES_HISTORICO.forEach((mes, mesIdx) => {
    STATUS_POR_MES[mesIdx].forEach((status, idx) => {
      contador++;
      const dia = pad2(((idx * 5) % 26) + 2);
      const dataCriacao = `${mes}-${dia}`;
      const unidadeId = UNIDADES_HISTORICO[contador % UNIDADES_HISTORICO.length];
      const equipamento = EQUIPAMENTOS_HISTORICO[contador % EQUIPAMENTOS_HISTORICO.length];
      const solicitante = SOLICITANTES_HISTORICO[contador % SOLICITANTES_HISTORICO.length];
      const id = `ch-ger-${pad2(contador)}`;

      const chamado: any = {
        id,
        numero: `CH-2026-${String(200 + contador).padStart(4, '0')}`,
        titulo: `Manutenção — ${equipamento}`,
        equipamento,
        descricao: `Chamado histórico gerado para o painel gerencial (${equipamento}).`,
        unidadeId,
        solicitanteId: solicitante.id,
        solicitanteNome: solicitante.nome,
        situacao: situacaoDoStatus(status),
        status,
        dataCriacao,
        possuiFoto: contador % 3 === 0
      };

      if (status !== 'Aberto') {
        chamado.dataVencimento = addDias(dataCriacao, 5);
        chamado.responsavelId = TECNICOS_HISTORICO[contador % TECNICOS_HISTORICO.length];

        const osId = `os-ger-${pad2(contador)}`;
        chamado.ordemServicoId = osId;

        if (status === 'Executado' || status === 'Encerrado') {
          chamado.dataFechamento = addDias(dataCriacao, 10);
        }

        osHist.push({
          id: osId,
          numero: `OS-2026-${String(200 + contador).padStart(4, '0')}`,
          chamadoId: id,
          contratoId: CONTRATOS_HISTORICO[contador % CONTRATOS_HISTORICO.length],
          tecnicoId: chamado.responsavelId,
          situacao: situacaoOSDoStatus(status),
          dataCriacao: addDias(dataCriacao, 1)
        });
      }

      chamadosHist.push(chamado);
    });
  });

  return { chamadosHist, osHist };
}

const { chamadosHist: CHAMADOS_HISTORICOS, osHist: OS_HISTORICAS } = gerarDadosHistoricos();

const usuarios: UsuarioSeed[] = [
  { id: 'usr1', nome: 'Ana Souza', email: 'ana@senai.br', perfil: 'cliente', unidadeId: 'u1' },
  { id: 'usr2', nome: 'Bruno Lima', email: 'bruno@senai.br', perfil: 'cliente', unidadeId: 'u2' },
  { id: 'usr3', nome: 'Carla Dias', email: 'carla@senai.br', perfil: 'gestor' },
  { id: 'usr4', nome: 'Diego Rocha', email: 'diego@eletricasul.com.br', perfil: 'gestor_contratado', empresaContratadaId: 'c2' },
  { id: 'usr5', nome: 'Eduardo Nunes', email: 'eduardo@eletricasul.com.br', perfil: 'tecnico', empresaContratadaId: 'c2' },
  { id: 'usr6', nome: 'Fernanda Melo', email: 'fernanda@eletricasul.com.br', perfil: 'tecnico', empresaContratadaId: 'c2' }
];

const contratos = [
  {
    id: 'c1',
    numero: 'CTR-2026-001',
    fornecedor: 'Ar Condicionado Ltda',
    vigenciaInicio: '2026-01-01',
    vigenciaFim: '2026-12-31',
    status: 'Ativo',
    itens: [
      { id: 'i1', nome: 'Filtro de ar', unidadeMedida: 'un', quantidadeContratada: 500, quantidadeDisponivel: 48, quantidadeReservada: 72, quantidadeConsumida: 0, precoUnitario: 45.0 },
      { id: 'i2', nome: 'Carga de gás R-410A', unidadeMedida: 'kg', quantidadeContratada: 50, quantidadeDisponivel: 12, quantidadeReservada: 8, quantidadeConsumida: 0, precoUnitario: 120.0 },
      { id: 'i3', nome: 'Limpeza de unidade evaporadora', unidadeMedida: 'un', quantidadeContratada: 1000, quantidadeDisponivel: 250, quantidadeReservada: 150, quantidadeConsumida: 0, precoUnitario: 180.0 }
    ]
  },
  {
    id: 'c2',
    numero: 'CTR-2026-002',
    fornecedor: 'Elétrica Sul',
    vigenciaInicio: '2026-03-01',
    vigenciaFim: '2027-02-28',
    status: 'Ativo',
    itens: [
      { id: 'i4', nome: 'Lâmpada LED 9W', unidadeMedida: 'un', quantidadeContratada: 1000, quantidadeDisponivel: 750, quantidadeReservada: 50, quantidadeConsumida: 0, precoUnitario: 18.5 },
      { id: 'i5', nome: 'Troca de reator', unidadeMedida: 'un', quantidadeContratada: 80, quantidadeDisponivel: 65, quantidadeReservada: 5, quantidadeConsumida: 0, precoUnitario: 220.0 }
    ]
  },
  {
    id: 'c3',
    numero: 'CTR-2026-003',
    fornecedor: 'Hidráulica Norte',
    vigenciaInicio: '2026-02-15',
    vigenciaFim: '2027-02-14',
    status: 'Crítico',
    itens: [
      { id: 'i6', nome: 'Serviço hidráulico predial', unidadeMedida: 'h', quantidadeContratada: 100, quantidadeDisponivel: 7, quantidadeReservada: 5, quantidadeConsumida: 0, precoUnitario: 150.0 }
    ]
  }
];

const chamados = [
  {
    id: 'ch1', numero: 'CH-2026-0102', titulo: 'Ar-condicionado não liga', equipamento: 'Ar Split - Sala 12 Bloco B',
    descricao: 'A sala 12 do bloco B está sem ar-condicionado há 2 dias.', unidadeId: 'u1', solicitanteId: 'usr1',
    solicitanteNome: 'Ana Souza', situacao: 'Aberto', status: 'Aberto', dataCriacao: '2026-08-18', possuiFoto: true
  },
  {
    id: 'ch2', numero: 'CH-2026-0101', titulo: 'Troca de lâmpadas do auditório', equipamento: 'Luminárias - Auditório Principal',
    descricao: 'Auditório principal com 4 lâmpadas queimadas.', unidadeId: 'u2', solicitanteId: 'usr2',
    solicitanteNome: 'Bruno Lima', situacao: 'Em atendimento', status: 'Em orçamento', dataCriacao: '2026-08-15',
    responsavelId: 'usr5', ordemServicoId: 'os1', possuiFoto: true
  },
  {
    id: 'ch3', numero: 'CH-2026-0100', titulo: 'Vazamento na banheira hidráulica', equipamento: 'Bomba Hidráulica - Térreo',
    descricao: 'Vazamento constante na tubulação do banheiro do térreo.', unidadeId: 'u3', solicitanteId: 'usr1',
    solicitanteNome: 'Ana Souza', situacao: 'Convertido', status: 'Executado', dataCriacao: '2026-08-10', possuiFoto: false
  }
];

const ordensServico = [
  { id: 'os1', numero: 'OS-2026-0095', chamadoId: 'ch2', contratoId: 'c2', tecnicoId: 'usr6', situacao: 'Aberta', orcamentoId: 'orc1', dataCriacao: '2026-08-16' },
  { id: 'os2', numero: 'OS-2026-0094', chamadoId: 'ch3', contratoId: 'c3', tecnicoId: 'usr5', situacao: 'Executada', orcamentoId: 'orc2', dataCriacao: '2026-08-11' }
];

const orcamentos = [
  { id: 'orc1', osId: 'os1', situacao: 'Pendente', itens: [{ itemContratoId: 'i4', nome: 'Lâmpada LED 9W', quantidade: 4, precoUnitario: 18.5 }], dataCriacao: '2026-08-16' },
  { id: 'orc2', osId: 'os2', situacao: 'Aprovado', itens: [{ itemContratoId: 'i6', nome: 'Vedação 22mm', quantidade: 2, precoUnitario: 12.0 }], dataCriacao: '2026-08-11' }
];

const contadores = [
  { id: 'CH-2026', valor: 102 },
  { id: 'OS-2026', valor: 95 },
  { id: 'ORC-2026', valor: 2 }
];

async function seedAuth() {
  const auth = getAuth();
  for (const u of usuarios) {
    try {
      await auth.createUser({ uid: u.id, email: u.email, password: SENHA_PADRAO, displayName: u.nome });
    } catch (e: any) {
      if (e.code !== 'auth/uid-already-exists' && e.code !== 'auth/email-already-exists') throw e;
    }
    // O perfil vai no token como custom claim (ver perfis.ts): é o que as
    // Security Rules leem pra decidir quem acessa o quê.
    await auth.setCustomUserClaims(u.id, {
      perfil: u.perfil,
      empresaId: EMPRESA_DEMO,
      usuarioId: u.id,
      ...(u.unidadeId ? { unidadeId: u.unidadeId } : {}),
      ...(u.empresaContratadaId ? { empresaContratadaId: u.empresaContratadaId } : {})
    });
  }
}

export async function seedFirestore() {
  // Firestore limita 500 writes por batch — o histórico sozinho passa de
  // 80, então tudo vai numa fila só, despachada em lotes de 400.
  const writes: Array<() => void> = [];
  let batch = db.batch();
  let contador = 0;

  function agendar(fn: (b: FirebaseFirestore.WriteBatch) => void) {
    writes.push(() => fn(batch));
  }

  agendar((b) => b.set(emp, { id: EMPRESA_DEMO, nome: 'Senai DF (demonstração)', ativa: true, gestorEmail: 'carla@senai.br' }));
  unidades.forEach((u) => agendar((b) => b.set(emp.collection('unidades').doc(u.id), u)));
  blocos.forEach((bl) => agendar((b) => b.set(emp.collection('blocos').doc(bl.id), bl)));
  salas.forEach((s) => agendar((b) => b.set(emp.collection('salas').doc(s.id), s)));
  equipamentos.forEach((e) => agendar((b) => b.set(emp.collection('equipamentos').doc(e.id), e)));
  usuarios.forEach((u) => agendar((b) => b.set(emp.collection('usuarios').doc(u.id), u)));
  chamados.forEach((c) => agendar((b) => b.set(emp.collection('chamados').doc(c.id), c)));
  // Cada contrato do seed é de uma empresa contratada com o mesmo id (os
  // usuários contratados já apontam pra 'c2'). OS e orçamento carregam a
  // unidade e a contratada, que é o que as rules filtram.
  contratos.forEach((c) => agendar((b) => b.set(emp.collection('empresasContratadas').doc(c.id), { id: c.id, nome: c.fornecedor })));
  const unidadeDoChamado = (chamadoId: string) => [...chamados, ...CHAMADOS_HISTORICOS].find((c) => c.id === chamadoId)?.unidadeId;
  const todasOS = [...ordensServico, ...OS_HISTORICAS] as Array<{ id: string; chamadoId: string; contratoId: string }>;
  ordensServico.forEach((os) => agendar((b) => b.set(emp.collection('ordensServico').doc(os.id), { ...os, unidadeId: unidadeDoChamado(os.chamadoId), empresaContratadaId: os.contratoId })));
  orcamentos.forEach((o) => agendar((b) => b.set(emp.collection('orcamentos').doc(o.id), { ...o, empresaContratadaId: todasOS.find((os) => os.id === o.osId)?.contratoId })));
  contadores.forEach((c) => agendar((b) => b.set(emp.collection('contadores').doc(c.id), { valor: c.valor })));
  CHAMADOS_HISTORICOS.forEach((c) => agendar((b) => b.set(emp.collection('chamados').doc(c.id), c)));
  OS_HISTORICAS.forEach((os) => agendar((b) => b.set(emp.collection('ordensServico').doc(os.id), { ...os, unidadeId: unidadeDoChamado(os.chamadoId), empresaContratadaId: os.contratoId })));

  contratos.forEach((c) => {
    const { itens, ...cabecalho } = c;
    agendar((b) => b.set(emp.collection('contratos').doc(c.id), { ...cabecalho, empresaContratadaId: c.id }));
    itens.forEach((item) =>
      agendar((b) => b.set(emp.collection('contratos').doc(c.id).collection('itens').doc(item.id), { ...item, empresaId: EMPRESA_DEMO }))
    );
  });

  for (const escrever of writes) {
    escrever();
    contador++;
    if (contador % 400 === 0) {
      await batch.commit();
      batch = db.batch();
    }
  }
  await batch.commit();
}

async function main() {
  // Em produção não criamos as contas Auth de demonstração (senha fixa
  // "senai123" real, exposta) — só via emulator, controlado por env var.
  const criarAuth = !!process.env.FIREBASE_AUTH_EMULATOR_HOST;
  if (criarAuth) {
    console.log('Semeando Auth Emulator...');
    await seedAuth();
  } else {
    console.log('Pulando criação de usuários no Auth (fora do emulator) — só dados no Firestore.');
  }
  console.log('Semeando Firestore...');
  await seedFirestore();
  console.log(criarAuth ? `Pronto. Login de teste: qualquer e-mail acima / senha "${SENHA_PADRAO}".` : 'Pronto.');
}

if (require.main === module) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
