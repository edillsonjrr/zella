import { Component, inject } from '@angular/core';
import { MAT_DIALOG_DATA, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { IconComponent } from '../shared/icon/icon.component';
import { FlowButtonComponent } from '../shared/flow-button/flow-button.component';
import { DataService } from '../shared/data.service';
import type { PerfilDemo } from './perfis';

/** O que o cartão devolve ao fechar: 'perfil' pede o "O que você faz aqui". */
export type FechamentoCartao = 'comecar' | 'perfil' | undefined;

/**
 * Boas-vindas da demonstração: quem você é e o que tentar. Abre na primeira
 * vez de cada perfil e de novo pelo "O que tentar" da faixa.
 */
@Component({
  selector: 'app-demo-cartao',
  imports: [MatDialogModule, IconComponent, FlowButtonComponent],
  template: `
    <div class="cartao">
      <div class="cartao-cabecalho">
        <div class="cartao-icone"><app-icon name="waving_hand" aria-hidden="true"></app-icon></div>
        <div>
          <h2 class="cartao-titulo" id="demo-cartao-titulo">Esta é uma demonstração</h2>
          <p class="cartao-quem">{{ perfil.quem }}</p>
        </div>
      </div>
      <h3 class="cartao-subtitulo">O que tentar</h3>
      <ol class="cartao-passos">
        @for (passo of passos; track $index) {
          <li>{{ passo }}</li>
        }
      </ol>
      <p class="cartao-nota">
        Os dados são de exemplo e nada sai de verdade. O que você fizer fica salvo neste navegador; para recomeçar, use
        "Recomeçar" na faixa do topo. Para ver o sistema por outra pessoa, use "Trocar perfil".
      </p>
      <div class="cartao-acoes">
        <app-flow-button variant="secondary" (click)="ref.close('perfil')">O que este perfil faz</app-flow-button>
        <app-flow-button (click)="ref.close('comecar')">Começar</app-flow-button>
      </div>
    </div>
  `,
  styles: `
    .cartao { padding: 22px 22px 18px; background: var(--bg-tertiary); color: var(--text-primary); border-radius: var(--card-radius); }
    .cartao-cabecalho { display: flex; gap: 12px; align-items: flex-start; margin-bottom: 14px; }
    .cartao-icone {
      width: 44px; height: 44px; border-radius: 12px; background: var(--primary-50); color: var(--primary-500);
      display: flex; align-items: center; justify-content: center; font-size: 22px; flex-shrink: 0;
    }
    .cartao-titulo { margin: 0; font-size: 1.125rem; font-weight: 700; color: var(--text-primary); }
    .cartao-quem { margin: 4px 0 0; font-size: 0.875rem; line-height: 1.45; color: var(--text-secondary); }
    .cartao-subtitulo { margin: 0 0 6px; font-size: 0.8125rem; font-weight: 700; color: var(--text-primary); }
    .cartao-passos { margin: 0 0 14px; padding-left: 20px; display: flex; flex-direction: column; gap: 6px; font-size: 0.875rem; line-height: 1.45; color: var(--text-secondary); }
    .cartao-nota { margin: 0 0 16px; font-size: 0.75rem; line-height: 1.5; color: var(--text-tertiary); }
    .cartao-acoes { display: flex; flex-wrap: wrap; justify-content: flex-end; gap: 8px; }
    @media (max-width: 480px) { .cartao-acoes app-flow-button { width: 100%; } }
  `
})
export class DemoCartaoComponent {
  readonly ref = inject(MatDialogRef<DemoCartaoComponent, FechamentoCartao>);
  readonly perfil: PerfilDemo = inject(MAT_DIALOG_DATA);
  private readonly dados = inject(DataService);
  // "{ch:ch1}" e "{os:os1}" viram o número de verdade nos dados de exemplo.
  readonly passos = this.perfil.tentar.map(passo =>
    passo.replace(/\{(ch|os):([\w-]+)\}/g, (_, tipo: string, id: string) =>
      (tipo === 'ch' ? this.dados.getChamadoById(id)?.numero : this.dados.getOSById(id)?.numero) ?? (tipo === 'ch' ? 'o chamado' : 'a OS')
    )
  );
}
