import { Component, Inject } from '@angular/core';
import { IconComponent } from '../shared/icon/icon.component';
import { FlowButtonComponent } from '../shared/flow-button/flow-button.component';
import { MatCardModule } from '@angular/material/card';
import { MatButtonModule } from '@angular/material/button';
import { MatDividerModule } from '@angular/material/divider';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { MatTableModule } from '@angular/material/table';
import { MAT_DIALOG_DATA, MatDialogRef } from '@angular/material/dialog';
import type { SaldoItemView } from '../painel-saldo/painel-saldo.component';
import type { Contrato } from '../shared/models';

interface ConsumoHistorico {
  os: string;
  data: string;
  quantidade: number;
  tecnico: string;
}

interface SaldoDetalheData {
  item: SaldoItemView;
  contrato: Contrato;
}

@Component({
  selector: 'app-saldo-detalhe',
  imports: [
    MatCardModule,
    MatButtonModule,
    IconComponent,
    FlowButtonComponent,
    MatDividerModule,
    MatProgressBarModule,
    MatTableModule
  ],
  templateUrl: './saldo-detalhe.component.html',
  styleUrl: './saldo-detalhe.component.scss'
})
export class SaldoDetalheComponent {
  displayedColumns: string[] = ['os', 'data', 'quantidade', 'tecnico'];

  historico: ConsumoHistorico[] = [
    { os: 'OS-2026-0095', data: '15/08/2026', quantidade: 24, tecnico: 'Carlos' },
    { os: 'OS-2026-0087', data: '10/08/2026', quantidade: 18, tecnico: 'Ana' },
    { os: 'OS-2026-0079', data: '02/08/2026', quantidade: 12, tecnico: 'Carlos' },
    { os: 'OS-2026-0065', data: '22/07/2026', quantidade: 8, tecnico: 'João' }
  ];

  constructor(
    private dialogRef: MatDialogRef<SaldoDetalheComponent>,
    @Inject(MAT_DIALOG_DATA) public data: SaldoDetalheData
  ) {}

  get item(): SaldoItemView {
    return this.data.item;
  }

  get contrato(): Contrato {
    return this.data.contrato;
  }

  fechar(): void {
    this.dialogRef.close();
  }

  percentual(): number {
    if (!this.item.contratado) return 0;
    return Math.round(((this.item.consumido + this.item.reservado) / this.item.contratado) * 100);
  }

  formatarMoeda(valor: number): string {
    return valor.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
  }
}
