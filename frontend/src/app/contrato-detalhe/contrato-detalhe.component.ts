import { Component, Inject, computed, inject } from '@angular/core';
import { IconComponent } from '../shared/icon/icon.component';
import { FlowButtonComponent } from '../shared/flow-button/flow-button.component';
import { MatCardModule } from '@angular/material/card';
import { MatButtonModule } from '@angular/material/button';
import { MatDividerModule } from '@angular/material/divider';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { MatTableModule } from '@angular/material/table';
import { MatTooltipModule } from '@angular/material/tooltip';
import { DatePipe, DecimalPipe } from '@angular/common';
import { MAT_DIALOG_DATA, MatDialog, MatDialogRef } from '@angular/material/dialog';
import { DataService } from '../shared/data.service';
import { DialogoService } from '../shared/dialogo/dialogo.service';
import { UiFeedbackService } from '../shared/ui-feedback.service';
import { AuthService } from '../shared/auth.service';
import { EXPLICACAO_SALDO_BAIXO, itemComSaldoBaixo, situacaoContrato } from '../shared/contrato-status';
import { FORMULA_UTILIZACAO_CONTRATO, avisoContaNaoFecha, contaSaldo, utilizacaoEmValor } from '../shared/saldo';
import { OsDetalheComponent } from '../os-detalhe/os-detalhe.component';
import { ItemContratoFormComponent } from '../item-contrato-form/item-contrato-form.component';
import { AditivoContratoFormComponent } from '../aditivo-contrato-form/aditivo-contrato-form.component';
import { HistoricoRegistroComponent } from '../shared/historico-registro/historico-registro.component';
import { LegendaSaldoComponent } from '../shared/legenda-saldo/legenda-saldo.component';
import { situacaoDaOS as situacaoDaOSServico } from '../shared/situacao-servico';
import type { Contrato, ItemContrato, OrdemServico } from '../shared/models';

@Component({
  selector: 'app-contrato-detalhe',
  imports: [DecimalPipe, 
    MatCardModule,
    MatButtonModule,
    IconComponent,
    FlowButtonComponent,
    MatDividerModule,
    MatProgressBarModule,
    MatTableModule,
    MatTooltipModule,
    DatePipe,
    HistoricoRegistroComponent,
    LegendaSaldoComponent
  ],
  templateUrl: './contrato-detalhe.component.html',
  styleUrl: './contrato-detalhe.component.scss'
})
export class ContratoDetalheComponent {
  private dataService = inject(DataService);
  private dialogo = inject(DialogoService);
  private feedback = inject(UiFeedbackService);
  private auth = inject(AuthService);
  private dialog = inject(MatDialog);

  // Contrato é do cliente: só o gestor mexe em itens e registra aditivo. A
  // contratada abre este painel só pra consultar (as rules negam a escrita
  // de qualquer forma; aqui é pra não mostrar botão que vai falhar).
  podeEditar = this.auth.isGestor();
  // O histórico de ações (log) é só da gestão (firestore.rules).
  ehGestor = this.auth.isGestor();

  displayedColumns: string[] = this.podeEditar
    ? ['item', 'unidade', 'contratado', 'disponivel', 'preco', 'acoes']
    : ['item', 'unidade', 'contratado', 'disponivel', 'preco'];

  // O contrato chega pelo MAT_DIALOG_DATA como um retrato do momento em que
  // o painel abriu. Como agora dá pra editar os itens daqui, a leitura passa
  // a vir do signal: sem isso a tabela continuaria mostrando a lista antiga
  // depois de salvar.
  contratoAtual = computed(() =>
    this.dataService.contratos().find(c => c.id === this.contrato.id) ?? this.contrato
  );

  situacao = computed(() => situacaoContrato(this.contratoAtual()));

  // Quantidades de itens diferentes (un, kg, h) não se somam: o contrato
  // mostra quantos itens estão com saldo baixo e a utilização em reais.
  itensSaldoBaixo = computed(() => this.contratoAtual().itens.filter(itemComSaldoBaixo).length);
  readonly explicacaoSaldoBaixo = EXPLICACAO_SALDO_BAIXO;
  readonly formulaUtilizacao = FORMULA_UTILIZACAO_CONTRATO;
  utilizacaoValor = computed(() => utilizacaoEmValor(this.contratoAtual().itens));
  readonly contaSaldo = contaSaldo;
  readonly avisoContaNaoFecha = avisoContaNaoFecha;
  readonly saldoBaixo = itemComSaldoBaixo;

  ordensDoContrato = computed(() => this.dataService.ordensServico().filter(os => os.contratoId === this.contrato.id));

  // Situação da OS no vocabulário único do chamado e da OS (Z0.3).
  situacaoDaOS(os: OrdemServico): string {
    return situacaoDaOSServico(this.dataService, os).rotulo;
  }
  temOS = computed(() => this.ordensDoContrato().length > 0);

  constructor(
    private dialogRef: MatDialogRef<ContratoDetalheComponent>,
    @Inject(MAT_DIALOG_DATA) public contrato: Contrato
  ) {}

  fechar(): void {
    this.dialogRef.close();
  }

  abrirNovoItem(): void {
    this.dialog.open(ItemContratoFormComponent, {
      width: '560px',
      maxWidth: '95vw',
      maxHeight: '90vh',
      panelClass: 'usuario-form-dialog',
      autoFocus: true,
      data: { contrato: this.contratoAtual() }
    });
  }

  editarItem(item: ItemContrato): void {
    this.dialog.open(ItemContratoFormComponent, {
      width: '560px',
      maxWidth: '95vw',
      maxHeight: '90vh',
      panelClass: 'usuario-form-dialog',
      autoFocus: true,
      data: { contrato: this.contratoAtual(), item }
    });
  }

  abrirAditivo(): void {
    this.dialog.open(AditivoContratoFormComponent, {
      width: '640px',
      maxWidth: '95vw',
      maxHeight: '90vh',
      panelClass: 'usuario-form-dialog',
      autoFocus: true,
      data: { contrato: this.contratoAtual() }
    });
  }

  async excluirItem(item: ItemContrato): Promise<void> {
    if (!(await this.dialogo.excluir(`Remover o item "${item.nome}"?`, `Ele sai do contrato ${this.contratoAtual().numero}.`))) return;

    try {
      await this.dataService.excluirItemContrato(this.contratoAtual(), item);
    } catch (e) {
      this.feedback.announce(e instanceof Error ? e.message : 'Não foi possível remover o item.', 'assertive');
    }
  }

  async encerrarContrato(): Promise<void> {
    const c = this.contratoAtual();
    const motivo = await this.dialogo.perguntar(`Encerrar o contrato ${c.numero}?`, 'Motivo', {
      mensagem: 'O saldo livre restante é zerado e OS ainda em orçamento são canceladas (os chamados voltam a Aberto). OS aprovadas precisam ser executadas ou canceladas antes.',
      confirmar: 'Encerrar contrato',
      perigo: true
    });
    if (motivo === null) return;
    try {
      const r = await this.dataService.encerrarContrato(c.id, motivo);
      if (r.osCanceladas.length) this.feedback.announce(`OS canceladas: ${r.osCanceladas.join(', ')}.`);
    } catch (e) {
      this.feedback.announce(e instanceof Error ? e.message : 'Não foi possível encerrar o contrato.', 'assertive');
    }
  }

  abrirOS(os: OrdemServico): void {
    this.dialog.open(OsDetalheComponent, {
      panelClass: 'os-detalhe-dialog',
      data: os,
      position: { right: '0', top: '0' },
      height: '100vh',
      width: '320px',
      maxWidth: '100vw'
    });
  }

  percentualUtilizado(): number {
    return this.utilizacaoValor() ?? 0;
  }

  formatarMoeda(valor: number): string {
    return valor.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
  }
}
