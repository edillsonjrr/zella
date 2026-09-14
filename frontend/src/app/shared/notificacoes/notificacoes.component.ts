import { Component, computed, inject } from '@angular/core';
import { DatePipe } from '@angular/common';
import { Router } from '@angular/router';
import { MatButtonModule } from '@angular/material/button';
import { MatMenuModule } from '@angular/material/menu';
import { MatBadgeModule } from '@angular/material/badge';
import { IconComponent } from '../icon/icon.component';
import { DataService } from '../data.service';
import { AuthService } from '../auth.service';
import type { Notificacao } from '../models';

/**
 * Sino do topo: notificações internas endereçadas à pessoa ou ao perfil
 * dela (ver functions/src/notificacoes.ts). Clicar abre o link e marca
 * como lida. "Marcar todas" limpa o contador.
 */
@Component({
  selector: 'app-notificacoes',
  imports: [DatePipe, MatButtonModule, MatMenuModule, MatBadgeModule, IconComponent],
  template: `
    <button
      mat-icon-button
      [matMenuTriggerFor]="menu"
      class="sino"
      [matBadge]="naoLidas().length || null"
      matBadgeColor="warn"
      matBadgeSize="small"
      [attr.aria-label]="naoLidas().length ? naoLidas().length + ' notificações não lidas' : 'Notificações'"
    >
      <app-icon name="notifications"></app-icon>
    </button>

    <mat-menu #menu="matMenu" class="notificacoes-menu" xPosition="before">
      <div class="notificacoes-cabecalho" (click)="$event.stopPropagation()">
        <strong>Notificações</strong>
        @if (naoLidas().length) {
          <button type="button" class="notificacoes-limpar" (click)="marcarTodas()">Marcar todas como lidas</button>
        }
      </div>
      @if (!lista().length) {
        <p class="notificacoes-vazio">Nada por aqui.</p>
      }
      @for (n of lista(); track n.id) {
        <button mat-menu-item class="notificacao" [class.notificacao--nova]="!lida(n)" (click)="abrir(n)">
          <span class="notificacao-ponto" aria-hidden="true"></span>
          <span class="notificacao-corpo">
            <span class="notificacao-titulo">{{ n.titulo }}</span>
            <span class="notificacao-texto">{{ n.texto }}</span>
            <span class="notificacao-data">{{ n.data | date:'dd/MM HH:mm' }}</span>
          </span>
        </button>
      }
    </mat-menu>
  `,
  styles: `
    :host { display: inline-flex; }
    .sino { color: var(--text-secondary); }
    .notificacoes-cabecalho {
      display: flex; align-items: center; justify-content: space-between; gap: 12px;
      padding: 10px 16px 6px; font-size: 0.8rem;
    }
    .notificacoes-limpar {
      background: none; border: none; padding: 0; color: var(--primary-400); cursor: pointer;
      font: inherit; font-size: 0.75rem;
    }
    .notificacoes-vazio { margin: 0; padding: 12px 16px 16px; color: var(--text-tertiary); font-size: 0.8rem; }
    .notificacao {
      height: auto !important; min-height: 0; padding: 8px 16px 8px 12px !important; line-height: 1.3;
      display: flex; align-items: flex-start; gap: 8px; max-width: 360px; white-space: normal;
    }
    .notificacao-ponto { width: 8px; height: 8px; border-radius: 50%; margin-top: 6px; flex-shrink: 0; background: transparent; }
    .notificacao--nova .notificacao-ponto { background: var(--primary-500); }
    .notificacao-corpo { display: flex; flex-direction: column; gap: 2px; }
    .notificacao-titulo { font-weight: 600; font-size: 0.8rem; }
    .notificacao--nova .notificacao-titulo { color: var(--text-primary); }
    .notificacao-texto { font-size: 0.75rem; color: var(--text-secondary); }
    .notificacao-data { font-size: 0.7rem; color: var(--text-tertiary); }
  `
})
export class NotificacoesComponent {
  private dataService = inject(DataService);
  private auth = inject(AuthService);
  private router = inject(Router);

  private meuId = computed(() => this.auth.usuarioLogado().id);

  // Mais recentes primeiro, até 30.
  lista = computed(() =>
    [...this.dataService.notificacoes()].sort((a, b) => b.data.localeCompare(a.data)).slice(0, 30)
  );
  naoLidas = computed(() => this.lista().filter(n => !this.lida(n)));

  lida(n: Notificacao): boolean {
    return n.lidaPor?.includes(this.meuId()) ?? false;
  }

  abrir(n: Notificacao): void {
    if (!this.lida(n)) this.dataService.marcarNotificacaoLida(n.id);
    if (n.link) this.router.navigateByUrl(n.link);
  }

  marcarTodas(): void {
    for (const n of this.naoLidas()) this.dataService.marcarNotificacaoLida(n.id);
  }
}
