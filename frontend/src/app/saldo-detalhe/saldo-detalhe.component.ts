import { Component, computed, inject } from '@angular/core';
import { DatePipe } from '@angular/common';
import { IconComponent } from '../shared/icon/icon.component';
import { FlowButtonComponent } from '../shared/flow-button/flow-button.component';
import { MatCardModule } from '@angular/material/card';
import { MatButtonModule } from '@angular/material/button';
import { MatDividerModule } from '@angular/material/divider';
import { MatTooltipModule } from '@angular/material/tooltip';
import { MiniManometroComponent } from '../shared/mini-manometro/mini-manometro.component';
import { LegendaSaldoComponent } from '../shared/legenda-saldo/legenda-saldo.component';
import { MatTableModule } from '@angular/material/table';
import { MAT_DIALOG_DATA, MatDialog, MatDialogRef } from '@angular/material/dialog';
import { DataService } from '../shared/data.service';
import { OsDetalheComponent } from '../os-detalhe/os-detalhe.component';
import { FORMULA_UTILIZACAO, avisoContaNaoFecha, contaSaldo, historicoDeUso, quantidade, utilizacao, type UsoDoItem } from '../shared/saldo';
import type { SaldoItemView } from '../painel-saldo/painel-saldo.component';
import type { Contrato, ItemContrato } from '../shared/models';

interface SaldoDetalheData {
  item: SaldoItemView;
  contrato: Contrato;
}

@Component({
  selector: 'app-saldo-detalhe',
  imports: [
    DatePipe,
    MatCardModule,
    MatButtonModule,
    MatTooltipModule,
    IconComponent,
    FlowButtonComponent,
    MatDividerModule,
    MiniManometroComponent,
    LegendaSaldoComponent,
    MatTableModule
  ],
  templateUrl: './saldo-detalhe.component.html',
  styleUrl: './saldo-detalhe.component.scss'
})
export class SaldoDetalheComponent {
  private readonly dialogRef = inject(MatDialogRef<SaldoDetalheComponent>);
  private readonly dialog = inject(MatDialog);
  private readonly dataService = inject(DataService);
  readonly data: SaldoDetalheData = inject(MAT_DIALOG_DATA);

  displayedColumns: string[] = ['data', 'os', 'quantidade', 'situacao'];
  readonly formulaUtilizacao = FORMULA_UTILIZACAO;
  readonly quantidade = quantidade;

  // O item lido ao vivo do contrato: o painel pode ficar aberto enquanto
  // uma OS é aprovada ou executada.
  private readonly itemAtual = computed<ItemContrato | undefined>(() =>
    this.dataService.getContratoById(this.data.contrato.id)?.itens.find(i => i.id === this.data.item.id)
  );

  item = computed<SaldoItemView>(() => {
    const i = this.itemAtual();
    if (!i) return this.data.item;
    return {
      ...this.data.item,
      contratado: i.quantidadeContratada,
      consumido: i.quantidadeConsumida,
      reservado: i.quantidadeReservada,
      disponivel: i.quantidadeDisponivel,
      precoUnitario: i.precoUnitario,
      conta: contaSaldo(i),
      avisoConta: avisoContaNaoFecha(i)
    };
  });

  get contrato(): Contrato {
    return this.data.contrato;
  }

  /**
   * Histórico de uso de verdade (A3): as OS deste contrato cujo orçamento
   * aprovado tem este item — separado, usado ou devolvido. Sai das OS e dos
   * orçamentos que a sessão já lê, com as mesmas regras por perfil.
   */
  historico = computed<UsoDoItem[]>(() =>
    historicoDeUso(this.contrato.id, this.data.item.id, this.dataService.ordensServico(), os => this.dataService.getOrcamentoByOS(os.id))
  );

  fechar(): void {
    this.dialogRef.close();
  }

  abrirOS(uso: UsoDoItem): void {
    const os = this.dataService.getOSById(uso.osId);
    if (!os) return;
    this.dialog.open(OsDetalheComponent, {
      panelClass: 'os-detalhe-dialog',
      data: os,
      position: { right: '0', top: '0' },
      height: '100vh',
      width: '360px',
      maxWidth: '100vw'
    });
  }

  percentual(): number {
    const i = this.item();
    return utilizacao({ quantidadeContratada: i.contratado, quantidadeConsumida: i.consumido, quantidadeReservada: i.reservado });
  }

  formatarMoeda(valor: number): string {
    return valor.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
  }
}
