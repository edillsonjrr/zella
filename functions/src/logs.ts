import type { CallableRequest } from 'firebase-functions/v2/https';
import { colecao } from './admin';

export type AlvoLog =
  | 'unidade'
  | 'bloco'
  | 'sala'
  | 'equipamento'
  | 'usuario'
  | 'contrato'
  | 'itemContrato'
  | 'planoManutencao'
  | 'chamado'
  | 'ordemServico'
  | 'orcamento';

export type OperacaoLog = 'criar' | 'editar' | 'excluir' | 'transicao' | 'importar';

export interface AutorLog {
  uid: string;
  nome: string;
  email: string;
}

interface RegistroLog {
  alvo: AlvoLog;
  operacao: OperacaoLog;
  descricao: string;
  alvoId: string;
  alvoRotulo: string;
  // Id do registro "dono", quando o alvo pertence a outro: o orçamento
  // aponta pra OS, pra que o histórico da OS mostre o que aconteceu com o
  // orçamento dela. Sem valor, cai no próprio alvoId.
  alvoPaiId?: string;
  detalhes?: Record<string, unknown>;
}

/**
 * Identifica quem está fazendo a ação, a partir do token do callable.
 *
 * O nome vem do cadastro em `usuarios` da empresa, localizado pelo
 * `usuarioId` do claim. Roda ANTES de abrir a transação de propósito: o
 * corpo de uma transação pode ser reexecutado em caso de contenção, e essa
 * leitura não precisa repetir junto.
 */
export async function resolverAutor(
  request: CallableRequest<unknown>,
  empresaId: string,
  // Nome a usar quando a sessão não tem cadastro nem e-mail — o caso do
  // convidado que abriu um chamado pelo QR Code e só digitou o próprio nome.
  nomeAlternativo?: string
): Promise<AutorLog> {
  const uid = request.auth?.uid ?? 'desconhecido';
  const email = (request.auth?.token?.email as string | undefined) ?? '';
  const usuarioId = request.auth?.token?.['usuarioId'] as string | undefined;

  let nome = email || nomeAlternativo || 'Desconhecido';
  if (usuarioId) {
    const cadastro = await colecao(empresaId, 'usuarios').doc(usuarioId).get();
    nome = (cadastro.data()?.['nome'] as string | undefined) ?? nome;
  }

  return { uid, nome, email };
}

/**
 * Grava a entrada de log dentro da MESMA transação da ação.
 *
 * É isso que dá confiabilidade ao histórico das ações de fluxo: ou a ação e
 * o log entram juntos, ou nenhum dos dois entra. Um log gravado depois, fora
 * da transação, poderia registrar algo que acabou revertido — ou sumir se a
 * escrita falhasse logo após a ação ter sido efetivada.
 *
 * A autoria vem do token do callable, nunca de algo que o cliente mandou no
 * corpo da chamada.
 */
export function registrarLog(
  tx: FirebaseFirestore.Transaction,
  empresaId: string,
  autor: AutorLog,
  registro: RegistroLog
): void {
  const ref = colecao(empresaId, 'logs').doc();

  tx.set(ref, {
    id: ref.id,
    acao: `${registro.alvo}.${registro.operacao}`,
    alvo: registro.alvo,
    operacao: registro.operacao,
    descricao: registro.descricao,
    data: new Date().toISOString(),
    usuarioUid: autor.uid,
    usuarioNome: autor.nome,
    usuarioEmail: autor.email,
    alvoId: registro.alvoId,
    alvoRotulo: registro.alvoRotulo,
    alvoPaiId: registro.alvoPaiId ?? registro.alvoId,
    detalhes: registro.detalhes ?? null,
    origem: 'backend'
  });
}
