import { Component, computed, inject, signal } from '@angular/core';
import { IconComponent } from '../shared/icon/icon.component';
import { FlowButtonComponent } from '../shared/flow-button/flow-button.component';
import { NgClass, DatePipe } from '@angular/common';
import { MatCardModule } from '@angular/material/card';
import { MatTableModule } from '@angular/material/table';
import { MatButtonModule } from '@angular/material/button';
import { MatDialog, MatDialogModule } from '@angular/material/dialog';
import { MatTabsModule } from '@angular/material/tabs';
import { NovaOsComponent } from '../nova-os/nova-os.component';
import { OsDetalheComponent } from '../os-detalhe/os-detalhe.component';
import { OrdensServicoQuadroComponent } from '../ordens-servico-quadro/ordens-servico-quadro.component';
import { DataService } from '../shared/data.service';
import { AuthService } from '../shared/auth.service';
import { FluxoAcoesService } from '../shared/fluxo-acoes.service';
import { abrirItemDaUrl } from '../shared/abrir-pela-url';
import { prazoDoChamado, type PrazoChamado } from '../shared/chamado-prazo';
import { nomeUnidade } from '../shared/rotulos';
import { classeDoSelo, situacaoDaOS, type SituacaoServico } from '../shared/situacao-servico';
import type { OrdemServico } from '../shared/models';

interface OrdemView extends OrdemServico {
  // Número do chamado que deu origem à OS (a numeração é separada).
  chamadoNumero: string;
  // Data limite do chamado (AAAA-MM-DD), para o técnico ver o mais urgente primeiro.
  vencimento: string;
  ativo: string;
  local: string;
  descricao: string;
  contrato: string;
  contratoNumero: string;
  contratada: string;
  temTecnico: boolean;
  tecnico: string;
  orcamentoStatus: string;
  orcamentoTem: boolean;
  // Situação no vocabulário único (Z0.3) e a classe do selo.
  situacaoServico: SituacaoServico;
  seloClasse: string;
  data: string;
  prazo: PrazoChamado | null;
  paraExecutar: boolean;
}

@Component({
  selector: 'app-ordens-servico',
  imports: [NgClass, DatePipe, MatCardModule, MatTableModule, MatButtonModule, IconComponent,
    FlowButtonComponent, MatDialogModule, MatTabsModule, OrdensServicoQuadroComponent],
  templateUrl: './ordens-servico.component.html',
  styleUrl: './ordens-servico.component.scss'
})
export class OrdensServicoComponent {
  private dialog = inject(MatDialog);
  private dataService = inject(DataService);
  private auth = inject(AuthService);
  private fluxo = inject(FluxoAcoesService);

  // Abrir OS é só do gestor (mesma linha de
  // permissoes.ts pra 'ordens-servico/nova'). A contratada orça e executa.
  podeCriar = this.auth.isGestor();

  // Quem executa: técnico e responsável da contratada. É para eles o filtro
  // "para executar" e o botão direto no cartão.
  readonly executa = this.auth.isTecnico() || this.auth.isGestorContratado();
  readonly souTecnico = this.auth.isTecnico();
  readonly rotuloFiltro = this.souTecnico ? 'Minhas OS para executar' : 'OS para executar';

  // O técnico abre a tela já no que é dele; tira o filtro para ver todas.
  filtroParaExecutar = signal(this.souTecnico);

  displayedColumns: string[] = ['numero', 'ativo', 'contrato', 'tecnico', 'status', 'orcamento', 'data'];
  tabSelecionada = 0;

  ordens = this.dataService.ordensServico;
  contratos = this.dataService.contratos;

  constructor() {
    // Notificação de OS: ?os=ID abre o painel dela.
    abrirItemDaUrl('os', id => this.dataService.getOSById(id), os => this.abrirDetalhe(os));
  }

  // Espelha exigirTecnicoDesignado(): técnico executa a OS designada a ele
  // ou sem técnico; o responsável da contratada executa qualquer uma dela.
  private paraExecutar(os: OrdemServico): boolean {
    if (!this.executa || os.situacao !== 'Aprovada') return false;
    if (!this.souTecnico) return true;
    return !os.tecnicoId || os.tecnicoId === this.auth.usuarioLogado().id;
  }

  ordensView = computed<OrdemView[]>(() => {
    return this.ordens()
      .map(os => {
        const chamado = this.dataService.getChamadoById(os.chamadoId);
        const contrato = this.dataService.getContratoById(os.contratoId);
        const tecnico = this.dataService.getUsuarioById(os.tecnicoId ?? '');
        const orcamento = this.dataService.getOrcamentoByOS(os.id);
        const situacaoServico = situacaoDaOS(this.dataService, os, this.auth.perfil);
        const unidade = this.dataService.getUnidadeById(os.unidadeId ?? chamado?.unidadeId ?? '');
        return {
          ...os,
          ativo: chamado?.equipamento ?? '-',
          chamadoNumero: chamado?.numero ?? '',
          vencimento: chamado?.dataVencimento ?? '',
          local: [nomeUnidade(unidade, ''), chamado?.local].filter(Boolean).join(' · '),
          descricao: chamado?.descricao ?? '',
          contrato: contrato ? `${contrato.numero} — ${contrato.fornecedor}` : '-',
          contratoNumero: contrato?.numero ?? '-',
          contratada: contrato?.fornecedor ?? '',
          tecnico: tecnico?.nome ?? (os.tecnicoId ? '-' : 'Sem técnico'),
          temTecnico: !!tecnico,
          orcamentoStatus: this.rotuloOrcamento(orcamento?.situacao),
          orcamentoTem: !!orcamento,
          situacaoServico,
          seloClasse: classeDoSelo(situacaoServico.chave),
          data: os.dataCriacao,
          prazo: chamado && os.situacao !== 'Executada' && os.situacao !== 'Encerrada' && os.situacao !== 'Cancelada' ? prazoDoChamado(chamado) : null,
          paraExecutar: this.paraExecutar(os)
        };
      })
      // Mais recentes primeiro: é o que a pessoa procura ao abrir a lista.
      .sort((a, b) => b.dataCriacao.localeCompare(a.dataCriacao) || b.numero.localeCompare(a.numero));
  });

  totalParaExecutar = computed(() => this.ordensView().filter(o => o.paraExecutar).length);

  // Técnico: o que ele já fez, para a tela não ficar com um cartão só e para
  // ele achar a OS de ontem quando a gestão perguntar. As 6 mais recentes.
  feitasPorMim = computed(() => {
    if (!this.souTecnico) return [];
    const eu = this.auth.usuarioLogado().id;
    return this.ordensView()
      .filter(o => (o.situacao === 'Executada' || o.situacao === 'Encerrada') && (o.executadoPor === eu || o.tecnicoId === eu))
      .sort((a, b) => (b.dataExecucao ?? b.dataCriacao).localeCompare(a.dataExecucao ?? a.dataCriacao))
      .slice(0, 6);
  });

  // Quem executa vê primeiro o prazo que vence antes (o atrasado no topo).
  // Antes a lista vinha pela data de criação, e o técnico via a OS de prazo
  // 20/10 antes da de 17/10.
  private porPrazo = (a: OrdemView, b: OrdemView) =>
    (a.prazo ? 0 : 1) - (b.prazo ? 0 : 1) || (a.vencimento || '9999').localeCompare(b.vencimento || '9999') || a.numero.localeCompare(b.numero);

  // Técnico: OS da empresa dele que ainda esperam orçamento ou aprovação.
  // Ele não age nelas agora, mas sabe o que vem por aí.
  aguardandoLiberacao = computed(() => {
    if (!this.souTecnico) return [];
    const eu = this.auth.usuarioLogado().id;
    return this.ordensView()
      .filter(o => !o.paraExecutar && (o.situacao === 'Aberta' || o.situacao === 'Em vistoria') && (!o.tecnicoId || o.tecnicoId === eu))
      .sort(this.porPrazo);
  });

  ordensFiltradas = computed(() => {
    const lista = this.filtroParaExecutar() ? this.ordensView().filter(o => o.paraExecutar) : this.ordensView();
    return this.executa ? [...lista].sort(this.porPrazo) : lista;
  });

  alternarFiltro(): void {
    this.filtroParaExecutar.update(v => !v);
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

  abrirDetalhe(ordem: OrdemServico): void {
    // A view carrega campos a mais; o painel recebe só a OS.
    const os = this.dataService.getOSById(ordem.id) ?? ordem;
    this.dialog.open(OsDetalheComponent, {
      panelClass: 'os-detalhe-dialog',
      data: os,
      position: { right: '0', top: '0' },
      height: '100vh',
      width: '360px',
      maxWidth: '100vw'
    });
  }

  // Enter ou espaço no cartão abre o painel; no botão de dentro, não (o
  // evento sobe do botão e abriria as duas coisas).
  teclaNoCartao(evento: Event, ordem: OrdemServico): void {
    if (evento.target !== evento.currentTarget) return;
    evento.preventDefault();
    this.abrirDetalhe(ordem);
  }

  // Segundo toque do técnico: abre "Registrar serviço feito" direto do
  // cartão, já com o aprovado preenchido e a câmera no topo.
  registrarServico(ordem: OrdemServico, evento: Event): void {
    evento.stopPropagation();
    const os = this.dataService.getOSById(ordem.id) ?? ordem;
    this.fluxo.registrarServico(os);
  }

  // O orçamento em palavras: "Aguardando aprovação" em vez de "Pendente".
  private rotuloOrcamento(situacao: string | undefined): string {
    switch (situacao) {
      // Curto de propósito: a coluna Situação ao lado já diz "Aguardando
      // aprovação", e o rótulo longo cortava a coluna no computador.
      case 'Pendente': return 'A aprovar';
      case 'Aprovado': return 'Aprovado';
      case 'Rejeitado': return 'Recusado';
      case 'Substituído': return 'Trocado';
      default: return 'Não enviado';
    }
  }

  orcamentoBadgeClass(status: string): string {
    switch (status) {
      case 'A aprovar': return 'badge--vistoria';
      case 'Aprovado': return 'badge--aprovada';
      case 'Recusado': return 'badge--rejeitada';
      case 'Trocado': return 'badge--neutra';
      default: return '';
    }
  }

  orcamentoIcon(status: string): string {
    switch (status) {
      case 'A aprovar': return 'request_quote';
      case 'Aprovado': return 'check_circle';
      case 'Recusado': return 'cancel';
      case 'Trocado': return 'clock';
      default: return 'add_circle';
    }
  }
}
