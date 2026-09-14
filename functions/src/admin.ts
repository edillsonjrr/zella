import { initializeApp } from 'firebase-admin/app';
import { getFirestore, type CollectionReference, type DocumentReference } from 'firebase-admin/firestore';
import { HttpsError, type CallableRequest } from 'firebase-functions/v2/https';

initializeApp({ storageBucket: 'gestao-manutencao-app.firebasestorage.app' });

export const db = getFirestore();
// Campos opcionais (numeroSerie, tecnicoId, orcamentoId...) chegam como
// undefined quando não informados — sem isso o Firestore rejeita o write.
db.settings({ ignoreUndefinedProperties: true });

/**
 * Cada cliente da plataforma é um documento em `empresasClientes`, e todas
 * as coleções de negócio (unidades, chamados, contratos...) vivem DENTRO
 * dele. O isolamento entre clientes vem daí: o `empresaId` está no token de
 * quem entrou, as Security Rules só abrem a subárvore com o mesmo id, e as
 * functions montam todo caminho a partir do token — nunca do corpo da
 * chamada.
 */
export const EMPRESAS = 'empresasClientes';

export function empresaRef(empresaId: string): DocumentReference {
  return db.collection(EMPRESAS).doc(empresaId);
}

export function colecao(empresaId: string, nome: string): CollectionReference {
  return empresaRef(empresaId).collection(nome);
}

export const PERFIS = ['cliente', 'gestor', 'gestor_contratado', 'tecnico'] as const;
export type Perfil = (typeof PERFIS)[number];

// Quem opera a plataforma: não pertence a empresa nenhuma, só cria e
// acompanha empresas. Vive fora de `PERFIS` de propósito — nenhuma regra de
// negócio deve aceitá-lo como usuário de empresa.
export const PERFIL_ADMIN = 'admin_plataforma';

export interface ContextoEmpresa {
  empresaId: string;
  perfil: Perfil;
  usuarioId: string;
  unidadeId?: string;
  empresaContratadaId?: string;
}

/**
 * Lê do token quem está chamando e em qual empresa, e recusa quem não tem o
 * perfil exigido. É a checagem que a interface esconde atrás de botões, mas
 * que só vale de verdade aqui: qualquer um com login consegue chamar uma
 * function direto pelo SDK.
 */
export function exigirPerfil(request: CallableRequest<unknown>, permitidos: readonly Perfil[]): ContextoEmpresa {
  if (!request.auth) {
    throw new HttpsError('unauthenticated', 'Faça login.');
  }
  const token = request.auth.token as Record<string, unknown>;
  const perfil = token['perfil'];
  const empresaId = token['empresaId'];
  const usuarioId = token['usuarioId'];

  if (typeof perfil !== 'string' || !(PERFIS as readonly string[]).includes(perfil)) {
    throw new HttpsError('permission-denied', 'Sua conta não tem perfil de acesso.');
  }
  if (typeof empresaId !== 'string' || !empresaId || typeof usuarioId !== 'string') {
    throw new HttpsError('permission-denied', 'Sua conta não está ligada a uma empresa.');
  }
  if (!permitidos.includes(perfil as Perfil)) {
    throw new HttpsError('permission-denied', 'Seu perfil não pode fazer esta ação.');
  }

  return {
    empresaId,
    perfil: perfil as Perfil,
    usuarioId,
    unidadeId: typeof token['unidadeId'] === 'string' ? token['unidadeId'] : undefined,
    empresaContratadaId: typeof token['empresaContratadaId'] === 'string' ? token['empresaContratadaId'] : undefined
  };
}

export function exigirAdminPlataforma(request: CallableRequest<unknown>): void {
  if (!request.auth) {
    throw new HttpsError('unauthenticated', 'Faça login.');
  }
  // Admin puro (sem empresa) ou admin com empresa (gestor da demonstração
  // com a marca adminPlataforma no token — ver perfis.ts).
  const token = request.auth.token as Record<string, unknown>;
  if (token['perfil'] !== PERFIL_ADMIN && token['adminPlataforma'] !== true) {
    throw new HttpsError('permission-denied', 'Só o administrador da plataforma pode fazer isto.');
  }
}

/**
 * Gestor contratado e técnico só mexem no que é da empresa contratada
 * deles. O gestor (do cliente) e o cliente não têm essa restrição aqui —
 * o cliente nem chega às ações que chamam isto.
 */
export function exigirMesmaContratada(ctx: ContextoEmpresa, dono: { empresaContratadaId?: string | null } | undefined): void {
  if (ctx.perfil !== 'gestor_contratado' && ctx.perfil !== 'tecnico') return;
  if (!ctx.empresaContratadaId || dono?.empresaContratadaId !== ctx.empresaContratadaId) {
    throw new HttpsError('permission-denied', 'Este registro pertence a outra empresa contratada.');
  }
}

/**
 * Técnico só orça e executa a OS designada a ele. OS sem técnico designado
 * fica aberta a qualquer técnico da contratada; o gestor contratado pode
 * sempre (e pode redesignar pela função atribuirTecnicoOS).
 */
export function exigirTecnicoDesignado(ctx: ContextoEmpresa, os: { tecnicoId?: string | null } | undefined): void {
  if (ctx.perfil !== 'tecnico') return;
  if (os?.tecnicoId && os.tecnicoId !== ctx.usuarioId) {
    throw new HttpsError('permission-denied', 'Esta OS está designada a outro técnico.');
  }
}
