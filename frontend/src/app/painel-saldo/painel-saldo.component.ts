import { Component, signal, computed, inject } from '@angular/core';
import { IconComponent } from '../shared/icon/icon.component';
import { MatCardModule } from '@angular/material/card';
import { MatTableModule } from '@angular/material/table';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { MatButtonModule } from '@angular/material/button';
import { MatSelectModule } from '@angular/material/select';
import { MatFormFieldModule } from '@angular/material/form-field';
import { RouterLink } from '@angular/router';
import { MatDialog, MatDialogModule } from '@angular/material/dialog';
import { SaldoDetalheComponent } from '../saldo-detalhe/saldo-detalhe.component';
import { DataService } from '../shared/data.service';
import type { Contrato, ItemContrato } from '../shared/models';

export interface SaldoItemView {
  id: string;
  item: string;
  contrato: string;
  unidadeMedida: string;
  contratado: number;
  consumido: number;
  reservado: number;
  disponivel: number;
  precoUnitario: number;
}

@Component({
  selector: 'app-painel-saldo',
  imports: [
    MatCardModule,
    MatTableModule,
    MatProgressBarModule,
    IconComponent,
    MatButtonModule,
    MatSelectModule,
    MatFormFieldModule,
    RouterLink,
    MatDialogModule
  ],
  templateUrl: './painel-saldo.component.html',
  styleUrl: './painel-saldo.component.scss'
})
export class PainelSaldoComponent {
  private dialog = inject(MatDialog);
  private dataService = inject(DataService);

  displayedColumns: string[] = ['item', 'contratado', 'consumido', 'reservado', 'disponivel', 'alerta'];

  contratoSelecionado = signal<Contrato | null>(null);

  contratos = this.dataService.contratos;

  itensFiltrados = computed(() => {
    const contrato = this.contratoSelecionado();
    if (!contrato) return [];
    return contrato.itens.map(i => this.mapItem(i, contrato));
  });

  constructor() {}

  selecionarContrato(contrato: Contrato | null): void {
    this.contratoSelecionado.set(contrato);
  }

  compararContratos(a: Contrato | null, b: Contrato | null): boolean {
    return !!a && !!b && a.id === b.id;
  }

  abrirDetalhe(item: SaldoItemView): void {
    const contrato = this.contratoSelecionado();
    if (!contrato) return;

    this.dialog.open(SaldoDetalheComponent, {
      panelClass: 'saldo-detalhe-dialog',
      data: { item, contrato },
      position: { right: '0', top: '0' },
      height: '100vh',
      width: '320px',
      maxWidth: '100vw'
    });
  }

  percentual(item: SaldoItemView): number {
    if (!item.contratado) return 0;
    return Math.round(((item.consumido + item.reservado) / item.contratado) * 100);
  }

  private mapItem(item: ItemContrato, contrato: Contrato): SaldoItemView {
    return {
      id: item.id,
      item: item.nome,
      contrato: contrato.numero,
      unidadeMedida: item.unidadeMedida,
      contratado: item.quantidadeContratada,
      consumido: item.quantidadeConsumida,
      reservado: item.quantidadeReservada,
      disponivel: item.quantidadeDisponivel,
      precoUnitario: item.precoUnitario
    };
  }
}
