import { Component, computed, inject } from '@angular/core';
import { IconComponent } from '../shared/icon/icon.component';
import { FlowButtonComponent } from '../shared/flow-button/flow-button.component';
import { MatCardModule } from '@angular/material/card';
import { MatTableModule } from '@angular/material/table';
import { MatButtonModule } from '@angular/material/button';
import { MatDialog, MatDialogModule } from '@angular/material/dialog';
import { MatTooltipModule } from '@angular/material/tooltip';
import { NovoContratoComponent } from '../novo-contrato/novo-contrato.component';
import { ContratoDetalheComponent } from '../contrato-detalhe/contrato-detalhe.component';
import { DataService } from '../shared/data.service';
import { AuthService } from '../shared/auth.service';
import { EXPLICACAO_SALDO_BAIXO, itemComSaldoBaixo, situacaoContrato } from '../shared/contrato-status';
import { abrirItemDaUrl } from '../shared/abrir-pela-url';
import { RelatorioMensalDialogComponent } from '../relatorio-mensal/relatorio-mensal-dialog.component';
import type { Contrato } from '../shared/models';

@Component({
  selector: 'app-contratos',
  imports: [MatCardModule, MatTableModule, MatButtonModule, IconComponent,
    FlowButtonComponent, MatDialogModule, MatTooltipModule],
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

  displayedColumns: string[] = ['numero', 'fornecedor', 'vigencia', 'itens', 'saldoBaixo', 'status', 'acoes'];
  readonly explicacaoSaldoBaixo = `${EXPLICACAO_SALDO_BAIXO} É a mesma regra que deixa o contrato "Crítico".`;

  contratos = this.dataService.contratos;

  contratosView = computed(() => {
    return this.contratos().map(c => ({
      ...c,
      vigencia: this.formatarVigencia(c.vigenciaInicio, c.vigenciaFim),
      // Contar itens, não somar quantidades: um contrato mistura un, kg e h,
      // e "1050 livres" somando lâmpadas com quilos de gás não diz nada.
      itensSaldoBaixo: c.itens.filter(itemComSaldoBaixo).length,
      itensCount: c.itens.length,
      // Status calculado (saldo baixo, vigência a vencer, vencido): o campo
      // gravado só diz se o gestor encerrou.
      situacao: situacaoContrato(c)
    }));
  });

  constructor() {
    // Notificação de contrato: ?contrato=ID abre o painel dele.
    abrirItemDaUrl('contrato', id => this.dataService.getContratoById(id), c => this.abrirDetalhe(c));
  }

  abrirNovoContrato(): void {
    this.dialog.open(NovoContratoComponent, {
      width: '640px',
      maxWidth: '95vw',
      maxHeight: '90vh',
      panelClass: 'novo-contrato-dialog',
      autoFocus: true
    });
  }

  // Relatório do mês em PDF (Z3.2). A contratada recebe só os contratos dela.
  abrirRelatorio(): void {
    this.dialog.open(RelatorioMensalDialogComponent, {
      panelClass: 'usuario-form-dialog',
      width: '480px',
      maxWidth: '95vw',
      maxHeight: '90vh',
      autoFocus: false
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
