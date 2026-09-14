import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { auth as firebaseAuth } from './firebase';
import { AuthService } from './auth.service';
import { podeAcessar, rotaInicial } from './permissoes';

/**
 * Guard único de todas as rotas internas: exige sessão e perfil autorizado
 * para a rota, conforme o mapa em `permissoes.ts`.
 *
 * É async porque o Firebase Auth restaura a sessão depois do primeiro
 * render — decidir antes disso jogaria pra tela de login quem já estava
 * logado. `auth.pronto` resolve na primeira resposta do onAuthStateChanged.
 *
 * Quem não tem sessão nenhuma vai pro login. Quem tem sessão mas não tem
 * perfil pra rota vai pro seu ponto de partida, que para o convidado do QR
 * Code é a própria tela de novo chamado — mandá-lo pro dashboard só o
 * devolveria pra cá num laço.
 */
export const acessoGuard: CanActivateFn = async (route) => {
  const authService = inject(AuthService);
  const router = inject(Router);

  await authService.pronto;

  // `route.routeConfig.path` é a rota declarada ('ordens-servico/nova'), que
  // é a chave do mapa de permissões — diferente de state.url, que traz query
  // string e prefixos.
  const caminho = route.routeConfig?.path ?? '';

  // Quem acabou de escanear o QR Code chega aqui sem sessão nenhuma. A
  // sessão anônima nasce no guard, e não dentro do formulário, porque sem
  // ela o próprio guard barraria a entrada antes de o formulário existir.
  // Só a rota de chamado, e só com token na URL, abre essa porta.
  if (
    caminho === 'chamados/novo' &&
    route.queryParamMap.get('qrToken') &&
    !firebaseAuth.currentUser
  ) {
    try {
      await authService.entrarComoConvidado();
    } catch {
      return router.parseUrl('/login');
    }
  }

  const convidado = authService.isConvidado();
  if (!authService.estaAutenticado() && !convidado) {
    return router.parseUrl('/login');
  }

  const { perfil, adminPlataforma } = authService.usuarioLogado();
  if (podeAcessar(perfil, caminho, adminPlataforma)) {
    return true;
  }

  return router.parseUrl(rotaInicial(perfil));
};
