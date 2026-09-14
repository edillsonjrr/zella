import { Component, signal, computed, inject } from '@angular/core';
import { IconComponent } from '../shared/icon/icon.component';
import { FlowButtonComponent } from '../shared/flow-button/flow-button.component';
import { MatButtonModule } from '@angular/material/button';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { MatMenuModule } from '@angular/material/menu';
import { MatCardModule } from '@angular/material/card';
import { MatDialog, MatDialogModule } from '@angular/material/dialog';
import { NovaOsComponent } from '../nova-os/nova-os.component';
import { NovoChamadoComponent } from '../novo-chamado/novo-chamado.component';
import { ContratoDetalheComponent } from '../contrato-detalhe/contrato-detalhe.component';
import { ChamadoDetalheComponent } from '../chamado-detalhe/chamado-detalhe.component';
import { OrcamentoComponent } from '../orcamento/orcamento.component';
import { ChamadosQuadroComponent, type TransicaoChamado } from '../chamados-quadro/chamados-quadro.component';
import { DataService } from '../shared/data.service';
import { UiFeedbackService } from '../shared/ui-feedback.service';
import type { Chamado, OrdemServico, Contrato } from '../shared/models';

interface DashboardChamado extends Chamado {
  dataFormatada: string;
  responsavelNome: string;
  responsavelIniciais: string;
  responsavelCorToken: string;
  unidadeSigla: string;
  unidadeNome: string;
  contratoNumero?: string;
  prioridade: string;
  prioridadeClasse: string;
  prioridadeIcone: string;
  statusClasse: string;
  statusIcone: string;
  contratoId?: string;
  osStatus?: string;
}

interface GrupoChamados {
  valor: string;
  corClasse: string;
  contagem: number;
  collapsed: boolean;
  chamados: DashboardChamado[];
}

@Component({
  selector: 'app-dashboard',
  imports: [
    IconComponent,
    FlowButtonComponent,
    MatButtonModule,
    MatCheckboxModule,
    MatMenuModule,
    MatCardModule,
    MatDialogModule,
    ChamadosQuadroComponent
  ],
  templateUrl: './dashboard.component.html',
  styleUrl: './dashboard.component.scss'
})
export class DashboardComponent {
  private dialog = inject(MatDialog);
  private feedback = inject(UiFeedbackService);
  dataService = inject(DataService);

  abaAtiva = 'Lista';
  abas = ['Lista', 'Quadro'];

  agrupamentoAtivo = signal(true);
  criterioAgrupamento = signal<'status' | 'unidade' | 'contrato'>('status');
  filtroStatus = signal<string | null>(null);
  termoBusca = signal('');
  ordenacaoAsc = signal(true);

  chamadosReais = this.dataService.chamados;
  ordensReais = this.dataService.ordensServico;
  contratos = this.dataService.contratos;

  resumo = computed(() => {
    const chamados = this.chamadosReais();
    const ordens = this.ordensReais();
    return {
      chamadosTotal: chamados.length,
      chamadosAbertos: chamados.filter(c => c.situacao === 'Aberto').length,
      chamadosEmAtendimento: chamados.filter(c => c.situacao === 'Em atendimento').length,
      chamadosFinalizados: chamados.filter(c => c.situacao === 'Convertido').length,
      osTotal: ordens.length,
      osAbertas: ordens.filter(o => o.situacao === 'Aberta' || o.situacao === 'Em vistoria').length,
      osAprovadas: ordens.filter(o => o.situacao === 'Aprovada').length,
      osExecutadas: ordens.filter(o => o.situacao === 'Executada' || o.situacao === 'Encerrada').length
    };
  });

  private avatarTokens = ['primary-500', 'success-500', 'info-500', 'warning-500', 'danger-500', 'primary-600'];

  private corAvatarPorNome(nome: string): string {
    let hash = 0;
    for (let i = 0; i < nome.length; i++) hash = nome.charCodeAt(i) + ((hash << 5) - hash);
    return this.avatarTokens[Math.abs(hash) % this.avatarTokens.length];
  }

  private prioridadePorStatus(status: string): { prioridade: string; classe: string; icone: string } {
    switch (status) {
      case 'Aberto': return { prioridade: 'Alta', classe: 'danger', icone: 'flag' };
      case 'Em atendimento': return { prioridade: 'Média', classe: 'warning', icone: 'clock' };
      case 'A ser finalizado': return { prioridade: 'Alta', classe: 'warning', icone: 'warning' };
      default: return { prioridade: 'Baixa', classe: 'neutral', icone: 'minus_circle' };
    }
  }

  private toView(chamado: Chamado): DashboardChamado {
    const responsavel = chamado.responsavelId ? this.dataService.getUsuarioById(chamado.responsavelId) : undefined;
    const unidade = this.dataService.getUnidadeById(chamado.unidadeId);
    const os = chamado.ordemServicoId ? this.dataService.getOSById(chamado.ordemServicoId) : undefined;
    const contrato = os?.contratoId ? this.dataService.getContratoById(os.contratoId) : undefined;
    const nomeResponsavel = responsavel?.nome ?? 'Não atribuído';
    const prioridade = this.prioridadePorStatus(chamado.status);

    return {
      ...chamado,
      dataFormatada: this.formatarData(chamado.dataCriacao),
      responsavelNome: nomeResponsavel,
      responsavelIniciais: responsavel ? nomeResponsavel.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase() : '—',
      responsavelCorToken: responsavel ? this.corAvatarPorNome(nomeResponsavel) : 'neutral',
      unidadeSigla: unidade?.sigla ?? '',
      unidadeNome: unidade?.nome ?? 'Sem unidade',
      contratoNumero: contrato?.numero,
      prioridade: prioridade.prioridade,
      prioridadeClasse: prioridade.classe,
      prioridadeIcone: prioridade.icone,
      statusClasse: this.statusClasse(chamado.status),
      statusIcone: this.statusIcone(chamado.status),
      contratoId: os?.contratoId,
      osStatus: os?.situacao
    };
  }

  chamadosView = computed(() => {
    let lista = this.chamadosReais().map(c => this.toView(c));
    const status = this.filtroStatus();
    if (status) {
      lista = lista.filter(c => c.status === status);
    }
    const busca = this.termoBusca().trim().toLowerCase();
    if (busca) {
      lista = lista.filter(c =>
        c.numero.toLowerCase().includes(busca) ||
        c.equipamento.toLowerCase().includes(busca) ||
        c.responsavelNome.toLowerCase().includes(busca) ||
        c.unidadeSigla.toLowerCase().includes(busca)
      );
    }
    lista = [...lista].sort((a, b) => {
      const dataA = new Date(a.dataCriacao).getTime();
      const dataB = new Date(b.dataCriacao).getTime();
      return this.ordenacaoAsc() ? dataA - dataB : dataB - dataA;
    });
    return lista;
  });

  grupos = computed<GrupoChamados[]>(() => {
    const chamados = this.chamadosView();
    if (!this.agrupamentoAtivo()) {
      return [{
        valor: 'Todos os chamados',
        corClasse: 'primary',
        contagem: chamados.length,
        collapsed: false,
        chamados
      }];
    }

    const criterio = this.criterioAgrupamento();

    if (criterio === 'unidade') {
      return this.agruparPor(chamados, c => c.unidadeNome, 'neutral');
    }
    if (criterio === 'contrato') {
      return this.agruparPor(chamados, c => c.contratoNumero ?? 'Sem contrato', 'neutral');
    }

    const mapa = new Map<string, GrupoChamados>();
    const ordemStatus = ['Aberto', 'Em atendimento', 'Em orçamento', 'Orçamento aprovado', 'A ser finalizado', 'Executado', 'Encerrado'];

    for (const chamado of chamados) {
      const chave = chamado.status;
      if (!mapa.has(chave)) {
      mapa.set(chave, {
        valor: chave,
        corClasse: this.statusClasse(chave),
        contagem: 0,
        collapsed: false,
        chamados: []
      });
      }
      const grupo = mapa.get(chave)!;
      grupo.chamados.push(chamado);
      grupo.contagem = grupo.chamados.length;
    }

    return ordemStatus
      .filter(s => mapa.has(s))
      .map(s => mapa.get(s)!);
  });

  private agruparPor(chamados: DashboardChamado[], chaveFn: (c: DashboardChamado) => string, corClasse: string): GrupoChamados[] {
    const mapa = new Map<string, GrupoChamados>();
    for (const chamado of chamados) {
      const chave = chaveFn(chamado);
      if (!mapa.has(chave)) {
        mapa.set(chave, { valor: chave, corClasse, contagem: 0, collapsed: false, chamados: [] });
      }
      const grupo = mapa.get(chave)!;
      grupo.chamados.push(chamado);
      grupo.contagem = grupo.chamados.length;
    }
    return [...mapa.values()].sort((a, b) => a.valor.localeCompare(b.valor));
  }

  filtrosAtivos = computed(() => !!this.filtroStatus());

  constructor() {}

  selecionarAba(aba: string): void {
    this.abaAtiva = aba;
  }

  removerAgrupamento(): void {
    this.agrupamentoAtivo.set(false);
  }

  ativarAgrupamento(): void {
    this.agrupamentoAtivo.set(true);
  }

  selecionarCriterioAgrupamento(criterio: 'status' | 'unidade' | 'contrato'): void {
    this.criterioAgrupamento.set(criterio);
    this.agrupamentoAtivo.set(true);
  }

  toggleGrupo(grupo: GrupoChamados): void {
    grupo.collapsed = !grupo.collapsed;
  }

  selecionarFiltroStatus(status: string | null): void {
    this.filtroStatus.set(status);
  }

  toggleOrdenacao(): void {
    this.ordenacaoAsc.update(v => !v);
  }

  atualizarBusca(valor: string): void {
    this.termoBusca.set(valor);
  }

  limparBusca(): void {
    this.termoBusca.set('');
  }

  limparFiltros(): void {
    this.filtroStatus.set(null);
  }

  // Soltar um card no quadro não grava status: dispara a ação de negócio que
  // leva o chamado àquela coluna. As colunas que exigem dados extras abrem o
  // modal correspondente já apontado para o chamado arrastado.
  async aplicarTransicao(evento: TransicaoChamado): Promise<void> {
    const { chamado, acao } = evento;
    const os = chamado.ordemServicoId ? this.dataService.getOSById(chamado.ordemServicoId) : undefined;

    try {
      switch (acao) {
        case 'criar-os':
          this.dialog.open(NovaOsComponent, {
            width: '640px',
            maxWidth: '95vw',
            maxHeight: '90vh',
            panelClass: 'nova-os-dialog',
            autoFocus: true,
            data: {
              chamadoId: chamado.id,
              equipamento: chamado.equipamento,
              serie: chamado.numeroSerie
            }
          });
          return;

        case 'criar-orcamento':
          if (!os) return;
          this.dialog.open(OrcamentoComponent, {
            panelClass: 'orcamento-dialog',
            data: { os },
            position: { right: '0', top: '0' },
            height: '100vh',
            width: '420px',
            maxWidth: '100vw'
          });
          return;

        case 'aprovar-orcamento': {
          const orcamento = os ? this.dataService.getOrcamentoByOS(os.id) : undefined;
          if (orcamento) await this.dataService.aprovarOrcamento(orcamento.id);
          return;
        }

        case 'executar-os':
          if (os) await this.dataService.executarOS(os.id);
          return;

        case 'encerrar-chamado':
          await this.dataService.encerrarChamado(chamado.id);
          return;
      }
    } catch (erro) {
      const mensagem = erro instanceof Error ? erro.message : 'Não foi possível mover o chamado.';
      this.feedback.announce(mensagem, 'assertive');
    }
  }

  abrirNovoChamado(): void {
    this.dialog.open(NovoChamadoComponent, {
      width: '560px',
      maxWidth: '95vw',
      maxHeight: '90vh',
      panelClass: 'novo-chamado-dialog',
      autoFocus: true
    });
  }

  abrirContrato(contratoId: string | undefined): void {
    if (!contratoId) return;
    const contrato = this.dataService.getContratoById(contratoId);
    if (!contrato) return;

    this.dialog.open(ContratoDetalheComponent, {
      panelClass: 'contrato-detalhe-dialog',
      data: contrato,
      position: { right: '0', top: '0' },
      height: '100vh',
      width: '380px',
      maxWidth: '100vw'
    });
  }

  abrirChamado(chamado: DashboardChamado): void {
    this.dialog.open(ChamadoDetalheComponent, {
      panelClass: 'chamado-detalhe-dialog',
      data: chamado,
      position: { right: '0', top: '0' },
      height: '100vh',
      width: '320px',
      maxWidth: '100vw'
    });
  }

  abrirNovaOs(): void {
    this.dialog.open(NovaOsComponent, {
      width: '640px',
      maxWidth: '95vw',
      maxHeight: '90vh',
      panelClass: 'nova-os-dialog',
      autoFocus: true
    });
  }

  private formatadorData = new Intl.DateTimeFormat('pt-BR');

  private formatarData(data: string): string {
    if (!data) return '';
    const [ano, mes, dia] = data.split('-').map(Number);
    return this.formatadorData.format(new Date(ano, mes - 1, dia));
  }

  private statusClasse(status: string): string {
    switch (status) {
      case 'Aberto': return 'info';
      case 'Em atendimento': return 'warning';
      case 'Em orçamento': return 'primary';
      case 'Orçamento aprovado': return 'success';
      case 'A ser finalizado': return 'warning-accent';
      case 'Executado': return 'primary-accent';
      case 'Encerrado': return 'success';
      default: return 'neutral';
    }
  }

  private statusIcone(status: string): string {
    switch (status) {
      case 'Aberto': return 'radio_button_checked';
      case 'Em atendimento': return 'engineering';
      case 'Em orçamento': return 'request_quote';
      case 'Orçamento aprovado': return 'check_circle';
      case 'A ser finalizado': return 'pending_actions';
      case 'Executado': return 'construction';
      case 'Encerrado': return 'task_alt';
      default: return 'help';
    }
  }
}
