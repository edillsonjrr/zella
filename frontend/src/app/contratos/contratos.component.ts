import { Component, computed, inject } from '@angular/core';
import { IconComponent } from '../shared/icon/icon.component';
import { FlowButtonComponent } from '../shared/flow-button/flow-button.component';
import { MatCardModule } from '@angular/material/card';
import { MatTableModule } from '@angular/material/table';
import { MatButtonModule } from '@angular/material/button';
import { MatDialog, MatDialogModule } from '@angular/material/dialog';
import { NovoContratoComponent } from '../novo-contrato/novo-contrato.component';
import { ContratoDetalheComponent } from '../contrato-detalhe/contrato-detalhe.component';
import { DataService } from '../shared/data.service';
import { AuthService } from '../shared/auth.service';
import { situacaoContrato } from '../shared/contrato-status';
import type { Contrato } from '../shared/models';

@Component({
  selector: 'app-contratos',
  imports: [MatCardModule, MatTableModule, MatButtonModule, IconComponent,
    FlowButtonComponent, MatDialogModule],
  templateUrl: './contratos.component.html',
  styleUrl: './contratos.component.scss'
})
export class ContratosComponent {
  private dialog = inject(MatDialog);
  private dataService = inject(DataService);
  private auth = inject(AuthService);

  // Contrato é do cliente: só o gestor cadastra. A contratada entra aqui só
  // pra consultar os dela (as rules negam o create de qualquer forma).
  podeCriar = this.auth.isGestor();

  displayedColumns: string[] = ['numero', 'fornecedor', 'vigencia', 'itens', 'unidades', 'status', 'acoes'];

  contratos = this.dataService.contratos;

  contratosView = computed(() => {
    return this.contratos().map(c => ({
      ...c,
      vigencia: this.formatarVigencia(c.vigenciaInicio, c.vigenciaFim),
      totalUnidades: c.itens.reduce((sum, i) => sum + i.quantidadeContratada, 0),
      unidadesDisponiveis: c.itens.reduce((sum, i) => sum + i.quantidadeDisponivel, 0),
      itensCount: c.itens.length,
      // Status calculado (saldo baixo, vigência a vencer, vencido): o campo
      // gravado só diz se o gestor encerrou.
      situacao: situacaoContrato(c)
    }));
  });

  constructor() {}

  abrirNovoContrato(): void {
    this.dialog.open(NovoContratoComponent, {
      width: '640px',
      maxWidth: '95vw',
      maxHeight: '90vh',
      panelClass: 'novo-contrato-dialog',
      autoFocus: true
    });
  }

  abrirDetalhe(contrato: Contrato): void {
    this.dialog.open(ContratoDetalheComponent, {
      panelClass: 'contrato-detalhe-dialog',
      data: contrato,
      position: { right: '0', top: '0' },
      height: '100vh',
      width: '320px',
      maxWidth: '100vw'
    });
  }

  private formatarVigencia(inicio: string, fim: string): string {
    return `${this.formatarData(inicio)} a ${this.formatarData(fim)}`;
  }

  private formatarData(data: string): string {
    if (!data) return '';
    const [ano, mes, dia] = data.split('-');
    return `${dia}/${mes}/${ano}`;
  }
}
