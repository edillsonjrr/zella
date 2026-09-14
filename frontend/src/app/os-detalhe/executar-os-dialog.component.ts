import { Component, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MAT_DIALOG_DATA, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { IconComponent } from '../shared/icon/icon.component';
import { FlowButtonComponent } from '../shared/flow-button/flow-button.component';
import type { Orcamento } from '../shared/models';

export interface ExecutarOsDialogData {
  numeroOS: string;
  orcamento: Orcamento;
}

export interface ExecutarOsResultado {
  itens: { itemContratoId: string; quantidadeExecutada: number }[];
  observacao: string;
}

// Uma linha por item de contrato: o orçamento pode repetir o item, e a
// execução é por item, não por linha.
interface LinhaExecucao {
  itemContratoId: string;
  nome: string;
  orcado: number;
  executado: number;
}

/**
 * Execução da OS com quantidades reais. O padrão é executar tudo o que foi
 * orçado; o que a pessoa reduzir volta para o saldo disponível do contrato.
 */
@Component({
  selector: 'app-executar-os-dialog',
  imports: [FormsModule, MatDialogModule, MatFormFieldModule, MatInputModule, IconComponent, FlowButtonComponent],
  template: `
    <div class="exec">
      <div class="exec-cabecalho">
        <div class="exec-icone"><app-icon name="build" aria-hidden="true"></app-icon></div>
        <div>
          <h2 class="exec-titulo">Executar OS {{ data.numeroOS }}</h2>
          <p class="exec-sub">Informe o que foi realmente executado. A diferença volta para o saldo do contrato.</p>
        </div>
      </div>

      <div class="exec-linhas">
        @for (l of linhas; track l.itemContratoId) {
          <div class="exec-linha" [class.exec-linha--parcial]="l.executado < l.orcado">
            <div class="exec-info">
              <strong>{{ l.nome }}</strong>
              <span class="exec-meta">Orçado: {{ l.orcado }}</span>
            </div>
            <mat-form-field appearance="outline" class="exec-qtd">
              <mat-label>Executado</mat-label>
              <input matInput type="number" min="0" [max]="l.orcado" step="1" [(ngModel)]="l.executado" [name]="'exec-' + l.itemContratoId" />
              @if (problema(l)) {
                <mat-hint class="hint-erro">{{ problema(l) }}</mat-hint>
              } @else if (l.executado < l.orcado) {
                <mat-hint>{{ l.orcado - l.executado }} volta(m) ao contrato</mat-hint>
              }
            </mat-form-field>
          </div>
        }
      </div>

      <mat-form-field appearance="outline" class="exec-obs">
        <mat-label>Observação (opcional)</mat-label>
        <input matInput [(ngModel)]="observacao" name="observacao" maxlength="500" placeholder="Ex: 2 lâmpadas não precisaram ser trocadas" />
      </mat-form-field>

      @if (erro) {
        <p class="exec-erro" role="alert"><app-icon name="warning" aria-hidden="true"></app-icon> {{ erro }}</p>
      }

      <div class="exec-acoes">
        <app-flow-button variant="secondary" type="button" (click)="ref.close()">Voltar</app-flow-button>
        <app-flow-button type="button" [disabled]="!valido" (click)="confirmar()">
          <app-icon class="btn-icon" name="build" aria-hidden="true"></app-icon> {{ parcial ? 'Executar parcialmente' : 'Executar tudo' }}
        </app-flow-button>
      </div>
    </div>
  `,
  styles: `
    .exec { padding: 20px 22px 18px; background: var(--bg-tertiary); color: var(--text-primary); border-radius: var(--card-radius); }
    .exec-cabecalho { display: flex; gap: 12px; align-items: flex-start; margin-bottom: 14px; }
    .exec-icone { width: 40px; height: 40px; border-radius: 12px; background: var(--primary-50); color: var(--primary-500); display: flex; align-items: center; justify-content: center; flex-shrink: 0; }
    .exec-titulo { margin: 0; font-size: 1rem; font-weight: 600; }
    .exec-sub { margin: 2px 0 0; font-size: 0.8rem; color: var(--text-secondary); }
    .exec-linhas { display: flex; flex-direction: column; gap: 8px; margin-bottom: 8px; }
    .exec-linha { display: flex; justify-content: space-between; align-items: flex-start; gap: 12px; padding: 8px 12px; border: 1px solid var(--border-default); border-radius: var(--button-radius); }
    .exec-linha--parcial { border-color: var(--primary-500); background: var(--primary-50); }
    .exec-info { display: flex; flex-direction: column; gap: 2px; padding-top: 8px; min-width: 0; }
    .exec-info strong { font-size: 0.875rem; overflow-wrap: anywhere; }
    .exec-meta { font-size: 0.75rem; color: var(--text-tertiary); }
    .exec-qtd { flex: 0 0 150px; max-width: 150px; }
    .exec-obs { width: 100%; }
    .hint-erro { color: var(--danger-500); }
    .exec-erro { display: flex; gap: 8px; align-items: flex-start; margin: 0 0 8px; padding: 10px 12px; border-radius: var(--button-radius); background: var(--danger-50, var(--bg-elevated)); color: var(--danger-500); font-size: 0.8rem; }
    .exec-acoes { display: flex; justify-content: flex-end; gap: 8px; margin-top: 6px; }
    @media (max-width: 480px) { .exec-linha { flex-direction: column; align-items: stretch; } .exec-qtd { max-width: none; } }
  `
})
export class ExecutarOsDialogComponent {
  readonly ref = inject(MatDialogRef<ExecutarOsDialogComponent>);
  readonly data: ExecutarOsDialogData = inject(MAT_DIALOG_DATA);

  linhas: LinhaExecucao[];
  observacao = '';
  erro = '';

  constructor() {
    const porItem = new Map<string, LinhaExecucao>();
    for (const i of this.data.orcamento.itens) {
      const atual = porItem.get(i.itemContratoId);
      if (atual) atual.orcado += i.quantidade;
      else porItem.set(i.itemContratoId, { itemContratoId: i.itemContratoId, nome: i.nome, orcado: i.quantidade, executado: i.quantidade });
    }
    this.linhas = [...porItem.values()].map(l => ({ ...l, executado: l.orcado }));
  }

  problema(l: LinhaExecucao): string {
    const v = Number(l.executado);
    if (!Number.isFinite(v) || v < 0) return 'Informe um número maior ou igual a zero';
    if (v > l.orcado) return `Máximo ${l.orcado} (orçado)`;
    return '';
  }

  get valido(): boolean {
    return this.linhas.every(l => !this.problema(l));
  }

  get parcial(): boolean {
    return this.linhas.some(l => Number(l.executado) < l.orcado);
  }

  confirmar(): void {
    if (!this.valido) return;
    if (this.linhas.every(l => Number(l.executado) === 0)) {
      this.erro = 'Nada foi executado. Se o serviço não vai acontecer, cancele o chamado em vez de executar.';
      return;
    }
    const resultado: ExecutarOsResultado = {
      itens: this.linhas.map(l => ({ itemContratoId: l.itemContratoId, quantidadeExecutada: Number(l.executado) })),
      observacao: this.observacao.trim()
    };
    this.ref.close(resultado);
  }
}
