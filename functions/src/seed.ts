// Popula o Firestore Emulator com a empresa de demonstração. Rode com
// `npm run seed` (dentro de functions/), com os emuladores já rodando
// (`firebase emulators:start`).
//
// Os dados ficam em seedDados.ts, montados sem tocar no Firestore: é lá que
// o saldo de cada item é calculado a partir das OS e dos orçamentos do
// próprio seed, para que contratada = disponível + reservada + consumida.
import { getAuth } from 'firebase-admin/auth';
import { db } from './admin';
import { EMPRESA_DEMO, montarDadosSeed } from './seedDados';

const SENHA_PADRAO = 'senai123';

// Tudo do seed entra numa única empresa cliente de demonstração — é a
// subárvore que o app lê quando alguém dos usuários abaixo entra.
const emp = db.collection('empresasClientes').doc(EMPRESA_DEMO);
const dados = montarDadosSeed(new Date().toISOString().split('T')[0]);
const { usuarios } = dados;

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
  dados.unidades.forEach((u) => agendar((b) => b.set(emp.collection('unidades').doc(u.id), u)));
  dados.blocos.forEach((bl) => agendar((b) => b.set(emp.collection('blocos').doc(bl.id), bl)));
  dados.salas.forEach((s) => agendar((b) => b.set(emp.collection('salas').doc(s.id), s)));
  dados.equipamentos.forEach((e) => agendar((b) => b.set(emp.collection('equipamentos').doc(e.id), e)));
  usuarios.forEach((u) => agendar((b) => b.set(emp.collection('usuarios').doc(u.id), u)));
  // Cada contrato do seed é de uma empresa contratada com o mesmo id (os
  // usuários contratados apontam pra 'c2'). OS e orçamento carregam a
  // unidade e a contratada, que é o que as rules filtram.
  dados.empresasContratadas.forEach((e) => agendar((b) => b.set(emp.collection('empresasContratadas').doc(e.id), e)));
  dados.chamados.forEach((c) => agendar((b) => b.set(emp.collection('chamados').doc(c.id), c)));
  dados.ordensServico.forEach((os) => agendar((b) => b.set(emp.collection('ordensServico').doc(os.id), os)));
  dados.orcamentos.forEach((o) => agendar((b) => b.set(emp.collection('orcamentos').doc(o.id), o)));
  dados.contadores.forEach((c) => agendar((b) => b.set(emp.collection('contadores').doc(c.id), { valor: c.valor })));

  dados.contratos.forEach((c) => {
    const { itens, ...cabecalho } = c;
    agendar((b) => b.set(emp.collection('contratos').doc(c.id), cabecalho));
    itens.forEach((item) => agendar((b) => b.set(emp.collection('contratos').doc(c.id).collection('itens').doc(item.id), item)));
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
