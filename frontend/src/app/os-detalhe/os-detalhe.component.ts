import { Component, computed, inject } from '@angular/core';
import { DatePipe, CurrencyPipe } from '@angular/common';
import { IconComponent } from '../shared/icon/icon.component';
import { FlowButtonComponent } from '../shared/flow-button/flow-button.component';
import { NgClass } from '@angular/common';
import { MatCardModule } from '@angular/material/card';
import { MatButtonModule } from '@angular/material/button';
import { MatDividerModule } from '@angular/material/divider';
import { MatTableModule } from '@angular/material/table';
import { MAT_DIALOG_DATA, MatDialogRef, MatDialog } from '@angular/material/dialog';
import { DataService } from '../shared/data.service';
import { HistoricoRegistroComponent } from '../shared/historico-registro/historico-registro.component';
import { AuthService } from '../shared/auth.service';
import { OrcamentoComponent } from '../orcamento/orcamento.component';
import type { OrdemServico } from '../shared/models';

@Component({
  selector: 'app-os-detalhe',
  imports: [
    NgClass,
    DatePipe,
    CurrencyPipe,
    MatCardModule,
    MatButtonModule,
    IconComponent,
    FlowButtonComponent,
    MatDividerModule,
    MatTableModule,
    HistoricoRegistroComponent
  ],
  templateUrl: './os-detalhe.component.html',
  styleUrl: './os-detalhe.component.scss'
})
export class OsDetalheComponent {
  private dialogRef = inject(MatDialogRef<OsDetalheComponent>);
  private dataService = inject(DataService);
  private auth = inject(AuthService);
  private dialog = inject(MatDialog);

  // A OS chega pelo MAT_DIALOG_DATA como retrato do momento em que o painel
  // abriu. Como as ações daqui (orçamento, aprovação, execução) mudam a
  // própria OS, a leitura vem do signal: sem isso o status e os botões
  // continuariam mostrando o estado antigo depois da ação.
  private readonly ordemInicial: OrdemServico = inject(MAT_DIALOG_DATA);
  private readonly ordemAtual = computed(() => this.dataService.getOSById(this.ordemInicial.id) ?? this.ordemInicial);
  private readonly orcamentoAtual = computed(() => this.dataService.getOrcamentoByOS(this.ordemInicial.id));

  displayedColumns: string[] = ['item', 'quantidade', 'precoUnitario'];

  get ordem(): OrdemServico {
    return this.ordemAtual();
  }

  get orcamento() {
    return this.orcamentoAtual();
  }

  chamado = this.dataService.getChamadoById(this.ordemInicial.chamadoId);
  contrato = this.dataService.getContratoById(this.ordemInicial.contratoId);
  tecnico = this.dataService.getUsuarioById(this.ordemInicial.tecnicoId ?? '');

  ativo = this.chamado?.equipamento ?? '-';
  contratoLabel = this.contrato ? `${this.contrato.numero} — ${this.contrato.fornecedor}` : '-';
  tecnicoNome = this.tecnico?.nome ?? '-';

  get totalOrcamento(): number {
    return this.orcamento?.itens.reduce((acc, item) => acc + item.quantidade * item.precoUnitario, 0) ?? 0;
  }

  // Texto do botão de orçamento: depois de uma recusa (ou substituição) o
  // que se faz é um orçamento novo, não uma edição do antigo.
  get rotuloBotaoOrcamento(): string {
    const situacao = this.orcamento?.situacao;
    if (!this.orcamento) return 'Criar orçamento';
    if (situacao === 'Rejeitado' || situacao === 'Substituído') return 'Novo orçamento';
    return 'Editar orçamento';
  }

  fechar(): void {
    this.dialogRef.close();
  }

  // Espelha as pré-condições de criarOrcamento: Rejeitada entra porque um
  // orçamento recusado precisa poder ser refeito, senão a OS fica presa.
  podeCriarOrcamento(): boolean {
    return (this.auth.isTecnico() || this.auth.isGestorContratado()) &&
      ['Aberta', 'Em vistoria', 'Rejeitada'].includes(this.ordem.situacao);
  }

  // Aprovar e rejeitar é do gestor do cliente: é o saldo do contrato dele.
  podeAprovarOrcamento(): boolean {
    return this.auth.isGestor() && this.orcamento?.situacao === 'Pendente';
  }

  podeRejeitarOrcamento(): boolean {
    return this.auth.isGestor() && this.orcamento?.situacao === 'Pendente';
  }

  podeExecutar(): boolean {
    return (this.auth.isTecnico() || this.auth.isGestorContratado()) &&
      this.ordem.situacao === 'Aprovada';
  }

  abrirOrcamento(): void {
    this.dialog.open(OrcamentoComponent, {
      panelClass: 'orcamento-dialog',
      data: { os: this.ordem },
      position: { right: '0', top: '0' },
      height: '100vh',
      width: '420px',
      maxWidth: '100vw'
    });
  }

  aprovarOrcamento(): void {
    if (this.orcamento) {
      this.dataService.aprovarOrcamento(this.orcamento.id);
    }
    this.fechar();
  }

  rejeitarOrcamento(): void {
    if (this.orcamento) {
      this.dataService.rejeitarOrcamento(this.orcamento.id);
    }
    this.fechar();
  }

  executarOS(): void {
    this.dataService.executarOS(this.ordem.id);
    this.fechar();
  }

  badgeClass(status: string): string {
    switch (status) {
      case 'Aberta': return 'badge--aberta';
      case 'Em vistoria': return 'badge--vistoria';
      case 'Aprovada': return 'badge--aprovada';
      case 'Rejeitada': return 'badge--rejeitada';
      case 'Executada': return 'badge--executada';
      case 'Encerrada': return 'badge--encerrada';
      case 'Cancelada': return 'badge--rejeitada';
      default: return '';
    }
  }

  statusIcon(status: string): string {
    switch (status) {
      case 'Aberta': return 'radio_button_unchecked';
      case 'Em vistoria': return 'search';
      case 'Aprovada': return 'check_circle';
      case 'Rejeitada': return 'cancel';
      case 'Executada': return 'check_circle';
      case 'Encerrada': return 'lock';
      default: return 'help';
    }
  }
}
