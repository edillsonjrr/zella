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
// Usa a credencial do Firebase CLI local, como scripts/gestor-demo.js.
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

const n = (v) => Number(v) || 0;

async function verificarEmpresa(emp) {
  const problemas = [];
  const contratos = await emp.ref.collection('contratos').get();
  const nomeContrato = new Map(contratos.docs.map((c) => [c.id, c.data().numero || c.id]));

  // 1 e 4: soma dos itens e negativos.
  for (const c of contratos.docs) {
    const itens = await c.ref.collection('itens').get();
    for (const i of itens.docs) {
      const d = i.data();
      const soma = n(d.quantidadeDisponivel) + n(d.quantidadeReservada) + n(d.quantidadeConsumida);
      if (soma !== n(d.quantidadeContratada)) {
        problemas.push(`SOMA    contrato ${nomeContrato.get(c.id)} item "${d.nome}" (${i.id}): disp ${n(d.quantidadeDisponivel)} + res ${n(d.quantidadeReservada)} + cons ${n(d.quantidadeConsumida)} = ${soma}, contratada ${n(d.quantidadeContratada)}`);
      }
      if (n(d.quantidadeReservada) < 0 || n(d.quantidadeDisponivel) < 0) {
        problemas.push(`NEGATIVO contrato ${nomeContrato.get(c.id)} item "${d.nome}" (${i.id}): disp ${n(d.quantidadeDisponivel)}, res ${n(d.quantidadeReservada)}`);
      }
    }
  }

  // 2: chamado finalizado com OS aprovada (reserva presa).
  const ordens = await emp.ref.collection('ordensServico').get();
  const osPorId = new Map(ordens.docs.map((o) => [o.id, o.data()]));
  const orcamentos = await emp.ref.collection('orcamentos').get();
  const orcPorOs = new Map();
  for (const o of orcamentos.docs) {
    const d = o.data();
    if (!orcPorOs.has(d.osId)) orcPorOs.set(d.osId, []);
    orcPorOs.get(d.osId).push({ id: o.id, ...d });
  }

  const chamados = await emp.ref.collection('chamados').where('status', 'in', ['Encerrado', 'Cancelado']).get();
  for (const ch of chamados.docs) {
    const d = ch.data();
    if (!d.ordemServicoId) continue;
    const osDoc = osPorId.get(d.ordemServicoId);
    if (!osDoc) continue;
    const orcs = orcPorOs.get(d.ordemServicoId) || [];
    const aprovado = orcs.find((o) => o.situacao === 'Aprovado');
    if (osDoc.situacao === 'Aprovada' && aprovado) {
      const qtd = aprovado.itens.reduce((s, i) => s + n(i.quantidade), 0);
      problemas.push(`RESERVA-PRESA chamado ${d.numero} (${ch.id}) ${d.status}, OS ${osDoc.numero} Aprovada, orçamento ${aprovado.id} com ${qtd} unidade(s) reservada(s) em ${orcs.length ? aprovado.itens.map((i) => i.nome).join(', ') : ''}`);
    }
    // Encerrada sem executar: a OS ficou "Encerrada" direto de "Aprovada".
    if (osDoc.situacao === 'Encerrada' && aprovado && d.status === 'Encerrado') {
      // Não dá pra saber pelo estado final se passou por Executada; o log
      // diz. Só marca pra conferência manual.
      problemas.push(`CONFERIR chamado ${d.numero} (${ch.id}) Encerrado com OS ${osDoc.numero} Encerrada e orçamento aprovado ${aprovado.id}: confirmar no log se houve "Executou a OS"`);
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

  return { contratos: contratos.size, ordens: ordens.size, orcamentos: orcamentos.size, problemas };
}

async function main() {
  const empresas = await db.collection('empresasClientes').get();
  console.log(`Empresas: ${empresas.size}\n`);
  let total = 0;
  for (const emp of empresas.docs) {
    const r = await verificarEmpresa(emp);
    console.log(`== ${emp.data().nome || emp.id} (${emp.id}) — ${r.contratos} contrato(s), ${r.ordens} OS, ${r.orcamentos} orçamento(s)`);
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
