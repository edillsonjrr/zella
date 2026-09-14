import { Component, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MAT_DIALOG_DATA, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { IconComponent } from '../icon/icon.component';
import { FlowButtonComponent } from '../flow-button/flow-button.component';

export interface ConfirmacaoDialogData {
  titulo: string;
  mensagem?: string;
  // Texto do botão que confirma. Padrão "Confirmar".
  confirmar?: string;
  // Botão de confirmação em vermelho (excluir, cancelar chamado).
  perigo?: boolean;
  // Quando presente, o diálogo mostra um campo de texto com este rótulo e
  // devolve o que foi digitado (string) em vez de `true`.
  campo?: { rotulo: string; opcional?: boolean; maxlength?: number };
}

/**
 * Substitui `confirm()` e `prompt()` nativos, que travam a aba e ficam fora
 * do tema. Fecha com `false` (cancelou), `true` (confirmou) ou a string
 * digitada quando há `campo`.
 */
@Component({
  selector: 'app-confirmacao-dialog',
  imports: [FormsModule, MatDialogModule, MatButtonModule, MatFormFieldModule, MatInputModule, IconComponent, FlowButtonComponent],
  template: `
    <div class="confirmacao">
      <div class="confirmacao-cabecalho">
        <div class="confirmacao-icone" [class.confirmacao-icone--perigo]="data.perigo">
          <app-icon [name]="data.perigo ? 'warning' : 'help'" aria-hidden="true"></app-icon>
        </div>
        <h2 class="confirmacao-titulo">{{ data.titulo }}</h2>
      </div>

      @if (data.mensagem) {
        <p class="confirmacao-mensagem">{{ data.mensagem }}</p>
      }

      @if (data.campo; as campo) {
        <mat-form-field appearance="outline" class="confirmacao-campo">
          <mat-label>{{ campo.rotulo }}</mat-label>
          <input matInput [(ngModel)]="valor" name="valor" [maxlength]="campo.maxlength ?? 300" cdkFocusInitial />
          @if (campo.opcional) {
            <mat-hint>Opcional</mat-hint>
          }
        </mat-form-field>
      }

      <div class="confirmacao-acoes">
        <app-flow-button variant="secondary" type="button" (click)="ref.close(false)">Voltar</app-flow-button>
        @if (data.perigo) {
          <button mat-flat-button color="warn" type="button" class="confirmacao-perigo" [disabled]="!podeConfirmar" (click)="confirmar()">
            {{ data.confirmar ?? 'Confirmar' }}
          </button>
        } @else {
          <app-flow-button type="button" [disabled]="!podeConfirmar" (click)="confirmar()">{{ data.confirmar ?? 'Confirmar' }}</app-flow-button>
        }
      </div>
    </div>
  `,
  styles: `
    .confirmacao {
      padding: 20px 22px 18px;
      max-width: 440px;
      background: var(--bg-tertiary);
      color: var(--text-primary);
      border-radius: var(--card-radius);
    }
    .confirmacao-cabecalho { display: flex; align-items: center; gap: 12px; margin-bottom: 10px; }
    .confirmacao-icone {
      width: 40px; height: 40px; border-radius: 12px; display: flex; align-items: center; justify-content: center;
      background: var(--primary-50); color: var(--primary-500); flex-shrink: 0;
    }
    .confirmacao-icone--perigo { background: var(--danger-50, var(--bg-elevated)); color: var(--danger-500); }
    .confirmacao-titulo { margin: 0; font-size: 1rem; font-weight: 600; }
    .confirmacao-mensagem { margin: 0 0 12px; color: var(--text-secondary); font-size: 0.875rem; line-height: 1.45; }
    .confirmacao-campo { width: 100%; }
    .confirmacao-acoes { display: flex; justify-content: flex-end; gap: 8px; margin-top: 14px; }
    .confirmacao-perigo { height: 40px; font-weight: 600; }
  `
})
export class ConfirmacaoDialogComponent {
  readonly ref = inject(MatDialogRef<ConfirmacaoDialogComponent>);
  readonly data: ConfirmacaoDialogData = inject(MAT_DIALOG_DATA);

  valor = '';

  get podeConfirmar(): boolean {
    if (!this.data.campo || this.data.campo.opcional) return true;
    return this.valor.trim().length > 0;
  }

  confirmar(): void {
    this.ref.close(this.data.campo ? this.valor.trim() : true);
  }
}
