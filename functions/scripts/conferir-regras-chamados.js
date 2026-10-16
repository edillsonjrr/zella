// Confere as regras PUBLICADAS do Firestore (release cloud.firestore) com a
// API de teste de regras: para cada chamado real da empresa demo, pergunta se
// a contratada (claims simulados de Diego, Eduardo e um responsável da c1) e a
// gestora podem ler. Só lê; não precisa da senha de ninguém.
//   node scripts/conferir-regras-chamados.js   (pasta functions, Firebase CLI logado)
const fs = require('fs'), path = require('path'), os = require('os');
const req = (m) => require(path.join(process.cwd(), 'node_modules', m));
const { Firestore } = req('@google-cloud/firestore');
const { UserRefreshClient } = req('google-auth-library');

const PROJETO = 'gestao-manutencao-app';
const store = JSON.parse(fs.readFileSync(path.join(os.homedir(), '.config/configstore/firebase-tools.json'), 'utf8'));
const cred = {
  type: 'authorized_user',
  client_id: '563584335869-fgrhgmd47bqnekij5i8b5pr03ho849e6.apps.googleusercontent.com',
  client_secret: 'j9iVZfS8kkCEFUPaAeJV0sAi',
  refresh_token: store.tokens.refresh_token
};
const db = new Firestore({ projectId: PROJETO, credentials: cred });
const cliente = new UserRefreshClient(cred.client_id, cred.client_secret, cred.refresh_token);

async function api(metodo, url, corpo) {
  const { token } = await cliente.getAccessToken();
  const r = await fetch(url, { method: metodo, headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', 'x-goog-user-project': PROJETO }, body: corpo ? JSON.stringify(corpo) : undefined });
  const j = await r.json();
  if (!r.ok) throw new Error(`${r.status} ${url}: ${JSON.stringify(j)}`);
  return j;
}

const quem = {
  'Diego (responsável, Elétrica Sul c2)': { uid: 'usr4', perfil: 'gestor_contratado', usuarioId: 'usr4', empresaContratadaId: 'c2' },
  'Eduardo (técnico, Elétrica Sul c2)': { uid: 'usr5', perfil: 'tecnico', usuarioId: 'usr5', empresaContratadaId: 'c2' },
  'Responsável simulado da Ar Condicionado (c1)': { uid: 'sim-c1', perfil: 'gestor_contratado', usuarioId: 'sim-c1', empresaContratadaId: 'c1' },
  'Gestora (Carla)': { uid: 'usr3', perfil: 'gestor', usuarioId: 'usr3' }
};

(async () => {
  const release = await api('GET', `https://firebaserules.googleapis.com/v1/projects/${PROJETO}/releases/cloud.firestore`);
  console.log(`Regras publicadas: ${release.rulesetName} (atualizadas em ${release.updateTime})`);
  const chamados = (await db.collection('empresasClientes').doc('demo').collection('chamados').get()).docs.map((d) => ({ id: d.id, ...d.data() }));
  for (const [nome, c] of Object.entries(quem)) {
    const { uid, ...claims } = c;
    const casos = chamados.map((ch) => ({
      expectation: 'ALLOW',
      request: {
        auth: { uid, token: { ...claims, empresaId: 'demo', email: `${uid}@teste`, firebase: { sign_in_provider: 'password' } } },
        path: `/databases/(default)/documents/empresasClientes/demo/chamados/${ch.id}`,
        method: 'get'
      },
      resource: { data: JSON.parse(JSON.stringify(ch)) }
    }));
    const permitidos = [];
    for (let i = 0; i < casos.length; i += 25) {
      const r = await api('POST', `https://firebaserules.googleapis.com/v1/${release.rulesetName}:test`, { testSuite: { testCases: casos.slice(i, i + 25) } });
      r.testResults.forEach((t, k) => { if (t.state === 'SUCCESS') permitidos.push(chamados[i + k]); });
    }
    const porContratada = {};
    permitidos.forEach((ch) => { const k = ch.empresaContratadaId ?? '(sem OS)'; porContratada[k] = (porContratada[k] || 0) + 1; });
    const alheios = c.empresaContratadaId ? permitidos.filter((ch) => ch.empresaContratadaId !== c.empresaContratadaId).length : 0;
    const proprios = c.empresaContratadaId ? chamados.filter((ch) => ch.empresaContratadaId === c.empresaContratadaId).length : chamados.length;
    console.log(`${nome}: lê ${permitidos.length} de ${chamados.length} ${JSON.stringify(porContratada)}; de outra contratada ou sem OS: ${alheios}; dos próprios: ${permitidos.length - alheios} de ${proprios}`);
  }
})().catch((e) => { console.error(e.message); process.exit(1); });
