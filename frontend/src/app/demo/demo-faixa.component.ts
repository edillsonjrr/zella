import { Component, computed, effect, inject, untracked } from '@angular/core';
import { Router } from '@angular/router';
import { MatDialog } from '@angular/material/dialog';
import { MatMenuModule } from '@angular/material/menu';
import { IconComponent } from '../shared/icon/icon.component';
import { BoasVindasComponent } from '../shared/boas-vindas/boas-vindas.component';
import { DialogoService } from '../shared/dialogo/dialogo.service';
import { UiFeedbackService } from '../shared/ui-feedback.service';
import { AuthService } from '../shared/auth.service';
import { rotaInicial } from '../shared/permissoes';
import { banco } from './banco';
import { DemoCartaoComponent, type FechamentoCartao } from './demo-cartao.component';
import { PERFIS_DEMO, perfilDemoDoUsuario, type PerfilDemo } from './perfis';

/**
 * Faixa fixa no topo de toda tela interna da demonstração: avisa que os
 * dados são de exemplo, troca de perfil sem sair e volta aos dados de
 * exemplo. Também abre o cartão de boas-vindas na primeira vez de cada
 * perfil. O layout só a monta no modo demonstração (shared/modo.ts).
 */
@Component({
  selector: 'app-demo-faixa',
  imports: [MatMenuModule, IconComponent],
  template: `
    <div class="faixa" role="region" aria-label="Aviso da demonstração">
      <app-icon class="faixa-icone" name="info" aria-hidden="true"></app-icon>
      <p class="faixa-texto"><strong>Demonstração</strong><span class="faixa-texto-resto">: dados de exemplo, nada sai de verdade</span></p>
      <div class="faixa-acoes">
        @if (perfilAtual(); as perfil) {
          <button type="button" class="faixa-botao" (click)="abrirCartao(perfil)" aria-label="Dicas: o que tentar">
            <app-icon name="help" aria-hidden="true"></app-icon>
            <span class="faixa-rotulo-longo">O que tentar</span>
            <span class="faixa-rotulo-curto" aria-hidden="true">Dicas</span>
          </button>
        }
        <!-- Um nome só por botão, igual no computador, no celular e nas dicas. -->
        <button type="button" class="faixa-botao" [matMenuTriggerFor]="menuPerfis" aria-haspopup="menu">
          <app-icon name="group" aria-hidden="true"></app-icon>
          <span class="faixa-rotulo">Trocar perfil</span>
        </button>
        <button type="button" class="faixa-botao" (click)="voltarAoExemplo()" title="Volta aos dados de exemplo">
          <app-icon name="restart" aria-hidden="true"></app-icon>
          <span class="faixa-rotulo">Recomeçar</span>
        </button>
      </div>
    </div>

    <mat-menu #menuPerfis="matMenu" xPosition="before" class="demo-menu-perfis">
      @for (p of perfis; track p.chave) {
        <button mat-menu-item (click)="trocar(p)" [attr.aria-current]="p.usuarioId === usuarioId() ? 'true' : null">
          <span class="faixa-menu-item">
            <span><strong>{{ p.nome }}</strong>, {{ p.papel }}</span>
            @if (p.usuarioId === usuarioId()) {
              <app-icon name="check_circle" aria-label="perfil atual"></app-icon>
            }
          </span>
        </button>
      }
    </mat-menu>
  `,
  styles: `
    :host { display: block; flex-shrink: 0; }
    .faixa {
      display: flex; flex-wrap: wrap; align-items: center; gap: 6px 12px;
      min-height: 40px; padding: 6px var(--content-padding);
      background: var(--warning-50); color: var(--text-primary);
      border-bottom: 1px solid var(--warning-500);
      font-size: var(--its-t-pequeno);
    }
    .faixa-icone { color: var(--warning-600); flex-shrink: 0; }
    .faixa-texto { margin: 0; flex: 1 1 220px; line-height: 1.4; }
    .faixa-acoes { display: flex; flex-wrap: wrap; gap: 6px; }
    .faixa-botao {
      display: inline-flex; align-items: center; gap: 6px; min-height: 32px; padding: 4px 10px;
      border-radius: var(--button-radius); border: 1px solid var(--border-default); background: var(--bg-secondary);
      color: var(--text-primary); font: inherit; font-size: 0.8125rem; font-weight: 600; cursor: pointer;
      transition: border-color var(--transition-fast);
    }
    .faixa-botao:hover { border-color: var(--warning-600); }
    .faixa-botao:focus-visible { outline: 2px solid var(--primary-400); outline-offset: 2px; }
    .faixa-menu-item { display: inline-flex; align-items: center; gap: 8px; }
    .faixa-rotulo-curto { display: none; }
    /* Celular: uma linha só. Cada botão tem o ícone e, embaixo, um nome curto
       ("Dicas", "Trocar perfil", "Recomeçar"): antes dois deles eram só ícone. */
    @media (max-width: 760px) {
      .faixa { flex-wrap: nowrap; padding: 4px 8px 4px 16px; gap: 8px; }
      .faixa-icone, .faixa-texto-resto, .faixa-rotulo-longo { display: none; }
      .faixa-rotulo-curto, .faixa-rotulo { display: block; font-size: 0.75rem; font-weight: 600; line-height: 1.2; white-space: nowrap; }
      .faixa-texto { flex: 1 1 auto; min-width: 0; }
      .faixa-acoes { flex-wrap: nowrap; gap: 4px; }
      .faixa-botao { flex-direction: column; gap: 2px; min-height: 44px; min-width: 44px; justify-content: center; padding: 4px 8px; }
    }
  `
})
export class DemoFaixaComponent {
  private auth = inject(AuthService);
  private router = inject(Router);
  private dialog = inject(MatDialog);
  private dialogo = inject(DialogoService);
  private feedback = inject(UiFeedbackService);

  readonly perfis = PERFIS_DEMO;
  usuarioId = computed(() => (this.auth.estaAutenticado() ? this.auth.usuarioLogado().id : ''));
  perfilAtual = computed(() => perfilDemoDoUsuario(this.usuarioId()));

  // Primeira vez de cada perfil: abre o cartão uma vez; fechar conta como visto.
  private cartaoAbertoPara = '';
  private readonly primeiraVez = effect(() => {
    const perfil = this.perfilAtual();
    if (!perfil || banco.cartaoVisto(perfil.chave) || this.cartaoAbertoPara === perfil.chave) return;
    this.cartaoAbertoPara = perfil.chave;
    untracked(() => setTimeout(() => this.abrirCartao(perfil)));
  });

  abrirCartao(perfil: PerfilDemo): void {
    const ref = this.dialog.open<DemoCartaoComponent, PerfilDemo, FechamentoCartao>(DemoCartaoComponent, {
      data: perfil,
      panelClass: 'usuario-form-dialog',
      width: '500px',
      maxWidth: '95vw',
      maxHeight: '90vh',
      autoFocus: 'first-tabbable',
      ariaLabelledBy: 'demo-cartao-titulo'
    });
    ref.afterClosed().subscribe(resultado => {
      banco.marcarCartaoVisto(perfil.chave);
      if (resultado === 'perfil') this.abrirOQueFaz(perfil);
    });
  }

  private abrirOQueFaz(perfil: PerfilDemo): void {
    this.dialog.open(BoasVindasComponent, {
      data: perfil.perfil,
      panelClass: 'usuario-form-dialog',
      width: '480px',
      maxWidth: '95vw',
      maxHeight: '90vh',
      autoFocus: 'first-tabbable',
      ariaLabelledBy: 'boas-vindas-titulo'
    });
  }

  trocar(perfil: PerfilDemo): void {
    this.dialog.closeAll();
    if (!this.auth.entrarComo(perfil.usuarioId)) {
      this.feedback.erro(`${perfil.nome} não está mais no cadastro desta demonstração. Use "Recomeçar" na faixa do topo para trazer de volta.`);
      return;
    }
    this.router.navigateByUrl(rotaInicial(perfil.perfil));
    this.feedback.announce(`Agora você é ${perfil.nome}, ${perfil.papel}.`);
  }

  async voltarAoExemplo(): Promise<void> {
    const confirmou = await this.dialogo.confirmar(
      'Recomeçar com os dados de exemplo?',
      'O que você fez nesta demonstração será apagado, e os chamados, contratos e saldos voltam ao início. Você continua com o mesmo perfil.',
      { confirmar: 'Recomeçar', perigo: true }
    );
    if (!confirmou) return;
    this.dialog.closeAll();
    banco.voltarAoExemplo();
    // A sessão guarda uma cópia do cadastro (o nome pode ter mudado): relê.
    const id = this.usuarioId();
    if (id) this.auth.entrarComo(id);
    this.router.navigateByUrl(id ? rotaInicial(this.auth.perfil) : this.router.url);
    this.feedback.sucesso('Pronto: os dados de exemplo estão de volta.');
  }
}
