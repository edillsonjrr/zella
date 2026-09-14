import { randomUUID } from 'crypto';
import { onRequest, onCall, HttpsError } from 'firebase-functions/v2/https';
import { Timestamp } from 'firebase-admin/firestore';
import { db, colecao, empresaRef } from './admin';

const TTL_MS = 3 * 60 * 1000; // 3 minutos

type QrAlvoTipo = 'unidade' | 'bloco' | 'sala' | 'equipamento';

// Cada tipo de alvo mapeável vive numa coleção diferente do Firestore, mas
// todos guardam unidadeId — é o que a Cloud Function precisa pra travar a
// unidade do chamado, não importa o nível em que o QR foi colado.
const COLECAO_POR_TIPO: Record<QrAlvoTipo, string> = {
  unidade: 'unidades',
  bloco: 'blocos',
  sala: 'salas',
  equipamento: 'equipamentos'
};

// URL do frontend pra onde redirecionar depois de gerar o token. No
// emulator aponta pro `ng serve` local; em produção, pro Firebase Hosting.
//
// APP_URL permite apontar pra um domínio próprio sem editar e publicar a
// função de novo; sem a variável, cai no domínio padrão do Hosting.
function urlFrontend(): string {
  if (process.env.APP_URL) {
    return process.env.APP_URL.replace(/\/+$/, '');
  }

  return process.env.FUNCTIONS_EMULATOR === 'true'
    ? 'http://localhost:4200'
    : 'https://gestao-manutencao-app.web.app';
}

// Alguém escaneia o QR Code (QR aponta pra esta rota, não pro link final).
// Cada leitura gera um token novo com validade de 3 minutos e redireciona
// pro formulário de chamado. Se o link expirar, só escaneando de novo — o
// QR físico nunca muda, mas o link por trás dele sim.
//
// Aceita ?e=<empresaId>&tipo=unidade|bloco|sala|equipamento&id=... —
// qualquer um dos 4 níveis mapeáveis. A empresa vem do próprio QR Code:
// quem escaneou não tem login, então é o único lugar de onde ela pode sair.
export const abrirChamadoQr = onRequest(async (req, res) => {
  const empresaId = req.query['e'] as string | undefined;
  const tipo = req.query['tipo'] as QrAlvoTipo | undefined;
  const id = req.query['id'] as string | undefined;

  if (!empresaId || !tipo || !id || !COLECAO_POR_TIPO[tipo]) {
    res.status(400).send('empresa, tipo e id são obrigatórios.');
    return;
  }

  const empresa = await empresaRef(empresaId).get();
  if (!empresa.exists || empresa.data()?.['ativa'] === false) {
    res.status(404).send('Empresa não encontrada.');
    return;
  }

  const alvoSnap = await colecao(empresaId, COLECAO_POR_TIPO[tipo]).doc(id).get();
  if (!alvoSnap.exists) {
    res.status(404).send('Registro não encontrado.');
    return;
  }

  const alvoDados = alvoSnap.data()!;
  const unidadeId = tipo === 'unidade' ? id : (alvoDados['unidadeId'] as string | undefined);
  if (!unidadeId) {
    res.status(404).send('Registro sem unidade associada.');
    return;
  }

  // O nome da unidade entra no documento pra que o formulário consiga
  // mostrar onde o chamado vai cair. Quem escaneou é um convidado e não tem
  // permissão de ler a coleção de unidades.
  const unidadeNome =
    tipo === 'unidade'
      ? ((alvoDados['nome'] as string | undefined) ?? null)
      : (((await colecao(empresaId, 'unidades').doc(unidadeId).get()).data()?.['nome'] as string | undefined) ?? null);

  const token = randomUUID();
  const agora = Date.now();
  await db.collection('qrLinks').doc(token).set({
    empresaId,
    tipo,
    id,
    unidadeId,
    unidadeNome,
    nome: (alvoDados['nome'] as string | undefined) ?? null,
    criadoEm: Timestamp.fromMillis(agora),
    expiraEm: Timestamp.fromMillis(agora + TTL_MS)
  });

  res.redirect(302, `${urlFrontend()}/chamados/novo?qrToken=${token}`);
});

export interface QrTokenResolvido {
  empresaId: string;
  unidadeId: string;
  unidadeNome: string | null;
  tipo: QrAlvoTipo;
  nome?: string;
}

/**
 * Lê e valida um token de QR Code.
 *
 * É a única fonte da unidade de um chamado aberto por QR Code: a função de
 * criação chama isto em vez de aceitar o `unidadeId` que veio do cliente.
 * Sem isso, a trava de unidade existiria só na tela, e qualquer sessão
 * anônima poderia abrir chamado em qualquer unidade.
 *
 * O token não é consumido na leitura: ele vale pelos 3 minutos inteiros,
 * porque a mesma pessoa valida ao abrir o formulário e de novo ao enviar,
 * e um erro de rede no meio não pode invalidar o que ela digitou.
 */
export async function resolverQrToken(token: string): Promise<QrTokenResolvido> {
  if (!token) {
    throw new HttpsError('invalid-argument', 'Token ausente.');
  }

  const snap = await db.collection('qrLinks').doc(token).get();
  if (!snap.exists) {
    throw new HttpsError('not-found', 'Link inválido. Escaneie o QR Code novamente.');
  }

  const dados = snap.data()!;
  if (Date.now() > (dados.expiraEm as Timestamp).toMillis()) {
    throw new HttpsError('deadline-exceeded', 'Link expirado. Escaneie o QR Code novamente.');
  }

  return {
    empresaId: dados.empresaId as string,
    unidadeId: dados.unidadeId as string,
    unidadeNome: (dados.unidadeNome as string | null) ?? null,
    tipo: dados.tipo as QrAlvoTipo,
    nome: (dados.nome as string | null) ?? undefined
  };
}

// O formulário chama isso ao carregar com ?qrToken=... pra saber se ainda
// vale, qual unidade travar e, se o QR era de bloco/sala/equipamento, qual o
// nome pra pré-preencher o campo de equipamento. Sem `request.auth` de
// propósito — quem escaneou o QR ainda não fez login (fluxo de abertura sem
// cadastro).
export const validarQrToken = onCall<{ token: string }>(async (request) => {
  return resolverQrToken(request.data?.token);
});
