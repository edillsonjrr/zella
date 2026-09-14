// Acesso ao Firestore de produção com a credencial do Firebase CLI logado.
// Uso: node fs.js read | node fs.js write
const fs = require('fs');
const path = require('path');
const os = require('os');
const { initializeApp, refreshToken } = require('firebase-admin/app');
const { getFirestore } = require('firebase-admin/firestore');

const store = JSON.parse(fs.readFileSync(path.join(os.homedir(), '.config/configstore/firebase-tools.json'), 'utf8'));
// Client id/secret públicos do firebase-tools (constantes do próprio CLI).
const credential = refreshToken({
  type: 'authorized_user',
  client_id: '563584335869-fgrhgmd47bqnekij5i8b5pr03ho849e6.apps.googleusercontent.com',
  client_secret: 'j9iVZfS8kkCEFUPaAeJV0sAi',
  refresh_token: store.tokens.refresh_token
});
initializeApp({ credential, projectId: 'gestao-manutencao-app' });
const db = getFirestore();

const EMAIL = 'edilsonjuniormvf@gmail.com';
const NOME = 'Edilson Junior';

async function read() {
  const empresas = await db.collection('empresasClientes').get();
  for (const e of empresas.docs) {
    console.log('EMPRESA', e.id, JSON.stringify(e.data()));
    const us = await e.ref.collection('usuarios').get();
    for (const u of us.docs) console.log('   usuario', u.id, JSON.stringify(u.data()));
  }
}

// Grava o cadastro de gestor só na empresa de demonstração ('demo').
async function write() {
  const demo = await db.collection('empresasClientes').doc('demo').get();
  if (!demo.exists) throw new Error('Empresa demo não encontrada');
  for (const e of [demo]) {
    const usuarios = e.ref.collection('usuarios');
    const existente = await usuarios.where('email', '==', EMAIL).limit(1).get();
    if (!existente.empty) {
      await existente.docs[0].ref.set({ perfil: 'gestor', nome: NOME }, { merge: true });
      console.log('atualizado', e.id, existente.docs[0].id);
    } else {
      const ref = usuarios.doc();
      await ref.set({ id: ref.id, nome: NOME, email: EMAIL, perfil: 'gestor' });
      console.log('criado', e.id, ref.id);
    }
    await e.ref.set({ gestorEmail: EMAIL }, { merge: true });
  }
}

(process.argv[2] === 'write' ? write() : read()).then(() => process.exit(0)).catch(err => { console.error(err); process.exit(1); });
