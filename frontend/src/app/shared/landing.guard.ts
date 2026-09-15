import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { AuthService } from './auth.service';
import { rotaInicial } from './permissoes';

/**
 * Site institucional em "/": só pra quem não tem sessão. Quem já está logado
 * vai direto pra própria tela inicial (dashboard, empresas etc.).
 */
export const landingGuard: CanActivateFn = async () => {
  const auth = inject(AuthService);
  const router = inject(Router);
  await auth.pronto;
  return auth.estaAutenticado() ? router.parseUrl(rotaInicial(auth.perfil)) : true;
};
