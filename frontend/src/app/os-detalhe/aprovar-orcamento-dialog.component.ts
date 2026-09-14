import { Component, inject } from '@angular/core';
import { CurrencyPipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { MAT_DIALOG_DATA, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { IconComponent } from '../shared/icon/icon.component';
import { FlowButtonComponent } from '../shared/flow-button/flow-button.component';
import type { Orcamento } from '../shared/models';

export interface AprovarOrcamentoDialogData {
  numeroOS: string;
  orcamento: Orcamento;
}

export interface AprovarOrcamentoResultado {
  ajustes: { itemContratoId: string; quantidade: number }[];
  observacao: string;
}

interface LinhaAprovacao {
  itemContratoId: string;
  nome: string;
  precoUnitario: number;
  orcado: number;
  aprovado: number;
}

/**
 * Aprovação do orçamento com ajuste de quantidades pelo gestor. Só para
 * baixo: quantidade acima do orçado exige novo orçamento da contratada.
 * Zero remove o item do orçamento aprovado.
 */
@Component({
  selector: 'app-aprovar-orcamento-dialog',
  imports: [FormsModule, CurrencyPipe, MatDialogModule, MatFormFieldModule, MatInputModule, IconComponent, FlowButtonComponent],
  template: `
    <div class="apr">
      <div class="apr-cabecalho">
        <div class="apr-icone"><app-icon name="check_circle" aria-hidden="true"></app-icon></div>
        <div>
          <h2 class="apr-titulo">Aprovar orçamento da OS {{ data.numeroOS }}</h2>
          <p class="apr-sub">Aprovar reserva o saldo do contrato. Se precisar, reduza quantidades antes.</p>
        </div>
      </div>

      <div class="apr-linhas">
        @for (l of linhas; track l.itemContratoId) {
          <div class="apr-linha" [class.apr-linha--ajustada]="l.aprovado !== l.orcado">
            <div class="apr-info">
              <strong>{{ l.nome }}</strong>
              <span class="apr-meta">Orçado: {{ l.orcado }} × {{ l.precoUnitario | currency:'BRL' }}</span>
            </div>
            <mat-form-field appearance="outline" class="apr-qtd">
              <mat-label>Aprovar</mat-label>
              <input matInput type="number" min="0" [max]="l.orcado" step="1" [(ngModel)]="l.aprovado" [name]="'apr-' + l.itemContratoId" />
              @if (problema(l)) {
                <mat-hint class="hint-erro">{{ problema(l) }}</mat-hint>
              } @else if (l.aprovado === 0) {
                <mat-hint>Item removido</mat-hint>
              } @else if (l.aprovado !== l.orcado) {
                <mat-hint>{{ l.aprovado - l.orcado }}</mat-hint>
              }
            </mat-form-field>
          </div>
        }
      </div>

      <div class="apr-total">
        <span>Total aprovado</span>
        <strong>{{ total | currency:'BRL' }}</strong>
      </div>

      @if (ajustado) {
        <mat-form-field appearance="outline" class="apr-obs">
          <mat-label>Motivo do ajuste</mat-label>
          <input matInput [(ngModel)]="observacao" name="observacao" maxlength="500" placeholder="Ex: só 4 lâmpadas estão queimadas" />
        </mat-form-field>
      }

      @if (erro) {
        <p class="apr-erro" role="alert"><app-icon name="warning" aria-hidden="true"></app-icon> {{ erro }}</p>
      }

      <div class="apr-acoes">
        <app-flow-button variant="secondary" type="button" (click)="ref.close()">Voltar</app-flow-button>
        <app-flow-button type="button" [disabled]="!valido" (click)="confirmar()">
          <app-icon class="btn-icon" name="check_circle" aria-hidden="true"></app-icon> {{ ajustado ? 'Aprovar com ajustes' : 'Aprovar' }}
        </app-flow-button>
      </div>
    </div>
  `,
  styles: `
    .apr { padding: 20px 22px 18px; background: var(--bg-tertiary); color: var(--text-primary); border-radius: var(--card-radius); }
    .apr-cabecalho { display: flex; gap: 12px; align-items: flex-start; margin-bottom: 14px; }
    .apr-icone { width: 40px; height: 40px; border-radius: 12px; background: var(--primary-50); color: var(--primary-500); display: flex; align-items: center; justify-content: center; flex-shrink: 0; }
    .apr-titulo { margin: 0; font-size: 1rem; font-weight: 600; }
    .apr-sub { margin: 2px 0 0; font-size: 0.8rem; color: var(--text-secondary); }
    .apr-linhas { display: flex; flex-direction: column; gap: 8px; }
    .apr-linha { display: flex; justify-content: space-between; align-items: flex-start; gap: 12px; padding: 8px 12px; border: 1px solid var(--border-default); border-radius: var(--button-radius); }
    .apr-linha--ajustada { border-color: var(--primary-500); background: var(--primary-50); }
    .apr-info { display: flex; flex-direction: column; gap: 2px; padding-top: 8px; min-width: 0; }
    .apr-info strong { font-size: 0.875rem; overflow-wrap: anywhere; }
    .apr-meta { font-size: 0.75rem; color: var(--text-tertiary); }
    .apr-qtd { flex: 0 0 150px; max-width: 150px; }
    .apr-total { display: flex; justify-content: space-between; align-items: center; margin: 10px 0; padding: 10px 12px; border-radius: var(--button-radius); background: var(--bg-elevated); font-size: 0.875rem; }
    .apr-obs { width: 100%; }
    .hint-erro { color: var(--danger-500); }
    .apr-erro { display: flex; gap: 8px; align-items: flex-start; margin: 0 0 8px; padding: 10px 12px; border-radius: var(--button-radius); background: var(--danger-50, var(--bg-elevated)); color: var(--danger-500); font-size: 0.8rem; }
    .apr-acoes { display: flex; justify-content: flex-end; gap: 8px; margin-top: 6px; }
    @media (max-width: 480px) { .apr-linha { flex-direction: column; align-items: stretch; } .apr-qtd { max-width: none; } }
  `
})
export class AprovarOrcamentoDialogComponent {
  readonly ref = inject(MatDialogRef<AprovarOrcamentoDialogComponent>);
  readonly data: AprovarOrcamentoDialogData = inject(MAT_DIALOG_DATA);

  linhas: LinhaAprovacao[];
  observacao = '';
  erro = '';

  constructor() {
    const porItem = new Map<string, LinhaAprovacao>();
    for (const i of this.data.orcamento.itens) {
      const atual = porItem.get(i.itemContratoId);
      if (atual) atual.orcado += i.quantidade;
      else porItem.set(i.itemContratoId, { itemContratoId: i.itemContratoId, nome: i.nome, precoUnitario: i.precoUnitario, orcado: i.quantidade, aprovado: i.quantidade });
    }
    this.linhas = [...porItem.values()].map(l => ({ ...l, aprovado: l.orcado }));
  }

  problema(l: LinhaAprovacao): string {
    const v = Number(l.aprovado);
    if (!Number.isFinite(v) || v < 0) return 'Informe um número maior ou igual a zero';
    if (v > l.orcado) return `Máximo ${l.orcado}: acima disso peça novo orçamento`;
    return '';
  }

  get valido(): boolean {
    return this.linhas.every(l => !this.problema(l)) && this.linhas.some(l => Number(l.aprovado) > 0);
  }

  get ajustado(): boolean {
    return this.linhas.some(l => Number(l.aprovado) !== l.orcado);
  }

  get total(): number {
    return this.linhas.reduce((s, l) => s + Number(l.aprovado) * l.precoUnitario, 0);
  }

  confirmar(): void {
    if (!this.valido) return;
    if (this.ajustado && !this.observacao.trim()) {
      this.erro = 'Informe o motivo do ajuste: a contratada vai ver o que mudou.';
      return;
    }
    const resultado: AprovarOrcamentoResultado = {
      ajustes: this.linhas.filter(l => Number(l.aprovado) !== l.orcado).map(l => ({ itemContratoId: l.itemContratoId, quantidade: Number(l.aprovado) })),
      observacao: this.observacao.trim()
    };
    this.ref.close(resultado);
  }
}
