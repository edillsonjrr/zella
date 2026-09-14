import { Transaction } from 'firebase-admin/firestore';
import { colecao } from './admin';

// Números sequenciais (CH-2026-0001, OS-2026-0001, ORC-2026-0001) vêm de um
// contador em contadores/{prefixo}-{ano} da empresa, incrementado dentro da
// mesma transação da operação — evita a race condition de gerar o número a
// partir de um `.length`/count de documentos. Cada empresa tem a própria
// numeração, que é o que o cliente espera ver.
export async function proximoNumero(tx: Transaction, empresaId: string, prefixo: 'CH' | 'OS' | 'ORC'): Promise<string> {
  const ano = new Date().getFullYear();
  const ref = colecao(empresaId, 'contadores').doc(`${prefixo}-${ano}`);
  const snap = await tx.get(ref);
  const atual = snap.exists ? (snap.data()!.valor as number) : 0;
  const proximo = atual + 1;
  tx.set(ref, { valor: proximo }, { merge: true });
  return `${prefixo}-${ano}-${String(proximo).padStart(4, '0')}`;
}
