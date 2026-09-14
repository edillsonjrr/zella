// Correção pontual de saldo: recalcula `quantidadeDisponivel` de itens cuja
// soma (disponível + reservada + consumida) não bate com a contratada,
// assumindo contratada, reservada e consumida como corretos.
//
//   disponível = contratada − reservada − consumida
//
// Uso (pasta functions, Firebase CLI logado):
//   node scripts/corrigir-disponivel.js <empresaId>            # só mostra
//   node scripts/corrigir-disponivel.js <empresaId> --aplicar  # grava
//
// Só toca no campo quantidadeDisponivel (updateMask) e registra um log
// `itemContrato.editar` por item corrigido, com origem 'backend'.
const fs = require('fs');
const path = require('path');
const os = require('os');
const { refreshToken } = require('firebase-admin/app');

const PROJETO = 'gestao-manutencao-app';
const BASE = `https://firestore.googleapis.com/v1/projects/${PROJETO}/databases/(default)/documents`;

const [empresaId, flag] = process.argv.slice(2);
const aplicar = flag === '--aplicar';
if (!empresaId) {
  console.error('Informe o id da empresa.');
  process.exit(1);
}

const store = JSON.parse(fs.readFileSync(path.join(os.homedir(), '.config/configstore/firebase-tools.json'), 'utf8'));
const credential = refreshToken({
  type: 'authorized_user',
  client_id: '563584335869-fgrhgmd47bqnekij5i8b5pr03ho849e6.apps.googleusercontent.com',
  client_secret: 'j9iVZfS8kkCEFUPaAeJV0sAi',
  refresh_token: store.tokens.refresh_token
});
let tokenCache;
async function token() {
  if (!tokenCache) tokenCache = (await credential.getAccessToken()).access_token;
  return tokenCache;
}
async function api(metodo, caminho, corpo, query = '') {
  const r = await fetch(`${BASE}/${caminho}${query}`, {
    method: metodo,
    headers: { Authorization: `Bearer ${await token()}`, 'Content-Type': 'application/json' },
    body: corpo ? JSON.stringify(corpo) : undefined
  });
  if (!r.ok) throw new Error(`${r.status} ${metodo} ${caminho}: ${await r.text()}`);
  return r.json();
}
const num = (v) => Number(v?.integerValue ?? v?.doubleValue ?? 0) || 0;
const str = (v) => v?.stringValue ?? '';

async function main() {
  const raiz = `empresasClientes/${empresaId}`;
  const contratos = (await api('GET', `${raiz}/contratos`, null, '?pageSize=300')).documents ?? [];
  let corrigidos = 0;
  for (const c of contratos) {
    const cid = c.name.split('/').pop();
    const numero = str(c.fields.numero) || cid;
    const itens = (await api('GET', `${raiz}/contratos/${cid}/itens`, null, '?pageSize=300')).documents ?? [];
    for (const i of itens) {
      const f = i.fields;
      const contratada = num(f.quantidadeContratada), res = num(f.quantidadeReservada), cons = num(f.quantidadeConsumida), disp = num(f.quantidadeDisponivel);
      const novo = contratada - res - cons;
      if (disp === novo) continue;
      if (novo < 0) {
        console.log(`PULADO  ${numero} "${str(f.nome)}": reservada+consumida (${res + cons}) > contratada (${contratada}); precisa de decisão manual`);
        continue;
      }
      console.log(`${aplicar ? 'CORRIGE' : 'FARIA  '} ${numero} "${str(f.nome)}": disponível ${disp} -> ${novo}`);
      if (!aplicar) continue;
      const iid = i.name.split('/').pop();
      await api('PATCH', `${raiz}/contratos/${cid}/itens/${iid}`, { fields: { quantidadeDisponivel: { integerValue: String(novo) } } }, '?updateMask.fieldPaths=quantidadeDisponivel');
      const logId = `corr_${iid}_${Date.now()}`;
      await api('PATCH', `${raiz}/logs/${logId}`, { fields: {
        id: { stringValue: logId },
        acao: { stringValue: 'itemContrato.editar' },
        alvo: { stringValue: 'itemContrato' },
        operacao: { stringValue: 'editar' },
        descricao: { stringValue: `Correção de saldo do item "${str(f.nome)}" do contrato ${numero}: disponível recalculado (${disp} -> ${novo})` },
        data: { stringValue: new Date().toISOString() },
        usuarioUid: { stringValue: 'sistema' },
        usuarioNome: { stringValue: 'Correção de saldo (script)' },
        usuarioEmail: { stringValue: '' },
        alvoId: { stringValue: iid },
        alvoRotulo: { stringValue: str(f.nome) },
        alvoPaiId: { stringValue: cid },
        detalhes: { mapValue: { fields: { quantidadeDisponivel: { mapValue: { fields: { de: { integerValue: String(disp) }, para: { integerValue: String(novo) } } } } } } },
        origem: { stringValue: 'backend' }
      } });
      corrigidos++;
    }
  }
  console.log(aplicar ? `\n${corrigidos} item(ns) corrigido(s).` : '\nNada gravado (rode com --aplicar para gravar).');
}

main().catch((e) => { console.error(e); process.exit(1); });
