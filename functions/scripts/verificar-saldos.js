// Verificação SOMENTE LEITURA do saldo de contrato em produção.
//
// Procura, em todas as empresas:
//   1. Itens cuja soma (disponível + reservada + consumida) não bate com a
//      quantidade contratada.
//   2. Chamados encerrados ou cancelados cuja OS ficou "Aprovada" com
//      orçamento aprovado — reserva presa (nem consumida, nem devolvida).
//   3. OS com mais de um orçamento, onde um antigo aprovado pode ter
//      reserva duplicada.
//   4. Itens com reservada ou disponível negativos.
//
// Não escreve nada. Uso (na pasta functions, com o Firebase CLI logado):
//   node scripts/verificar-saldos.js
//
// Fala com a API REST do Firestore usando o token do Firebase CLI local
// (o Admin SDK não aceita esse tipo de credencial para o Firestore).
const fs = require('fs');
const path = require('path');
const os = require('os');
const { refreshToken } = require('firebase-admin/app');

const PROJETO = 'gestao-manutencao-app';
const BASE = `https://firestore.googleapis.com/v1/projects/${PROJETO}/databases/(default)/documents`;

const store = JSON.parse(fs.readFileSync(path.join(os.homedir(), '.config/configstore/firebase-tools.json'), 'utf8'));
// Client id/secret públicos do firebase-tools (constantes do próprio CLI).
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

// Converte o formato REST ({stringValue}, {integerValue}...) em JS simples.
function valor(v) {
  if (v == null) return undefined;
  if ('stringValue' in v) return v.stringValue;
  if ('integerValue' in v) return Number(v.integerValue);
  if ('doubleValue' in v) return v.doubleValue;
  if ('booleanValue' in v) return v.booleanValue;
  if ('nullValue' in v) return null;
  if ('timestampValue' in v) return v.timestampValue;
  if ('mapValue' in v) return campos(v.mapValue.fields);
  if ('arrayValue' in v) return (v.arrayValue.values ?? []).map(valor);
  return undefined;
}
function campos(f = {}) {
  return Object.fromEntries(Object.entries(f).map(([k, v]) => [k, valor(v)]));
}

/** Lista todos os documentos de uma coleção (paginado). */
async function listar(caminho) {
  const docs = [];
  let pageToken;
  do {
    const url = new URL(`${BASE}/${caminho}`);
    url.searchParams.set('pageSize', '300');
    if (pageToken) url.searchParams.set('pageToken', pageToken);
    const r = await fetch(url, { headers: { Authorization: `Bearer ${await token()}` } });
    if (!r.ok) throw new Error(`${r.status} ao listar ${caminho}: ${await r.text()}`);
    const j = await r.json();
    for (const d of j.documents ?? []) docs.push({ id: d.name.split('/').pop(), ...campos(d.fields) });
    pageToken = j.nextPageToken;
  } while (pageToken);
  return docs;
}

const n = (v) => Number(v) || 0;

async function verificarEmpresa(empresaId) {
  const problemas = [];
  const raiz = `empresasClientes/${empresaId}`;
  const contratos = await listar(`${raiz}/contratos`);
  const nomeContrato = new Map(contratos.map((c) => [c.id, c.numero || c.id]));

  // 1 e 4: soma dos itens e negativos.
  for (const c of contratos) {
    const itens = await listar(`${raiz}/contratos/${c.id}/itens`);
    for (const d of itens) {
      const soma = n(d.quantidadeDisponivel) + n(d.quantidadeReservada) + n(d.quantidadeConsumida);
      if (soma !== n(d.quantidadeContratada)) {
        problemas.push(`SOMA     contrato ${nomeContrato.get(c.id)} item "${d.nome}" (${d.id}): disp ${n(d.quantidadeDisponivel)} + res ${n(d.quantidadeReservada)} + cons ${n(d.quantidadeConsumida)} = ${soma}, contratada ${n(d.quantidadeContratada)}`);
      }
      if (n(d.quantidadeReservada) < 0 || n(d.quantidadeDisponivel) < 0) {
        problemas.push(`NEGATIVO contrato ${nomeContrato.get(c.id)} item "${d.nome}" (${d.id}): disp ${n(d.quantidadeDisponivel)}, res ${n(d.quantidadeReservada)}`);
      }
    }
  }

  // 2: chamado finalizado com OS aprovada (reserva presa).
  const ordens = await listar(`${raiz}/ordensServico`);
  const osPorId = new Map(ordens.map((o) => [o.id, o]));
  const orcamentos = await listar(`${raiz}/orcamentos`);
  const orcPorOs = new Map();
  for (const o of orcamentos) {
    if (!orcPorOs.has(o.osId)) orcPorOs.set(o.osId, []);
    orcPorOs.get(o.osId).push(o);
  }

  const chamados = (await listar(`${raiz}/chamados`)).filter((c) => ['Encerrado', 'Cancelado'].includes(c.status));
  for (const d of chamados) {
    if (!d.ordemServicoId) continue;
    const osDoc = osPorId.get(d.ordemServicoId);
    if (!osDoc) continue;
    const orcs = orcPorOs.get(d.ordemServicoId) || [];
    const aprovado = orcs.find((o) => o.situacao === 'Aprovado');
    if (osDoc.situacao === 'Aprovada' && aprovado) {
      const qtd = (aprovado.itens ?? []).reduce((s, i) => s + n(i.quantidade), 0);
      problemas.push(`RESERVA-PRESA chamado ${d.numero} (${d.id}) ${d.status}, OS ${osDoc.numero} Aprovada, orçamento ${aprovado.id} com ${qtd} unidade(s) reservada(s): ${(aprovado.itens ?? []).map((i) => i.nome).join(', ')}`);
    }
    if (osDoc.situacao === 'Encerrada' && aprovado && d.status === 'Encerrado') {
      problemas.push(`CONFERIR chamado ${d.numero} (${d.id}) Encerrado com OS ${osDoc.numero} Encerrada e orçamento aprovado ${aprovado.id}: confirmar no log se houve "Executou a OS"`);
    }
  }

  // 3: mais de um orçamento por OS.
  for (const [osId, lista] of orcPorOs) {
    if (lista.length > 1) {
      const aprovados = lista.filter((o) => o.situacao === 'Aprovado').length;
      const osDoc = osPorId.get(osId);
      problemas.push(`MULTI-ORC OS ${osDoc?.numero || osId}: ${lista.length} orçamentos (${lista.map((o) => o.situacao).join(', ')})${aprovados > 1 ? ' — MAIS DE UM APROVADO' : ''}`);
    }
  }

  return { contratos: contratos.length, ordens: ordens.length, orcamentos: orcamentos.length, problemas };
}

async function main() {
  const empresas = await listar('empresasClientes');
  console.log(`Empresas: ${empresas.length}\n`);
  let total = 0;
  for (const emp of empresas) {
    const r = await verificarEmpresa(emp.id);
    console.log(`== ${emp.nome || emp.id} (${emp.id}) — ${r.contratos} contrato(s), ${r.ordens} OS, ${r.orcamentos} orçamento(s)`);
    if (!r.problemas.length) console.log('   sem inconsistências');
    for (const p of r.problemas) console.log('   ' + p);
    total += r.problemas.length;
    console.log('');
  }
  console.log(`Total de apontamentos: ${total}. Nada foi alterado.`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
