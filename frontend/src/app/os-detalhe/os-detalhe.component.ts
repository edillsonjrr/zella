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
import { ExecutarOsDialogComponent, type ExecutarOsResultado } from './executar-os-dialog.component';
import { AprovarOrcamentoDialogComponent, type AprovarOrcamentoResultado } from './aprovar-orcamento-dialog.component';
import { UiFeedbackService } from '../shared/ui-feedback.service';
import { FormsModule } from '@angular/forms';
import { MatSelectModule } from '@angular/material/select';
import { MatFormFieldModule } from '@angular/material/form-field';
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
    FormsModule,
    MatSelectModule,
    MatFormFieldModule,
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
  private feedback = inject(UiFeedbackService);

  erroAcao = '';
  tecnicoSelecionado = '';

  // A OS chega pelo MAT_DIALOG_DATA como retrato do momento em que o painel
  // abriu. Como as ações daqui (orçamento, aprovação, execução) mudam a
  // própria OS, a leitura vem do signal: sem isso o status e os botões
  // continuariam mostrando o estado antigo depois da ação.
  private readonly ordemInicial: OrdemServico = inject(MAT_DIALOG_DATA);
  private readonly ordemAtual = computed(() => this.dataService.getOSById(this.ordemInicial.id) ?? this.ordemInicial);
  private readonly orcamentoAtual = computed(() => this.dataService.getOrcamentoByOS(this.ordemInicial.id));

  // Memoizado: um getter que devolvesse array novo a cada detecção faria a
  // mat-table re-renderizar sem parar.
  private readonly colunasComExecucao = ['item', 'quantidade', 'precoUnitario', 'executado'];
  private readonly colunasSemExecucao = ['item', 'quantidade', 'precoUnitario'];
  get displayedColumns(): string[] {
    return this.ordem.itensExecutados?.length ? this.colunasComExecucao : this.colunasSemExecucao;
  }

  executadoDe(itemContratoId: string): number | undefined {
    return this.ordem.itensExecutados?.find(i => i.itemContratoId === itemContratoId)?.executado;
  }

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

  get tecnicoNomeAtual(): string {
    const id = this.ordem.tecnicoId;
    return id ? (this.dataService.getUsuarioById(id)?.nome ?? '-') : 'Sem técnico designado';
  }

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
      this.designadoAMim() &&
      ['Aberta', 'Em vistoria', 'Rejeitada'].includes(this.ordem.situacao);
  }

  // Técnico só age na OS designada a ele (ou sem técnico). Espelha
  // exigirTecnicoDesignado() no backend.
  designadoAMim(): boolean {
    if (!this.auth.isTecnico()) return true;
    const t = this.ordem.tecnicoId;
    return !t || t === this.auth.usuarioLogado().id;
  }

  // Gestor do cliente e gestor da contratada designam/trocam o técnico
  // enquanto a OS não foi executada.
  podeDesignarTecnico(): boolean {
    return (this.auth.isGestor() || this.auth.isGestorContratado()) &&
      !['Executada', 'Encerrada', 'Cancelada'].includes(this.ordem.situacao);
  }

  tecnicosDaContratada = computed(() =>
    this.dataService.usuarios().filter(u => u.perfil === 'tecnico' && (!this.ordem.empresaContratadaId || u.empresaContratadaId === this.ordem.empresaContratadaId))
  );

  async designarTecnico(tecnicoId: string): Promise<void> {
    this.erroAcao = '';
    try {
      await this.dataService.atribuirTecnicoOS(this.ordem.id, tecnicoId || null);
    } catch (e) {
      this.erroAcao = e instanceof Error ? e.message : 'Não foi possível designar o técnico.';
    }
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
      this.designadoAMim() &&
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
    const orcamento = this.orcamento;
    if (!orcamento) return;
    const ref = this.dialog.open(AprovarOrcamentoDialogComponent, {
      panelClass: 'usuario-form-dialog',
      width: '520px',
      maxWidth: '95vw',
      data: { numeroOS: this.ordem.numero, orcamento }
    });
    ref.afterClosed().subscribe(async (r: AprovarOrcamentoResultado | undefined) => {
      if (!r) return;
      this.erroAcao = '';
      try {
        await this.dataService.aprovarOrcamento(orcamento.id, r.ajustes, r.observacao);
        this.fechar();
      } catch (e) {
        this.erroAcao = e instanceof Error ? e.message : 'Não foi possível aprovar.';
      }
    });
  }

  async rejeitarOrcamento(): Promise<void> {
    if (!this.orcamento) return;
    this.erroAcao = '';
    try {
      await this.dataService.rejeitarOrcamento(this.orcamento.id);
      this.fechar();
    } catch (e) {
      this.erroAcao = e instanceof Error ? e.message : 'Não foi possível rejeitar.';
    }
  }

  executarOS(): void {
    const orcamento = this.orcamento;
    if (!orcamento) {
      // OS aprovada sem orçamento carregado: executa por inteiro.
      this.executar();
      return;
    }
    const ref = this.dialog.open(ExecutarOsDialogComponent, {
      panelClass: 'usuario-form-dialog',
      width: '520px',
      maxWidth: '95vw',
      data: { numeroOS: this.ordem.numero, orcamento }
    });
    ref.afterClosed().subscribe((r: ExecutarOsResultado | undefined) => {
      if (r) this.executar(r);
    });
  }

  private async executar(r?: ExecutarOsResultado): Promise<void> {
    this.erroAcao = '';
    try {
      await this.dataService.executarOS(this.ordem.id, r?.itens, r?.observacao);
      this.fechar();
    } catch (e) {
      this.erroAcao = e instanceof Error ? e.message : 'Não foi possível executar a OS.';
    }
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
