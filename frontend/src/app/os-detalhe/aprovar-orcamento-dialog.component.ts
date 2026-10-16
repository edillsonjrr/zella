import { Component, inject, signal } from '@angular/core';
import { CurrencyPipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { MAT_DIALOG_DATA, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatButtonToggleModule } from '@angular/material/button-toggle';
import { IconComponent } from '../shared/icon/icon.component';
import { FlowButtonComponent } from '../shared/flow-button/flow-button.component';
import { SpinnerComponent } from '../shared/spinner/spinner.component';
import { DataService } from '../shared/data.service';
import type { DecisaoForaContrato, Orcamento } from '../shared/models';

export interface AprovarOrcamentoDialogData {
  numeroOS: string;
  orcamento: Orcamento;
}

export interface AprovarOrcamentoResultado {
  ajustes: { itemContratoId: string; quantidade: number }[];
  observacao: string;
}

// Item fora do contrato (Z3.5): a gestora aprova ou recusa cada um. Começa
// sem decisão: aprovar o que não está no contrato tem que ser de propósito.
interface LinhaForaContrato {
  id: string;
  descricao: string;
  quantidade: number;
  unidade: string;
  precoUnitario: number;
  decisao: DecisaoForaContrato | null;
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
 *
 * Os itens vêm antes dos botões, e a janela só fecha depois que a aprovação
 * deu certo: o erro (saldo insuficiente, OS cancelada) aparece aqui mesmo.
 * Fecha com `true` quando aprovou.
 */
@Component({
  selector: 'app-aprovar-orcamento-dialog',
  imports: [FormsModule, CurrencyPipe, MatDialogModule, MatFormFieldModule, MatInputModule, MatButtonToggleModule, IconComponent, FlowButtonComponent, SpinnerComponent],
  template: `
    <div class="apr">
      <div class="apr-cabecalho">
        <div class="apr-icone"><app-icon name="check_circle" aria-hidden="true"></app-icon></div>
        <div>
          <h2 class="apr-titulo">Aprovar orçamento da {{ data.numeroOS }}</h2>
          <p class="apr-sub">Confira os itens. Ao aprovar, as quantidades ficam separadas no saldo do contrato. Se precisar, reduza antes.</p>
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
        <span>{{ fora.length ? 'Total do contrato (sai do saldo)' : 'Total aprovado' }}</span>
        <strong>{{ total | currency:'BRL' }}</strong>
      </div>

      @if (fora.length) {
        <div class="apr-fora">
          <span class="apr-fora-titulo">Fora do contrato · decida cada um</span>
          <p class="apr-fora-ajuda">Não está no contrato e não sai do saldo. O valor fica à parte.</p>
          @for (f of fora; track f.id) {
            <div class="apr-fora-linha" [class.apr-fora-linha--recusado]="f.decisao === 'Recusado'">
              <div class="apr-info">
                <span class="apr-selo">Fora do contrato</span>
                <strong>{{ f.descricao }}</strong>
                <span class="apr-meta">{{ f.quantidade }} {{ f.unidade }} × {{ f.precoUnitario | currency:'BRL' }} = {{ f.quantidade * f.precoUnitario | currency:'BRL' }}</span>
              </div>
              <mat-button-toggle-group [(ngModel)]="f.decisao" [name]="'fora-' + f.id" [attr.aria-label]="'Decisão sobre ' + f.descricao" class="apr-decisao">
                <mat-button-toggle value="Aprovado">Aprovar</mat-button-toggle>
                <mat-button-toggle value="Recusado">Recusar</mat-button-toggle>
              </mat-button-toggle-group>
            </div>
          }
          <div class="apr-total apr-total--fora">
            <span>Fora do contrato aprovado (à parte)</span>
            <strong>{{ totalFora | currency:'BRL' }}</strong>
          </div>
        </div>
      }

      @if (ajustado) {
        <mat-form-field appearance="outline" class="apr-obs">
          <mat-label>Motivo do ajuste</mat-label>
          <input matInput [(ngModel)]="observacao" name="observacao" maxlength="500" placeholder="Ex: só 4 lâmpadas estão queimadas" />
        </mat-form-field>
      }

      @if (faltaDecidir) {
        <p class="apr-aviso">Aprove ou recuse cada item fora do contrato para continuar.</p>
      }

      @if (erro) {
        <p class="apr-erro" role="alert"><app-icon name="warning" aria-hidden="true"></app-icon> {{ erro }}</p>
      }

      <div class="apr-acoes">
        <app-flow-button variant="secondary" type="button" [class.full-width]="celular" [disabled]="enviando()" (click)="ref.close()">Voltar</app-flow-button>
        <app-flow-button type="button" [class.full-width]="celular" [disabled]="!valido || enviando()" (click)="confirmar()">
          @if (enviando()) {
            <app-spinner size="sm" label="Aprovando"></app-spinner> Aprovando…
          } @else {
            <app-icon class="btn-icon" name="check_circle" aria-hidden="true"></app-icon> {{ ajustado ? 'Aprovar com ajustes' : 'Aprovar' }}
          }
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
    .apr-fora { display: flex; flex-direction: column; gap: 8px; margin: 4px 0 10px; }
    .apr-fora-titulo { font-size: 0.75rem; font-weight: 600; text-transform: uppercase; letter-spacing: 0.4px; color: var(--text-tertiary); }
    .apr-fora-ajuda { margin: 0; font-size: 0.75rem; color: var(--text-secondary); }
    .apr-fora-linha { display: flex; justify-content: space-between; align-items: center; gap: 12px; padding: 8px 12px; border: 1px dashed var(--warning-500); border-radius: var(--button-radius); background: var(--warning-50, var(--bg-elevated)); }
    .apr-fora-linha--recusado { opacity: 0.7; }
    .apr-fora-linha .apr-info { padding-top: 0; }
    .apr-selo { align-self: flex-start; padding: 1px 8px; border-radius: 999px; background: var(--warning-500); color: #1b1300; font-size: 0.75rem; font-weight: 700; text-transform: uppercase; letter-spacing: 0.3px; }
    .apr-decisao { flex-shrink: 0; }
    .apr-total--fora { margin: 0; border: 1px dashed var(--warning-500); }
    .apr-aviso { margin: 0 0 8px; font-size: 0.8rem; color: var(--text-secondary); }
    .hint-erro { color: var(--danger-500); }
    .apr-erro { display: flex; gap: 8px; align-items: flex-start; margin: 0 0 8px; padding: 10px 12px; border-radius: var(--button-radius); background: var(--danger-50, var(--bg-elevated)); color: var(--danger-500); font-size: 0.8rem; }
    .apr-acoes { display: flex; justify-content: flex-end; gap: 8px; margin-top: 6px; }
    @media (max-width: 480px) { .apr-linha, .apr-fora-linha { flex-direction: column; align-items: stretch; } .apr-info { padding-top: 0; } .apr-qtd { flex: 0 0 auto; max-width: none; } .apr-acoes { flex-direction: column-reverse; } }
  `
})
export class AprovarOrcamentoDialogComponent {
  // No celular, os botões de ação ocupam a largura toda.
  readonly celular = typeof matchMedia === 'function' && matchMedia('(max-width: 480px)').matches;
  readonly ref = inject(MatDialogRef<AprovarOrcamentoDialogComponent>);
  readonly data: AprovarOrcamentoDialogData = inject(MAT_DIALOG_DATA);
  private readonly dataService = inject(DataService);

  linhas: LinhaAprovacao[];
  fora: LinhaForaContrato[];
  observacao = '';
  erro = '';
  enviando = signal(false);

  constructor() {
    const porItem = new Map<string, LinhaAprovacao>();
    for (const i of this.data.orcamento.itens) {
      const atual = porItem.get(i.itemContratoId);
      if (atual) atual.orcado += i.quantidade;
      else porItem.set(i.itemContratoId, { itemContratoId: i.itemContratoId, nome: i.nome, precoUnitario: i.precoUnitario, orcado: i.quantidade, aprovado: i.quantidade });
    }
    this.linhas = [...porItem.values()].map(l => ({ ...l, aprovado: l.orcado }));
    this.fora = (this.data.orcamento.itensForaContrato ?? []).map(f => ({
      id: f.id,
      descricao: f.descricao,
      quantidade: f.quantidade,
      unidade: f.unidade,
      precoUnitario: f.precoUnitario,
      decisao: null
    }));
  }

  get faltaDecidir(): boolean {
    return this.fora.some(f => !f.decisao);
  }

  get totalFora(): number {
    return this.fora.filter(f => f.decisao === 'Aprovado').reduce((s, f) => s + f.quantidade * f.precoUnitario, 0);
  }

  problema(l: LinhaAprovacao): string {
    const v = Number(l.aprovado);
    if (!Number.isFinite(v) || v < 0) return 'Informe um número maior ou igual a zero';
    if (v > l.orcado) return `Máximo ${l.orcado}: acima disso peça novo orçamento`;
    return '';
  }

  get valido(): boolean {
    // Precisa sobrar alguma coisa aprovada: item do contrato com quantidade
    // ou item fora do contrato aprovado. E todo item fora do contrato decidido.
    const algoAprovado = this.linhas.some(l => Number(l.aprovado) > 0) || this.fora.some(f => f.decisao === 'Aprovado');
    return this.linhas.every(l => !this.problema(l)) && !this.faltaDecidir && algoAprovado;
  }

  get ajustado(): boolean {
    return this.linhas.some(l => Number(l.aprovado) !== l.orcado);
  }

  get total(): number {
    return this.linhas.reduce((s, l) => s + Number(l.aprovado) * l.precoUnitario, 0);
  }

  async confirmar(): Promise<void> {
    if (!this.valido || this.enviando()) return;
    if (this.ajustado && !this.observacao.trim()) {
      this.erro = 'Informe o motivo do ajuste: a contratada vai ver o que mudou.';
      return;
    }
    const resultado: AprovarOrcamentoResultado = {
      ajustes: this.linhas.filter(l => Number(l.aprovado) !== l.orcado).map(l => ({ itemContratoId: l.itemContratoId, quantidade: Number(l.aprovado) })),
      observacao: this.observacao.trim()
    };
    this.erro = '';
    this.enviando.set(true);
    this.ref.disableClose = true;
    try {
      const foraContrato = this.fora.map(f => ({ id: f.id, aprovado: f.decisao === 'Aprovado' }));
      await this.dataService.aprovarOrcamento(this.data.orcamento.id, resultado.ajustes, resultado.observacao, foraContrato);
      this.ref.close(true);
    } catch (e) {
      this.erro = e instanceof Error ? e.message : 'Não foi possível aprovar. Tente de novo.';
    } finally {
      this.enviando.set(false);
      this.ref.disableClose = false;
    }
  }
}
