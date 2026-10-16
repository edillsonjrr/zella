import { Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MAT_DIALOG_DATA, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatSelectModule } from '@angular/material/select';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { IconComponent } from '../shared/icon/icon.component';
import { FlowButtonComponent } from '../shared/flow-button/flow-button.component';
import { SpinnerComponent } from '../shared/spinner/spinner.component';
import { AuthService } from '../shared/auth.service';
import { DataService } from '../shared/data.service';
import { UiFeedbackService } from '../shared/ui-feedback.service';
import { montarPlaca, urlDoQr } from '../shared/plaqueta';
import { baixarArquivo, nomeDeArquivo } from '../shared/pdf/documento-pdf';
import { nomeUnidade, rotuloPatrimonio } from '../shared/rotulos';
import type { Equipamento } from '../shared/models';

export interface EtiquetasDialogData {
  // Unidade já filtrada na lista, para começar por ela.
  unidadeId?: string;
}

interface Opcao {
  equipamento: Equipamento;
  local: string;
  patrimonio: string;
}

/**
 * "Imprimir etiquetas" da tela Equipamentos (Z3.1): escolhe os equipamentos
 * (ou todos de uma unidade) e baixa um PDF A4 com 9 plaquetas QR por folha,
 * com linha de corte. A plaqueta é a mesma da janela do QR.
 */
@Component({
  selector: 'app-etiquetas-dialog',
  imports: [FormsModule, MatDialogModule, MatFormFieldModule, MatSelectModule, MatCheckboxModule, IconComponent, FlowButtonComponent, SpinnerComponent],
  template: `
    <div class="eti">
      <div class="eti-cabecalho">
        <div class="eti-icone"><app-icon name="print" aria-hidden="true"></app-icon></div>
        <div>
          <h2 class="eti-titulo">Imprimir etiquetas QR</h2>
          <p class="eti-sub">Escolha os equipamentos. O PDF sai em folha A4, com 9 plaquetas por folha e linha tracejada para recortar.</p>
        </div>
      </div>

      <mat-form-field appearance="outline" class="eti-unidade">
        <mat-label>Unidade</mat-label>
        <mat-select [ngModel]="unidadeId()" (ngModelChange)="unidadeId.set($event)" name="unidade" [disabled]="gerando()">
          <mat-option value="">Todas as unidades</mat-option>
          @for (u of unidades(); track u.id) {
            <mat-option [value]="u.id">{{ u.nome }}</mat-option>
          }
        </mat-select>
      </mat-form-field>

      <div class="eti-marcar">
        <button type="button" class="eti-link" (click)="marcarTodos()" [disabled]="gerando() || !opcoes().length">
          Marcar todos {{ unidadeId() ? 'desta unidade' : '' }} ({{ opcoes().length }})
        </button>
        <button type="button" class="eti-link" (click)="desmarcarTodos()" [disabled]="gerando() || !selecionados().size">Desmarcar todos</button>
      </div>

      <div class="eti-lista" role="group" aria-label="Equipamentos">
        @for (o of opcoes(); track o.equipamento.id) {
          <mat-checkbox [checked]="selecionados().has(o.equipamento.id)" (change)="alternar(o.equipamento.id, $event.checked)" [disabled]="gerando()" color="primary">
            <span class="eti-nome">{{ o.equipamento.nome }}</span>
            <span class="eti-meta">{{ o.local }}{{ o.patrimonio ? ' · ' + o.patrimonio : '' }}</span>
          </mat-checkbox>
        } @empty {
          <p class="eti-vazio">Nenhum equipamento {{ unidadeId() ? 'nesta unidade' : 'cadastrado' }}.</p>
        }
      </div>

      @if (erro()) {
        <p class="eti-erro" role="alert"><app-icon name="warning" aria-hidden="true"></app-icon> {{ erro() }}</p>
      }

      <div class="eti-acoes">
        <span class="eti-total" aria-live="polite">{{ selecionados().size }} {{ selecionados().size === 1 ? 'selecionado' : 'selecionados' }}</span>
        <app-flow-button variant="secondary" type="button" [disabled]="gerando()" (click)="ref.close()">Voltar</app-flow-button>
        <app-flow-button type="button" [disabled]="!selecionados().size || gerando()" (click)="gerar()">
          @if (gerando()) {
            <app-spinner size="sm" label="Gerando"></app-spinner> Gerando {{ progresso() }}…
          } @else {
            <app-icon class="btn-icon" name="download" aria-hidden="true"></app-icon> Gerar PDF
          }
        </app-flow-button>
      </div>
    </div>
  `,
  styles: `
    .eti { padding: 20px 22px 18px; background: var(--bg-tertiary); color: var(--text-primary); border-radius: var(--card-radius); }
    .eti-cabecalho { display: flex; gap: 12px; align-items: flex-start; margin-bottom: 12px; }
    .eti-icone { width: 40px; height: 40px; border-radius: 12px; background: var(--primary-50); color: var(--primary-500); display: flex; align-items: center; justify-content: center; flex-shrink: 0; }
    .eti-titulo { margin: 0; font-size: 1rem; font-weight: 600; }
    .eti-sub { margin: 2px 0 0; font-size: 0.8rem; color: var(--text-secondary); }
    .eti-unidade { width: 100%; }
    .eti-marcar { display: flex; flex-wrap: wrap; gap: 16px; margin: -6px 0 8px; }
    .eti-link { padding: 0; border: 0; background: none; color: var(--primary-400); font: inherit; font-size: 0.8125rem; font-weight: 600; cursor: pointer; text-decoration: underline; }
    .eti-link:disabled { color: var(--text-disabled); cursor: default; }
    .eti-lista { display: flex; flex-direction: column; max-height: 42vh; overflow: auto; padding: 4px 8px; border: 1px solid var(--border-default); border-radius: var(--button-radius); }
    .eti-nome { display: block; font-size: 0.875rem; font-weight: 600; }
    .eti-meta { display: block; font-size: 0.75rem; color: var(--text-tertiary); }
    .eti-vazio { margin: 8px 0; font-size: 0.8125rem; color: var(--text-tertiary); }
    .eti-erro { display: flex; gap: 8px; margin: 10px 0 0; padding: 10px 12px; border-radius: var(--button-radius); background: var(--danger-50, var(--bg-elevated)); color: var(--danger-500); font-size: 0.8rem; }
    .eti-acoes { display: flex; justify-content: flex-end; align-items: center; gap: 8px; margin-top: 14px; }
    .eti-total { margin-right: auto; font-size: 0.8125rem; color: var(--text-secondary); }
    @media (max-width: 480px) {
      .eti { padding: 16px; }
      .eti-acoes { flex-direction: column-reverse; align-items: stretch; }
      .eti-total { margin: 0; text-align: center; }
    }
  `
})
export class EtiquetasDialogComponent {
  readonly ref = inject(MatDialogRef<EtiquetasDialogComponent>);
  private readonly data: EtiquetasDialogData | null = inject(MAT_DIALOG_DATA, { optional: true });
  private readonly dataService = inject(DataService);
  private readonly auth = inject(AuthService);
  private readonly feedback = inject(UiFeedbackService);

  readonly unidades = this.dataService.unidades;
  unidadeId = signal(this.data?.unidadeId ?? '');
  selecionados = signal<Set<string>>(new Set());
  gerando = signal(false);
  progresso = signal('');
  erro = signal('');

  opcoes = computed<Opcao[]>(() => {
    const ds = this.dataService;
    const unidade = this.unidadeId();
    return ds.equipamentos()
      .filter(e => !unidade || e.unidadeId === unidade)
      .map(e => ({
        equipamento: e,
        local: [nomeUnidade(ds.getUnidadeById(e.unidadeId), ''), e.blocoId ? ds.getBlocoById(e.blocoId)?.nome : '', ds.getSalaById(e.salaId)?.nome]
          .filter(Boolean)
          .join(' · '),
        patrimonio: rotuloPatrimonio(e.patrimonio)
      }))
      .sort((a, b) => a.local.localeCompare(b.local, 'pt-BR') || a.equipamento.nome.localeCompare(b.equipamento.nome, 'pt-BR'));
  });

  alternar(id: string, marcado: boolean): void {
    this.selecionados.update(s => {
      const novo = new Set(s);
      if (marcado) novo.add(id);
      else novo.delete(id);
      return novo;
    });
  }

  marcarTodos(): void {
    this.selecionados.update(s => new Set([...s, ...this.opcoes().map(o => o.equipamento.id)]));
  }

  desmarcarTodos(): void {
    this.selecionados.set(new Set());
  }

  async gerar(): Promise<void> {
    if (!this.selecionados().size || this.gerando()) return;
    const ds = this.dataService;
    // Na ordem da lista (unidade, local, nome), para a folha sair arrumada.
    const todos = ds.equipamentos()
      .filter(e => this.selecionados().has(e.id))
      .map(e => {
        const unidade = nomeUnidade(ds.getUnidadeById(e.unidadeId), '');
        const local = [unidade, e.blocoId ? ds.getBlocoById(e.blocoId)?.nome : '', ds.getSalaById(e.salaId)?.nome].filter(Boolean).join(' · ');
        return { e, local };
      })
      .sort((a, b) => a.local.localeCompare(b.local, 'pt-BR') || a.e.nome.localeCompare(b.e.nome, 'pt-BR'));
    const etiquetas = todos.map(({ e, local }) => {
      const alvo = { tipo: 'equipamento' as const, id: e.id, titulo: e.nome, subtitulo: local };
      return { titulo: e.nome, url: urlDoQr(this.auth.empresaId, 'equipamento', e.id), placa: montarPlaca(ds, alvo) };
    });

    this.erro.set('');
    this.gerando.set(true);
    this.ref.disableClose = true;
    try {
      const { gerarEtiquetasPdf } = await import('../shared/pdf/etiquetas-pdf');
      const blob = await gerarEtiquetasPdf(etiquetas, (feitas, total) => this.progresso.set(`${feitas} de ${total}`));
      const unidade = this.unidadeId() ? ds.getUnidadeById(this.unidadeId())?.nome : '';
      baixarArquivo(blob, `etiquetas-qr${unidade ? '-' + nomeDeArquivo(unidade) : ''}.pdf`);
      this.feedback.sucesso(etiquetas.length === 1 ? 'PDF com 1 etiqueta gerado.' : `PDF com ${etiquetas.length} etiquetas gerado.`);
      this.ref.close();
    } catch (e) {
      console.error('Falha ao gerar etiquetas', e);
      this.erro.set('Não foi possível gerar o PDF. Tente de novo com menos equipamentos.');
    } finally {
      this.gerando.set(false);
      this.ref.disableClose = false;
    }
  }
}
