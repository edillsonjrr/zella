import { banco } from '../demo/banco';

/**
 * Demonstração: aqui não há Firebase. Nada de initializeApp, nada de rede.
 * A configuração `demo` do angular.json troca firebase.ts por este arquivo,
 * e os serviços que falavam com o Firebase (auth, dados, log, arquivos,
 * plataforma) têm a sua versão `.demo.ts` em memória.
 *
 * Só sobra o que o resto do app ainda lê daqui: quem está na sessão (o
 * guard de rota olha `auth.currentUser` para decidir se abre a sessão do QR
 * Code) e a chave do emulador, sempre desligada.
 */
export const auth = {
  get currentUser(): { uid: string; email: string | null; isAnonymous: boolean } | null {
    const id = banco.sessao;
    if (!id) return null;
    if (id === 'convidado') return { uid: 'visitante-qr', email: null, isAnonymous: true };
    return { uid: id, email: banco.ler().usuarios.find(u => u.id === id)?.email ?? null, isAnonymous: false };
  }
};

export const emulando = false;
