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
import { FluxoAcoesService } from '../shared/fluxo-acoes.service';
import { prazoDoChamado } from '../shared/chamado-prazo';
import { rotuloUrgencia } from '../shared/rotulos';
import { FormsModule } from '@angular/forms';
import { urlDoArquivo } from '../shared/arquivos';
import { effect, signal } from '@angular/core';
import { MatSelectModule } from '@angular/material/select';
import { MatFormFieldModule } from '@angular/material/form-field';
import { totalForaDoContrato } from '../shared/servico-os';
import { EXPLICACAO_FIM, classeDoSelo, situacaoDaOS } from '../shared/situacao-servico';
import type { ItemForaContrato, OrdemServico } from '../shared/models';

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
  private fluxo = inject(FluxoAcoesService);

  erroAcao = '';
  tecnicoSelecionado = '';

  // URLs das fotos da execução, resolvidas com o token do usuário assim que
  // a OS trouxer os caminhos (a OS é lida ao vivo; a execução pode
  // acontecer com o painel aberto).
  fotosExecucaoUrls = signal<string[]>([]);
  private fotosCarregadasDe = '';

  constructor() {
    const fotoPath = this.chamado?.fotoPath;
    if (fotoPath) {
      urlDoArquivo(fotoPath).then(url => this.fotoPedidoUrl.set(url)).catch(() => this.fotoPedidoUrl.set(null));
    }
  }

  private readonly carregarFotos = effect(() => {
    const caminhos = this.ordem.fotosExecucao ?? [];
    const chave = caminhos.join('|');
    if (chave === this.fotosCarregadasDe) return;
    this.fotosCarregadasDe = chave;
    if (!caminhos.length) { this.fotosExecucaoUrls.set([]); return; }
    Promise.all(caminhos.map(c => urlDoArquivo(c).catch(() => '')))
      .then(urls => this.fotosExecucaoUrls.set(urls.filter(Boolean)));
  });

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

  // Situação no vocabulário único do chamado e da OS (Z0.3), com quem age.
  situacao = computed(() => {
    const s = situacaoDaOS(this.dataService, this.ordemAtual(), this.auth.perfil);
    return { ...s, classe: classeDoSelo(s.chave) };
  });
  readonly explicacaoFim = EXPLICACAO_FIM;

  get orcamento() {
    return this.orcamentoAtual();
  }

  chamado = this.dataService.getChamadoById(this.ordemInicial.chamadoId);
  contrato = this.dataService.getContratoById(this.ordemInicial.contratoId);

  ativo = this.chamado?.equipamento ?? '-';
  contratoLabel = this.contrato ? `${this.contrato.numero} — ${this.contrato.fornecedor}` : '-';

  /* Pedido original (Z2.1): o que a pessoa escreveu ao abrir o chamado, para
     o técnico chegar sabendo o defeito, o lugar e quem chamar. */
  readonly rotuloUrgencia = rotuloUrgencia;
  prazo = this.chamado ? prazoDoChamado(this.chamado) : null;
  fotoPedidoUrl = signal<string | null>(null);

  // Unidade, "onde fica" e a sala do equipamento do cadastro, sem repetir.
  localPedido = (() => {
    const c = this.chamado;
    if (!c) return '';
    const ds = this.dataService;
    const equipamento = c.equipamentoId ? ds.getEquipamentoById(c.equipamentoId) : undefined;
    const sala = equipamento ? ds.getSalaById(equipamento.salaId)?.nome : undefined;
    const bloco = equipamento?.blocoId ? ds.getBlocoById(equipamento.blocoId)?.nome : undefined;
    const partes = [ds.getUnidadeById(c.unidadeId)?.nome, c.local || [bloco, sala].filter(Boolean).join(', ')];
    return partes.filter(Boolean).join(' · ');
  })();

  // Mesmo nome que a lista de OS mostra (Z0.4). Antes o detalhe só tinha a
  // lista de escolha filtrada pela contratada: técnico de outra contratada,
  // escolhido na Nova OS antiga, sumia daqui.
  get tecnicoNomeAtual(): string {
    const id = this.ordem.tecnicoId;
    return id ? (this.dataService.getUsuarioById(id)?.nome ?? 'Técnico sem cadastro') : 'Sem técnico designado';
  }

  get tecnicoDeOutraContratada(): boolean {
    const t = this.ordem.tecnicoId ? this.dataService.getUsuarioById(this.ordem.tecnicoId) : undefined;
    return !!t?.empresaContratadaId && !!this.ordem.empresaContratadaId && t.empresaContratadaId !== this.ordem.empresaContratadaId;
  }

  get descricaoPedido(): string {
    return this.chamado?.descricao ?? '';
  }

  get totalOrcamento(): number {
    return this.orcamento?.itens.reduce((acc, item) => acc + item.quantidade * item.precoUnitario, 0) ?? 0;
  }

  /* Itens fora do contrato (Z3.5): à parte do total do contrato. */
  get itensFora(): ItemForaContrato[] {
    return this.orcamento?.itensForaContrato ?? [];
  }

  // Depois da decisão, o total à parte conta só o que a gestão aprovou.
  get foraDecidido(): boolean {
    return this.itensFora.some(f => !!f.decisao);
  }

  get totalFora(): number {
    return totalForaDoContrato(this.orcamento, this.foraDecidido);
  }

  executadoForaDe(id: string): number | undefined {
    return this.ordem.itensForaContratoExecutados?.find(i => i.id === id)?.executado;
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

  // A lista de troca mantém o técnico atual, mesmo de outra contratada, para
  // o campo não aparecer vazio.
  opcoesTecnico = computed(() => {
    const lista = this.tecnicosDaContratada();
    const atual = this.ordemAtual().tecnicoId;
    const usuario = atual ? this.dataService.getUsuarioById(atual) : undefined;
    return usuario && !lista.some(t => t.id === usuario.id) ? [usuario, ...lista] : lista;
  });

  async designarTecnico(tecnicoId: string): Promise<void> {
    this.erroAcao = '';
    try {
      await this.dataService.atribuirTecnicoOS(this.ordem.id, tecnicoId || null);
    } catch (e) {
      this.erroAcao = e instanceof Error ? e.message : 'Não foi possível designar o técnico.';
    }
  }

  // Aprovar e rejeitar é do gestor do cliente: é o saldo do contrato dele.
  // Espelha aprovarOrcamento(): orçamento pendente numa OS que ainda espera
  // decisão (OS cancelada não aprova mais).
  podeAprovarOrcamento(): boolean {
    return this.auth.isGestor() && this.orcamento?.situacao === 'Pendente' && ['Aberta', 'Em vistoria'].includes(this.ordem.situacao);
  }

  podeRejeitarOrcamento(): boolean {
    return this.podeAprovarOrcamento();
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

  async aprovarOrcamento(): Promise<void> {
    this.erroAcao = '';
    if (await this.fluxo.aprovarOrcamento(this.ordem)) this.fechar();
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

  async executarOS(): Promise<void> {
    this.erroAcao = '';
    if (await this.fluxo.registrarServico(this.ordem)) this.fechar();
  }
}
