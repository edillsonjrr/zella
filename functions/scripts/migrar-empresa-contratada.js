// Migração da rodada 3 (15/10/2026): preenche `empresaContratadaId` nos
// chamados que já têm OS. A regra nova de `chamados` (firestore.rules) só
// deixa a contratada ler o chamado cujo `empresaContratadaId` é o dela; os
// chamados criados antes da correção não têm o campo, e a contratada deixaria
// de ver os próprios chamados antigos.
//
// De onde vem o valor: da OS ligada (`ordemServicoId`), como faz criarOS. Se a
// OS não tiver o campo, do contrato da OS. Chamado sem OS fica sem o campo.
//
// Uso (pasta functions):
//   node scripts/migrar-empresa-contratada.js --simular                 # emulador: só lista
//   node scripts/migrar-empresa-contratada.js --aplicar                 # emulador: grava
//   node scripts/migrar-empresa-contratada.js --simular --producao=gestao-manutencao-app
//   node scripts/migrar-empresa-contratada.js --aplicar --producao=gestao-manutencao-app
//   node scripts/migrar-empresa-contratada.js --reverter=<cópia.json> --simular|--aplicar [--producao=...]
//
// Opções:
//   --empresa=<id>   só uma empresa cliente (sem ela, todas)
//   --copia=<arq>    onde salvar a cópia do valor anterior (só com --aplicar)
//
// Segurança:
//   - Sem FIRESTORE_EMULATOR_HOST, só roda com --producao=<projeto> escrito
//     por extenso. Com a variável, sempre vai ao emulador.
//   - Sem --aplicar nada é gravado.
//   - Só toca no campo empresaContratadaId e grava um log `chamado.editar`
//     por chamado alterado (origem 'backend'), como as functions.
//   - Com --aplicar, salva antes uma cópia com o valor anterior de cada
//     chamado alterado; --reverter=<cópia> volta exatamente esses valores.
const fs = require('fs');
const path = require('path');
const os = require('os');
const { initializeApp, applicationDefault } = require('firebase-admin/app');
const { Firestore } = require('@google-cloud/firestore');
const { getFirestore, FieldValue } = require('firebase-admin/firestore');

const AUTOR = { uid: 'sistema', nome: 'Migração da contratada no chamado (script)', email: '' };
const LOTE = 400; // escritas por batch (limite do Firestore: 500)

/**
 * Monta o plano de uma empresa sem gravar nada. Devolve as mudanças (chamado
 * que ganha ou troca o campo), os problemas (chamado com OS que o script não
 * consegue resolver) e os avisos (o que merece um olhar, mas não muda).
 */
async function planejarEmpresa(db, empresaId) {
  const emp = db.collection('empresasClientes').doc(empresaId);
  const [chamados, ordens, contratos] = await Promise.all([
    emp.collection('chamados').get(),
    emp.collection('ordensServico').get(),
    emp.collection('contratos').get()
  ]);
  const osPorId = new Map(ordens.docs.map((d) => [d.id, d.data()]));
  const contratoPorId = new Map(contratos.docs.map((d) => [d.id, d.data()]));

  const plano = { empresaId, total: chamados.size, semOS: 0, jaCertos: 0, mudancas: [], problemas: [], avisos: [] };
  for (const doc of chamados.docs) {
    const ch = doc.data();
    const rotulo = ch.numero || doc.id;
    const atual = ch.empresaContratadaId;
    if (!ch.ordemServicoId) {
      plano.semOS++;
      if (atual) plano.avisos.push({ chamadoId: doc.id, rotulo, texto: `não tem OS, mas tem empresaContratadaId "${atual}" (não mexi)` });
      continue;
    }
    const osDoc = osPorId.get(ch.ordemServicoId);
    if (!osDoc) {
      plano.problemas.push({ chamadoId: doc.id, rotulo, texto: `aponta para a OS ${ch.ordemServicoId}, que não existe` });
      continue;
    }
    const daOS = osDoc.empresaContratadaId;
    const doContrato = contratoPorId.get(osDoc.contratoId)?.empresaContratadaId;
    if (daOS && doContrato && daOS !== doContrato) {
      plano.avisos.push({ chamadoId: doc.id, rotulo, texto: `a OS ${osDoc.numero || ch.ordemServicoId} diz "${daOS}" e o contrato ${osDoc.contratoId} diz "${doContrato}"; usei o da OS` });
    }
    const novo = daOS || doContrato;
    if (!novo) {
      plano.problemas.push({ chamadoId: doc.id, rotulo, texto: `nem a OS ${osDoc.numero || ch.ordemServicoId} nem o contrato ${osDoc.contratoId || '(sem contrato)'} têm empresaContratadaId` });
      continue;
    }
    if (atual === novo) {
      plano.jaCertos++;
      continue;
    }
    plano.mudancas.push({ chamadoId: doc.id, rotulo, de: atual ?? null, para: novo, origem: daOS ? 'OS' : 'contrato' });
  }
  return plano;
}

/** Grava as mudanças em lotes: o campo do chamado e um log por chamado. */
async function gravar(db, empresaId, mudancas, descrever) {
  const emp = db.collection('empresasClientes').doc(empresaId);
  for (let i = 0; i < mudancas.length; i += LOTE / 2) {
    const batch = db.batch();
    for (const m of mudancas.slice(i, i + LOTE / 2)) {
      batch.update(emp.collection('chamados').doc(m.chamadoId), {
        empresaContratadaId: m.para === null ? FieldValue.delete() : m.para
      });
      const logRef = emp.collection('logs').doc();
      batch.set(logRef, {
        id: logRef.id,
        acao: 'chamado.editar',
        alvo: 'chamado',
        operacao: 'editar',
        descricao: descrever(m),
        data: new Date().toISOString(),
        usuarioUid: AUTOR.uid,
        usuarioNome: AUTOR.nome,
        usuarioEmail: AUTOR.email,
        alvoId: m.chamadoId,
        alvoRotulo: m.rotulo,
        alvoPaiId: m.chamadoId,
        detalhes: { empresaContratadaId: { de: m.de, para: m.para } },
        origem: 'backend'
      });
    }
    await batch.commit();
  }
}

async function empresasAlvo(db, empresaId) {
  if (empresaId) return [empresaId];
  const lista = await db.collection('empresasClientes').listDocuments();
  return lista.map((r) => r.id);
}

/**
 * Migração. Com `aplicar: false` só devolve o relatório e a cópia que seria
 * salva. Com `aplicar: true` chama `antesDeGravar(copia)` (onde a linha de
 * comando salva a cópia em disco) e só então grava.
 */
async function migrar(db, { aplicar = false, empresaId, antesDeGravar } = {}) {
  const planos = [];
  for (const id of await empresasAlvo(db, empresaId)) planos.push(await planejarEmpresa(db, id));
  const copia = planos.flatMap((p) => p.mudancas.map((m) => ({ empresaId: p.empresaId, chamadoId: m.chamadoId, rotulo: m.rotulo, antes: m.de, depois: m.para })));
  if (aplicar) {
    if (antesDeGravar) await antesDeGravar(copia);
    for (const p of planos) {
      await gravar(db, p.empresaId, p.mudancas, (m) =>
        `Migração: chamado ${m.rotulo} ligado à empresa contratada "${m.para}" (da ${m.origem === 'OS' ? 'OS' : 'contrato da OS'})${m.de ? `; antes "${m.de}"` : ''}`
      );
    }
  }
  return { planos, copia };
}

/**
 * Volta os valores de uma cópia salva por `migrar`. Só volta o chamado que
 * ainda está com o valor que a migração gravou; o que mudou depois (OS nova,
 * reabertura) fica como está e aparece em `ignorados`.
 */
async function reverter(db, copia, { aplicar = false } = {}) {
  const porEmpresa = new Map();
  const ignorados = [];
  for (const c of copia) {
    const snap = await db.collection('empresasClientes').doc(c.empresaId).collection('chamados').doc(c.chamadoId).get();
    const atual = snap.exists ? snap.data().empresaContratadaId ?? null : undefined;
    if (atual !== c.depois) {
      ignorados.push({ ...c, atual: atual === undefined ? '(chamado apagado)' : atual });
      continue;
    }
    if (!porEmpresa.has(c.empresaId)) porEmpresa.set(c.empresaId, []);
    porEmpresa.get(c.empresaId).push({ chamadoId: c.chamadoId, rotulo: c.rotulo, de: c.depois, para: c.antes });
  }
  if (aplicar) {
    for (const [empresaId, mudancas] of porEmpresa) {
      await gravar(db, empresaId, mudancas, (m) =>
        `Migração revertida: chamado ${m.rotulo} ${m.para ? `volta para a empresa contratada "${m.para}"` : 'volta a ficar sem empresa contratada'}`
      );
    }
  }
  return { porEmpresa, ignorados };
}

/* Linha de comando -------------------------------------------------------- */

function lerArgs(argv) {
  const args = {};
  for (const a of argv) {
    const [chave, ...resto] = a.replace(/^--/, '').split('=');
    args[chave] = resto.length ? resto.join('=') : true;
  }
  return args;
}

function conectar(args) {
  if (process.env.FIRESTORE_EMULATOR_HOST) {
    const projectId = process.env.GCLOUD_PROJECT || 'gestao-manutencao-app';
    console.log(`Destino: EMULADOR ${process.env.FIRESTORE_EMULATOR_HOST} (projeto ${projectId})`);
    return getFirestore(initializeApp({ projectId }));
  }
  if (typeof args.producao !== 'string' || !args.producao) {
    console.error('Sem FIRESTORE_EMULATOR_HOST: para rodar em produção, escreva --producao=<projeto> (ex.: --producao=gestao-manutencao-app).');
    process.exit(1);
  }
  // Mesmo login dos outros scripts desta pasta: o do Firebase CLI. O
  // Firestore da Admin SDK só aceita conta de serviço ou credencial padrão,
  // então aqui o cliente do Firestore é criado direto com o login do CLI.
  // Sem ele, as credenciais padrão do Google (gcloud auth application-default login).
  const arquivo = path.join(os.homedir(), '.config/configstore/firebase-tools.json');
  console.log(`Destino: PRODUÇÃO, projeto ${args.producao}`);
  if (!fs.existsSync(arquivo)) {
    return getFirestore(initializeApp({ projectId: args.producao, credential: applicationDefault() }));
  }
  const store = JSON.parse(fs.readFileSync(arquivo, 'utf8'));
  return new Firestore({
    projectId: args.producao,
    credentials: {
      type: 'authorized_user',
      client_id: '563584335869-fgrhgmd47bqnekij5i8b5pr03ho849e6.apps.googleusercontent.com',
      client_secret: 'j9iVZfS8kkCEFUPaAeJV0sAi',
      refresh_token: store.tokens.refresh_token
    }
  });
}

function imprimirPlano(planos, aplicar) {
  let mudancas = 0, problemas = 0;
  for (const p of planos) {
    console.log(`\nEmpresa ${p.empresaId}: ${p.total} chamado(s); ${p.semOS} sem OS; ${p.jaCertos} já certo(s); ${p.mudancas.length} a mudar; ${p.problemas.length} problema(s)`);
    for (const m of p.mudancas) {
      console.log(`  ${aplicar ? 'GRAVOU ' : 'MUDARIA'} ${m.rotulo}: ${m.de ?? '(sem campo)'} -> ${m.para} (da ${m.origem})`);
    }
    for (const x of p.problemas) console.log(`  PROBLEMA ${x.rotulo}: ${x.texto}`);
    for (const x of p.avisos) console.log(`  AVISO    ${x.rotulo}: ${x.texto}`);
    mudancas += p.mudancas.length;
    problemas += p.problemas.length;
  }
  console.log(`\nTotal: ${mudancas} chamado(s) ${aplicar ? 'alterado(s)' : 'a alterar'}; ${problemas} problema(s) para resolver à mão.`);
}

async function main() {
  const args = lerArgs(process.argv.slice(2));
  const aplicar = args.aplicar === true;
  if (aplicar === (args.simular === true)) {
    console.error('Escolha um modo: --simular (só lista) ou --aplicar (grava).');
    process.exit(1);
  }
  const db = conectar(args);
  console.log(aplicar ? 'Modo: APLICAR (grava)' : 'Modo: SIMULAR (não grava nada)');

  if (typeof args.reverter === 'string') {
    const copia = JSON.parse(fs.readFileSync(args.reverter, 'utf8'));
    const { porEmpresa, ignorados } = await reverter(db, copia.chamados, { aplicar });
    let n = 0;
    for (const [empresaId, lista] of porEmpresa) {
      console.log(`\nEmpresa ${empresaId}:`);
      for (const m of lista) console.log(`  ${aplicar ? 'VOLTOU ' : 'VOLTARIA'} ${m.rotulo}: ${m.de} -> ${m.para ?? '(sem campo)'}`);
      n += lista.length;
    }
    for (const x of ignorados) console.log(`  IGNORADO ${x.rotulo} (${x.empresaId}): está com "${x.atual}", não com "${x.depois}" da migração; mudou depois, não mexi`);
    console.log(`\nTotal: ${n} chamado(s) ${aplicar ? 'revertido(s)' : 'a reverter'}; ${ignorados.length} ignorado(s).`);
    return;
  }

  const empresaId = typeof args.empresa === 'string' ? args.empresa : undefined;
  // A cópia vai para o disco ANTES de gravar: se a gravação parar no meio,
  // ela já cobre tudo que pode ter mudado.
  const salvarCopia = (copia) => {
    const destino = typeof args.copia === 'string'
      ? args.copia
      : path.join(process.cwd(), `migracao-empresaContratadaId-${new Date().toISOString().replace(/[:.]/g, '-')}.json`);
    fs.writeFileSync(destino, JSON.stringify({ criadoEm: new Date().toISOString(), destino: process.env.FIRESTORE_EMULATOR_HOST ? 'emulador' : args.producao, chamados: copia }, null, 2));
    console.log(`Cópia dos valores anteriores: ${destino}`);
  };
  const { planos } = await migrar(db, { aplicar, empresaId, antesDeGravar: salvarCopia });
  imprimirPlano(planos, aplicar);
  if (!aplicar) console.log('Nada gravado (rode com --aplicar para gravar).');
}

module.exports = { planejarEmpresa, migrar, reverter };

if (require.main === module) {
  main().catch((e) => {
    console.error(e);
    process.exit(1);
  });
}
