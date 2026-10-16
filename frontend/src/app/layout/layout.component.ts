import { Component, computed, effect, inject, untracked } from '@angular/core';
import { NgComponentOutlet } from '@angular/common';
import { RouterLink, RouterOutlet } from '@angular/router';
import { MatToolbarModule } from '@angular/material/toolbar';
import { MatButtonModule } from '@angular/material/button';
import { MatMenuModule } from '@angular/material/menu';
import { MatDividerModule } from '@angular/material/divider';
import { MatDialog } from '@angular/material/dialog';
import { RailComponent } from '../rail/rail.component';
import { alternarTema, temaEscuroAtivo, ThemeToggleComponent } from '../theme-toggle/theme-toggle.component';
import { IconComponent } from '../shared/icon/icon.component';
import { LogoComponent } from '../shared/logo/logo.component';
import { NotificacoesComponent } from '../shared/notificacoes/notificacoes.component';
import { BoasVindasComponent, PERFIS_COM_BOAS_VINDAS } from '../shared/boas-vindas/boas-vindas.component';
import { AuthService } from '../shared/auth.service';
import { DataService } from '../shared/data.service';
import { rotuloPerfil } from '../shared/rotulos';
import { PECAS_DO_LAYOUT } from '../shared/modo';
import type { PerfilEmpresa, Usuario } from '../shared/models';

// Cópia no navegador de que a pessoa já viu "O que você faz aqui": evita
// piscar a tela enquanto as preferências chegam do Firestore e segura o
// "uma vez só" mesmo se a gravação no Firestore falhar.
function chaveBoasVindas(u: Usuario): string {
  return `zella-boas-vindas-${u.empresaId}-${u.id}`;
}

function jaViuNoNavegador(u: Usuario): boolean {
  try {
    return localStorage.getItem(chaveBoasVindas(u)) === '1';
  } catch {
    return false;
  }
}

function guardarNoNavegador(u: Usuario): void {
  try {
    localStorage.setItem(chaveBoasVindas(u), '1');
  } catch {
    // Sem storage (aba privada): vale o que ficou no Firestore.
  }
}

@Component({
  selector: 'app-layout',
  imports: [
    NgComponentOutlet,
    RouterOutlet,
    RouterLink,
    MatToolbarModule,
    MatButtonModule,
    MatMenuModule,
    MatDividerModule,
    RailComponent,
    ThemeToggleComponent,
    LogoComponent,
    IconComponent,
    NotificacoesComponent
  ],
  templateUrl: './layout.component.html',
  styleUrl: './layout.component.scss'
})
export class LayoutComponent {
  private auth = inject(AuthService);
  private dataService = inject(DataService);
  private dialog = inject(MatDialog);

  usuarioLogado = this.auth.usuarioLogado;
  // Faixa da demonstração; fora do modo demo a lista é vazia (shared/modo.ts).
  readonly pecasDemo = PECAS_DO_LAYOUT;
  perfilRotulo = computed(() => rotuloPerfil(this.usuarioLogado().perfil));
  // Empresa de quem está logado. Para a prestadora e o técnico, a empresa
  // deles (a contratada) e o cliente atendido; antes aparecia só o nome do
  // cliente, como se fosse a empresa da pessoa.
  empresaRotulo = computed(() => {
    const u = this.usuarioLogado();
    if (u.empresaContratadaId && (u.perfil === 'gestor_contratado' || u.perfil === 'tecnico')) {
      const contratada = this.dataService.getEmpresaContratadaById(u.empresaContratadaId)?.nome;
      if (contratada) return u.empresaNome ? `${contratada} · atende ${u.empresaNome}` : contratada;
    }
    return u.empresaNome ?? '';
  });
  // Sessão anônima de quem escaneou um QR Code.
  convidado = computed(() => this.auth.usuarioFirebase()?.isAnonymous === true && !this.auth.estaAutenticado());

  // Primeira vez de cada perfil (Z2.8): abre "O que você faz aqui" uma vez,
  // depois que as preferências da pessoa chegaram e só se ela nunca fechou.
  private boasVindasMostradaPara = '';
  private readonly boasVindas = effect(() => {
    const usuario = this.usuarioLogado();
    const preferencias = this.dataService.preferencias();
    if (!usuario.empresaId || !PERFIS_COM_BOAS_VINDAS.includes(usuario.perfil as PerfilEmpresa)) return;
    if (preferencias === undefined || preferencias?.boasVindasEm) return;
    if (this.boasVindasMostradaPara === usuario.id || jaViuNoNavegador(usuario)) return;
    this.boasVindasMostradaPara = usuario.id;
    untracked(() => setTimeout(() => this.abrirBoasVindas(usuario)));
  });

  private abrirBoasVindas(usuario: Usuario): void {
    const ref = this.dialog.open(BoasVindasComponent, {
      data: usuario.perfil,
      panelClass: 'usuario-form-dialog',
      width: '480px',
      maxWidth: '95vw',
      maxHeight: '90vh',
      autoFocus: 'first-tabbable',
      ariaLabelledBy: 'boas-vindas-titulo'
    });
    // Fechar de qualquer jeito (botão, Esc, clique fora) conta como visto.
    ref.afterClosed().subscribe(() => {
      guardarNoNavegador(usuario);
      this.dataService.marcarBoasVindasVistas();
    });
  }

  readonly temaEscuro = temaEscuroAtivo;
  readonly alternarTema = alternarTema;

  sair(): void {
    this.auth.logout();
  }
}
