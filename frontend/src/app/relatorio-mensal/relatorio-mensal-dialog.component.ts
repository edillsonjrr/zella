import { Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MAT_DIALOG_DATA, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatSelectModule } from '@angular/material/select';
import { IconComponent } from '../shared/icon/icon.component';
import { FlowButtonComponent } from '../shared/flow-button/flow-button.component';
import { SpinnerComponent } from '../shared/spinner/spinner.component';
import { AuthService } from '../shared/auth.service';
import { DataService } from '../shared/data.service';
import { UiFeedbackService } from '../shared/ui-feedback.service';
import { baixarArquivo } from '../shared/pdf/documento-pdf';
import { mesesRecentes, montarRelatorioMensal } from '../shared/relatorios';
import type { AditivoContrato } from '../shared/models';

export interface RelatorioMensalDialogData {
  contratoId?: string;
}

/**
 * "Relatório do mês" (Z3.2), aberto do Painel gerencial e de Contratos.
 * Escolhe o mês e, se quiser, um contrato; baixa o PDF com o saldo de cada
 * contrato no fim do mês, os serviços feitos, as preventivas e os chamados
 * em aberto. Cada perfil recebe o que já pode ler nas telas.
 */
@Component({
  selector: 'app-relatorio-mensal-dialog',
  imports: [FormsModule, MatDialogModule, MatFormFieldModule, MatSelectModule, IconComponent, FlowButtonComponent, SpinnerComponent],
  template: `
    <div class="rel">
      <div class="rel-cabecalho">
        <div class="rel-icone"><app-icon name="description" aria-hidden="true"></app-icon></div>
        <div>
          <h2 class="rel-titulo">Relatório do mês</h2>
          <p class="rel-sub">PDF para a diretoria, o conselho ou a vistoria.</p>
        </div>
      </div>

      <mat-form-field appearance="outline" class="rel-campo">
        <mat-label>Mês</mat-label>
        <mat-select [(ngModel)]="mes" name="mes" [disabled]="gerando()">
          @for (m of meses; track m.inicio; let i = $index) {
            <mat-option [value]="i">{{ m.rotulo }}{{ i === 0 ? ' (até hoje)' : '' }}</mat-option>
          }
        </mat-select>
      </mat-form-field>

      <mat-form-field appearance="outline" class="rel-campo">
        <mat-label>Contrato</mat-label>
        <mat-select [(ngModel)]="contratoId" name="contrato" [disabled]="gerando()">
          <mat-option value="">Todos os contratos</mat-option>
          @for (c of contratos(); track c.id) {
            <mat-option [value]="c.id">{{ c.numero }} · {{ c.fornecedor }}</mat-option>
          }
        </mat-select>
      </mat-form-field>

      <ul class="rel-itens">
        <li>Saldo de cada contrato no fim do mês, com a conta escrita (Contratado = Usado + Separado + Livre).</li>
        <li>Serviços feitos no mês: OS, equipamento, local, técnico e custo, com os itens fora do contrato à parte.</li>
        <li>Preventivas previstas e feitas.</li>
        <li>Chamados em aberto e em atraso.</li>
      </ul>

      @if (erro()) {
        <p class="rel-erro" role="alert"><app-icon name="warning" aria-hidden="true"></app-icon> {{ erro() }}</p>
      }

      <div class="rel-acoes">
        <app-flow-button variant="secondary" type="button" [disabled]="gerando()" (click)="ref.close()">Voltar</app-flow-button>
        <app-flow-button type="button" [disabled]="gerando()" (click)="gerar()">
          @if (gerando()) {
            <app-spinner size="sm" label="Gerando"></app-spinner> Gerando…
          } @else {
            <app-icon class="btn-icon" name="download" aria-hidden="true"></app-icon> Baixar PDF
          }
        </app-flow-button>
      </div>
    </div>
  `,
  styles: `
    .rel { padding: 20px 22px 18px; background: var(--bg-tertiary); color: var(--text-primary); border-radius: var(--card-radius); }
    .rel-cabecalho { display: flex; gap: 12px; align-items: flex-start; margin-bottom: 14px; }
    .rel-icone { width: 40px; height: 40px; border-radius: 12px; background: var(--primary-50); color: var(--primary-500); display: flex; align-items: center; justify-content: center; flex-shrink: 0; }
    .rel-titulo { margin: 0; font-size: 1rem; font-weight: 600; }
    .rel-sub { margin: 2px 0 0; font-size: 0.8rem; color: var(--text-secondary); }
    .rel-campo { width: 100%; }
    .rel-itens { margin: 0 0 12px; padding-left: 18px; font-size: 0.8rem; color: var(--text-secondary); display: flex; flex-direction: column; gap: 4px; }
    .rel-erro { display: flex; gap: 8px; margin: 0 0 8px; padding: 10px 12px; border-radius: var(--button-radius); background: var(--danger-50, var(--bg-elevated)); color: var(--danger-500); font-size: 0.8rem; }
    .rel-acoes { display: flex; justify-content: flex-end; gap: 8px; }
    @media (max-width: 480px) { .rel-acoes { flex-direction: column-reverse; } .rel-acoes app-flow-button { width: 100%; } }
  `
})
export class RelatorioMensalDialogComponent {
  readonly ref = inject(MatDialogRef<RelatorioMensalDialogComponent>);
  private readonly data: RelatorioMensalDialogData | null = inject(MAT_DIALOG_DATA, { optional: true });
  private readonly dataService = inject(DataService);
  private readonly auth = inject(AuthService);
  private readonly feedback = inject(UiFeedbackService);

  readonly meses = mesesRecentes();
  // Do dia 1 ao 10, o mês fechado é o mais pedido; depois, o mês corrente.
  mes = new Date().getDate() <= 10 ? 1 : 0;
  contratoId = this.data?.contratoId ?? '';
  readonly contratos = this.dataService.contratos;
  gerando = signal(false);
  erro = signal('');

  async gerar(): Promise<void> {
    if (this.gerando()) return;
    const ds = this.dataService;
    const periodo = this.meses[this.mes];
    this.erro.set('');
    this.gerando.set(true);
    try {
      // Aditivos só são lidos aqui, para refazer o contratado do fim do mês.
      const alvo = this.contratoId ? ds.contratos().filter(c => c.id === this.contratoId) : ds.contratos();
      const aditivos = new Map<string, AditivoContrato[]>();
      await Promise.all(alvo.map(async c => aditivos.set(c.id, await ds.lerAditivos(c.id).catch(() => []))));

      const relatorio = montarRelatorioMensal(ds, {
        ano: periodo.ano,
        mes: periodo.mes,
        contratoId: this.contratoId || undefined,
        aditivos,
        soDaContratada: this.auth.isGestorContratado() || this.auth.isTecnico()
      });
      const { gerarRelatorioMensalPdf } = await import('../shared/pdf/relatorios-pdf');
      const usuario = this.auth.usuarioLogado();
      const { blob, nome } = await gerarRelatorioMensalPdf(relatorio, { empresa: usuario.empresaNome, pessoa: usuario.nome });
      baixarArquivo(blob, nome);
      this.feedback.sucesso(`Relatório de ${periodo.rotulo} gerado.`);
      this.ref.close();
    } catch (e) {
      console.error('Falha ao gerar o relatório', e);
      this.erro.set('Não foi possível gerar o relatório. Confira a internet e tente de novo.');
    } finally {
      this.gerando.set(false);
    }
  }
}
