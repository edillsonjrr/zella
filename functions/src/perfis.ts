import { onDocumentWritten } from 'firebase-functions/v2/firestore';
import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { getAuth } from 'firebase-admin/auth';
import { FieldValue } from 'firebase-admin/firestore';
import { randomBytes } from 'node:crypto';
import { db, EMPRESAS, PERFIS, PERFIL_ADMIN, colecao, empresaRef, exigirAdminPlataforma, type Perfil } from './admin';

export { PERFIS, type Perfil };

/**
 * Quem administra a plataforma. É uma lista no código, e não uma coleção,
 * de propósito: assim não existe tela nem documento que, editado, promova
 * alguém a administrador. Mudar isso é um deploy.
 */
const ADMINS_PLATAFORMA = ['edilsonjuniormvf@gmail.com', 'edilsonjr.its@gmail.com'];

/**
 * O que vai dentro do token do Firebase Auth como custom claim.
 *
 * As Security Rules só enxergam `request.auth.token`, nunca uma coleção.
 * Então o perfil e a empresa precisam morar no token: é o que permite a
 * regra dizer "só gestor lê logs" e "só lê a subárvore da própria empresa".
 * `usuarioId` é o id do documento em `usuarios`, pra que o app não precise
 * casar por e-mail depois do login.
 */
export interface ClaimsPerfil {
  perfil: Perfil;
  empresaId: string;
  usuarioId: string;
  unidadeId?: string;
  empresaContratadaId?: string;
  // "Admin com empresa": administrador da plataforma que também tem cadastro
  // em uma empresa (a de demonstração). Entra nela como gestor comum e, por
  // esta marca, continua enxergando a tela de Empresas. Ver adminPlataforma()
  // nas Security Rules e exigirAdminPlataforma() em admin.ts.
  adminPlataforma?: true;
}

function ehAdminPlataforma(email: string): boolean {
  return ADMINS_PLATAFORMA.includes(email.toLowerCase());
}

function claimsDe(empresaId: string, id: string, usuario: FirebaseFirestore.DocumentData): ClaimsPerfil | null {
  const perfil = usuario['perfil'];
  if (!PERFIS.includes(perfil)) return null;

  const claims: ClaimsPerfil = { perfil, empresaId, usuarioId: id };
  if (typeof usuario['unidadeId'] === 'string') claims.unidadeId = usuario['unidadeId'];
  if (typeof usuario['empresaContratadaId'] === 'string') claims.empresaContratadaId = usuario['empresaContratadaId'];
  // O trigger e a callable gravam o mesmo claim; a marca de admin precisa
  // sobreviver aos dois, senão um refresh de token no meio da sessão a
  // apagaria.
  if (typeof usuario['email'] === 'string' && ehAdminPlataforma(usuario['email'])) claims.adminPlataforma = true;
  return claims;
}

function naoEncontrado(e: unknown): boolean {
  return (e as { code?: string }).code === 'auth/user-not-found';
}

/**
 * Garante que exista uma conta no Auth pra este e-mail e devolve o uid.
 *
 * É o convite: quem é cadastrado pelo gestor ganha a conta na hora, mesmo
 * antes de entrar pela primeira vez. A senha inicial é aleatória e nunca
 * sai daqui — a pessoa define a dela pelo "Definir ou recuperar senha" da
 * tela de login, que manda o e-mail padrão do Firebase. Precisa ter senha
 * (e não só e-mail) porque é isso que liga o provedor de senha à conta;
 * sem ele o e-mail de redefinição não sai. Quem preferir o Google entra
 * normalmente: mesmo e-mail, mesma conta.
 */
async function garantirContaAuth(email: string, nome: string | undefined): Promise<string> {
  try {
    return (await getAuth().getUserByEmail(email)).uid;
  } catch (e: unknown) {
    if (!naoEncontrado(e)) throw e;
  }
  const criado = await getAuth().createUser({
    email,
    displayName: nome,
    password: randomBytes(32).toString('base64url')
  });
  return criado.uid;
}

// Grava (ou apaga, com null) o claim no usuário do Auth que tem este e-mail.
// Com claim de verdade, cria a conta se ela ainda não existe (convite). Pra
// apagar, conta que não existe já está do jeito que deveria.
async function aplicarClaims(email: string, claims: ClaimsPerfil | null, nome?: string): Promise<void> {
  if (claims) {
    const uid = await garantirContaAuth(email, nome);
    await getAuth().setCustomUserClaims(uid, claims);
    return;
  }
  try {
    const user = await getAuth().getUserByEmail(email);
    await getAuth().setCustomUserClaims(user.uid, null);
  } catch (e: unknown) {
    if (!naoEncontrado(e)) throw e;
  }
}

/**
 * Mantém o claim em dia com o cadastro: editar o perfil de alguém em
 * `usuarios` reflete no token dela no próximo refresh (até 1h, ou na hora se
 * o app forçar). Excluir o cadastro apaga o claim, e a pessoa perde o acesso
 * mesmo que a conta do Auth continue existindo.
 */
export const sincronizarClaimsUsuario = onDocumentWritten(`${EMPRESAS}/{empresaId}/usuarios/{id}`, async (event) => {
  const antes = event.data?.before.data();
  const depois = event.data?.after.data();
  const { empresaId, id } = event.params;

  // Trocou o e-mail: a conta antiga do Auth não representa mais ninguém.
  if (antes?.['email'] && antes['email'] !== depois?.['email']) {
    await aplicarClaims(antes['email'], null);
  }

  if (depois?.['email']) {
    await aplicarClaims(depois['email'], claimsDe(empresaId, id, depois), depois['nome']);
  }
});

export interface UsuarioAutenticado {
  id: string;
  nome: string;
  email: string;
  perfil: Perfil | typeof PERFIL_ADMIN;
  empresaId?: string;
  empresaNome?: string;
  unidadeId?: string;
  empresaContratadaId?: string;
  adminPlataforma?: boolean;
}

interface CadastroEncontrado {
  empresaId: string;
  id: string;
  dados: FirebaseFirestore.DocumentData;
}

// Procura o cadastro pelo e-mail em todas as empresas. Um e-mail pertence a
// uma empresa só: se aparecer em duas, vale a primeira, e o gestor da outra
// vai ver que o cadastro não "pega".
async function buscarCadastroPorEmail(email: string): Promise<CadastroEncontrado | null> {
  const snap = await db.collectionGroup('usuarios').where('email', '==', email).limit(1).get();
  if (snap.empty) return null;
  const doc = snap.docs[0];
  const empresa = doc.ref.parent.parent;
  if (!empresa || empresa.parent.id !== EMPRESAS) return null;
  return { empresaId: empresa.id, id: doc.id, dados: doc.data() };
}

/**
 * Chamada pelo app logo depois do login.
 *
 * Procura o cadastro pelo e-mail do token, grava o claim e devolve o
 * usuário pro app montar a sessão. É o que cobre o primeiro login pelo
 * Google de quem foi cadastrado antes de existir no Auth. Sem cadastro, o
 * claim é apagado e volta `usuario: null` — o app trata como "sem acesso" e
 * encerra a sessão. Empresa desativada conta como sem acesso.
 */
export const carregarPerfil = onCall<void, Promise<{ usuario: UsuarioAutenticado | null }>>(async (request) => {
  if (!request.auth) {
    throw new HttpsError('unauthenticated', 'Faça login.');
  }
  if (request.auth.token.firebase?.sign_in_provider === 'anonymous') {
    throw new HttpsError('permission-denied', 'Sessão de convidado não tem perfil.');
  }

  const email = request.auth.token.email?.toLowerCase();
  if (!email) {
    throw new HttpsError('failed-precondition', 'A conta não tem e-mail.');
  }

  const admin = ehAdminPlataforma(email);
  const cadastro = await buscarCadastroPorEmail(email);
  const claims = cadastro ? claimsDe(cadastro.empresaId, cadastro.id, cadastro.dados) : null;
  const empresa = cadastro ? (await empresaRef(cadastro.empresaId).get()).data() : undefined;
  const cadastroValido = !!cadastro && !!claims && !!empresa && empresa['ativa'] !== false;

  // Administrador sem cadastro em empresa: só a tela de Empresas, como
  // sempre. Com cadastro (a empresa de demonstração), cai no caso geral
  // abaixo e entra nela como gestor, levando a marca adminPlataforma.
  if (admin && !cadastroValido) {
    await getAuth().setCustomUserClaims(request.auth.uid, { perfil: PERFIL_ADMIN });
    return {
      usuario: {
        id: request.auth.uid,
        nome: request.auth.token.name ?? 'Administrador',
        email,
        perfil: PERFIL_ADMIN,
        adminPlataforma: true
      }
    };
  }

  if (!cadastro || !claims || !empresa || !cadastroValido) {
    await getAuth().setCustomUserClaims(request.auth.uid, null);
    return { usuario: null };
  }

  await getAuth().setCustomUserClaims(request.auth.uid, claims);
  return {
    usuario: {
      id: cadastro.id,
      nome: (cadastro.dados['nome'] as string) ?? email,
      email,
      perfil: claims.perfil,
      empresaId: claims.empresaId,
      empresaNome: empresa['nome'] as string,
      unidadeId: claims.unidadeId,
      empresaContratadaId: claims.empresaContratadaId,
      adminPlataforma: claims.adminPlataforma === true
    }
  };
});

/**
 * Chamada, sem login, pelo "Definir ou recuperar senha" da tela de login.
 *
 * Cobre quem foi cadastrado antes de o convite existir: se o e-mail está em
 * `usuarios` mas ainda não tem conta no Auth, cria a conta (com o claim)
 * pra que o e-mail de redefinição de senha, disparado pelo app em seguida,
 * tenha pra onde ir. A resposta é sempre a mesma, com cadastro ou sem, pra
 * não servir de teste de "esse e-mail existe no sistema?".
 */
export const prepararAcessoPorSenha = onCall<{ email: string }, Promise<{ ok: true }>>(async (request) => {
  const email = typeof request.data?.email === 'string' ? request.data.email.trim().toLowerCase() : '';
  if (!email) {
    throw new HttpsError('invalid-argument', 'Informe o e-mail.');
  }

  const cadastro = await buscarCadastroPorEmail(email);
  if (cadastro) {
    const claims = claimsDe(cadastro.empresaId, cadastro.id, cadastro.dados);
    if (claims) {
      await aplicarClaims(email, claims, cadastro.dados['nome']);
    }
  }
  return { ok: true };
});

export interface CriarEmpresaInput {
  nome: string;
  gestorNome: string;
  gestorEmail: string;
}

/**
 * Tela gerencial da plataforma: cria a empresa cliente e o primeiro gestor
 * dela. O gestor entra no `usuarios` da empresa, e daí o trigger acima faz o
 * resto — cria a conta no Auth e grava o claim. A pessoa recebe acesso pelo
 * "Definir ou recuperar senha" ou entrando com o Google no mesmo e-mail.
 */
export const criarEmpresa = onCall<CriarEmpresaInput, Promise<{ id: string }>>(async (request) => {
  exigirAdminPlataforma(request);

  const nome = request.data?.nome?.trim();
  const gestorNome = request.data?.gestorNome?.trim();
  const gestorEmail = request.data?.gestorEmail?.trim().toLowerCase();
  if (!nome || !gestorNome || !gestorEmail || !gestorEmail.includes('@')) {
    throw new HttpsError('invalid-argument', 'Informe o nome da empresa e o nome e e-mail do gestor.');
  }

  if (await buscarCadastroPorEmail(gestorEmail)) {
    throw new HttpsError('already-exists', `O e-mail ${gestorEmail} já é usuário de outra empresa.`);
  }

  const ref = db.collection(EMPRESAS).doc();
  const gestorRef = colecao(ref.id, 'usuarios').doc();

  const batch = db.batch();
  batch.set(ref, {
    id: ref.id,
    nome,
    ativa: true,
    criadaEm: FieldValue.serverTimestamp(),
    gestorEmail
  });
  batch.set(gestorRef, {
    id: gestorRef.id,
    nome: gestorNome,
    email: gestorEmail,
    perfil: 'gestor'
  });
  await batch.commit();

  return { id: ref.id };
});
