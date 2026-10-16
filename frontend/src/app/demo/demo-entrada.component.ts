import { Component, OnInit, inject, signal } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { IconComponent } from '../shared/icon/icon.component';
import { AuthService } from '../shared/auth.service';
import { rotaInicial } from '../shared/permissoes';
import { PERFIS_DEMO, type PerfilDemo } from './perfis';

/**
 * Entrada da demonstração, no lugar do e-mail e senha: a pessoa escolhe
 * quem quer ser. Um agente de teste, que não pode digitar senha, entra com
 * um clique ou direto pela URL (/login?como=carla).
 */
@Component({
  selector: 'app-demo-entrada',
  imports: [IconComponent],
  template: `
    <div class="entrada">
      <span class="entrada-selo">Demonstração</span>
      <h2 class="entrada-titulo" id="entrada-titulo">Entrar como:</h2>
      <p class="entrada-texto">Sem senha. Cada pessoa vê o sistema do jeito que veria de verdade.</p>
      <ul class="entrada-lista" aria-labelledby="entrada-titulo">
        @for (p of perfis; track p.chave) {
          <li>
            <button type="button" class="entrada-pessoa" (click)="entrar(p)">
              <span class="entrada-avatar" aria-hidden="true">{{ p.nome.charAt(0) }}</span>
              <span class="entrada-nome"><strong>{{ p.nome }}</strong>, {{ p.papel }}</span>
              <app-icon class="entrada-seta" name="arrow_forward" aria-hidden="true"></app-icon>
            </button>
          </li>
        }
      </ul>
      @if (erro()) {
        <p class="entrada-erro" role="alert">{{ erro() }}</p>
      }
      <p class="entrada-rodape">
        Dados de exemplo, nada sai de verdade: nenhum e-mail é enviado e nada é cobrado. O que você fizer fica salvo só neste navegador.
      </p>
    </div>
  `,
  styles: `
    .entrada { display: flex; flex-direction: column; gap: 10px; }
    .entrada-selo {
      align-self: flex-start; padding: 2px 10px; border-radius: 999px;
      background: var(--warning-50); color: var(--warning-600); border: 1px solid var(--warning-500);
      font-size: 0.75rem; font-weight: 600;
    }
    .entrada-titulo { margin: 4px 0 0; font-size: 1.0625rem; font-weight: 700; color: var(--text-primary); }
    .entrada-texto { margin: 0; font-size: 0.8125rem; line-height: 1.45; color: var(--text-secondary); }
    .entrada-lista { list-style: none; margin: 4px 0 0; padding: 0; display: flex; flex-direction: column; gap: 8px; }
    .entrada-pessoa {
      width: 100%; min-height: 52px; display: flex; align-items: center; gap: 12px; padding: 8px 14px;
      border-radius: var(--button-radius); border: 1px solid var(--border-default); background: var(--bg-secondary);
      color: var(--text-primary); font: inherit; font-size: 0.875rem; text-align: left; cursor: pointer;
      transition: border-color var(--transition-fast), background-color var(--transition-fast);
    }
    .entrada-pessoa:hover { border-color: var(--primary-500); background: var(--bg-row-hover); }
    .entrada-pessoa:focus-visible { outline: 2px solid var(--primary-400); outline-offset: 2px; }
    .entrada-avatar {
      width: 32px; height: 32px; flex-shrink: 0; border-radius: 50%; display: flex; align-items: center; justify-content: center;
      background: var(--primary-500); color: var(--primary-contrast); font-weight: 600;
    }
    .entrada-nome { flex: 1; line-height: 1.35; }
    .entrada-seta { color: var(--text-tertiary); flex-shrink: 0; }
    .entrada-erro { margin: 0; padding: 8px 12px; border-radius: var(--button-radius); background: var(--danger-50); color: var(--danger-600); font-size: 0.8125rem; }
    .entrada-rodape { margin: 4px 0 0; font-size: 0.75rem; line-height: 1.45; color: var(--text-tertiary); }
  `
})
export class DemoEntradaComponent implements OnInit {
  private auth = inject(AuthService);
  private router = inject(Router);
  private route = inject(ActivatedRoute);

  readonly perfis = PERFIS_DEMO;
  erro = signal('');

  ngOnInit(): void {
    const como = this.route.snapshot.queryParamMap.get('como')?.toLowerCase();
    const perfil = PERFIS_DEMO.find(p => p.chave === como);
    if (perfil) this.entrar(perfil);
  }

  entrar(perfil: PerfilDemo): void {
    this.erro.set('');
    if (!this.auth.entrarComo(perfil.usuarioId)) {
      this.erro.set(`${perfil.nome} não está mais no cadastro desta demonstração. Entre com outra pessoa e use "Recomeçar" na faixa do topo.`);
      return;
    }
    this.router.navigateByUrl(rotaInicial(perfil.perfil));
  }
}
