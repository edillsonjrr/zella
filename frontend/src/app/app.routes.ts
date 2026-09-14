import { Routes } from '@angular/router';
import { DashboardComponent } from './dashboard/dashboard.component';
import { acessoGuard } from './shared/auth.guard';

// Toda rota interna passa pelo mesmo guard: ele exige sessão e confere o
// perfil contra o mapa em shared/permissoes.ts. O guard fica nos filhos, não
// na rota-casca: o Angular resolve os guards do caminho inteiro antes de
// montar qualquer componente, então o layout não chega a aparecer pra quem
// foi barrado, e a casca (path vazio) não tem perfil próprio pra conferir.
export const routes: Routes = [
  { path: 'login', loadComponent: () => import('./login/login.component').then(m => m.LoginComponent) },
  {
    path: '',
    loadComponent: () => import('./layout/layout.component').then(m => m.LayoutComponent),
    children: [
      { path: '', redirectTo: 'dashboard', pathMatch: 'full' },
      { path: 'dashboard', canActivate: [acessoGuard], component: DashboardComponent },
      { path: 'contratos', canActivate: [acessoGuard], loadComponent: () => import('./contratos/contratos.component').then(m => m.ContratosComponent) },
      { path: 'contratos/importar', canActivate: [acessoGuard], loadComponent: () => import('./importar-contratos/importar-contratos.component').then(m => m.ImportarContratosComponent) },
      { path: 'chamados/novo', canActivate: [acessoGuard], loadComponent: () => import('./novo-chamado/novo-chamado.component').then(m => m.NovoChamadoComponent) },
      { path: 'ordens-servico', canActivate: [acessoGuard], loadComponent: () => import('./ordens-servico/ordens-servico.component').then(m => m.OrdensServicoComponent) },
      { path: 'ordens-servico/nova', canActivate: [acessoGuard], loadComponent: () => import('./nova-os/nova-os.component').then(m => m.NovaOsComponent) },
      { path: 'painel-saldo', canActivate: [acessoGuard], loadComponent: () => import('./painel-saldo/painel-saldo.component').then(m => m.PainelSaldoComponent) },
      { path: 'painel-gerencial', canActivate: [acessoGuard], loadComponent: () => import('./painel-gerencial/painel-gerencial.component').then(m => m.PainelGerencialComponent) },
      { path: 'unidades', canActivate: [acessoGuard], loadComponent: () => import('./unidades/unidades.component').then(m => m.UnidadesComponent) },
      { path: 'qrcodes', canActivate: [acessoGuard], loadComponent: () => import('./qrcodes/qrcodes.component').then(m => m.QrcodesComponent) },
      { path: 'usuarios', canActivate: [acessoGuard], loadComponent: () => import('./usuarios/usuarios.component').then(m => m.UsuariosComponent) },
      { path: 'preventiva', canActivate: [acessoGuard], loadComponent: () => import('./preventiva/preventiva.component').then(m => m.PreventivaComponent) },
      { path: 'logs', canActivate: [acessoGuard], loadComponent: () => import('./logs/logs.component').then(m => m.LogsComponent) },
      { path: 'empresas', canActivate: [acessoGuard], loadComponent: () => import('./empresas/empresas.component').then(m => m.EmpresasComponent) },
      { path: 'contratadas', canActivate: [acessoGuard], loadComponent: () => import('./contratadas/contratadas.component').then(m => m.ContratadasComponent) },
      { path: 'minha-conta', canActivate: [acessoGuard], loadComponent: () => import('./minha-conta/minha-conta.component').then(m => m.MinhaContaComponent) }
    ]
  },
  { path: '**', redirectTo: 'login' }
];
