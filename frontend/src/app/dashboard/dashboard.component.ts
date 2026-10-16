import { Component, signal, computed, inject } from '@angular/core';
import { ActivatedRoute, ParamMap, Router } from '@angular/router';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { MatTooltipModule } from '@angular/material/tooltip';
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
import { faseDoChamado } from '../shared/chamado-fase';
import { UiFeedbackService } from '../shared/ui-feedback.service';
import { dicaUnidade, nomeUnidade } from '../shared/rotulos';
import { EXPLICACAO_PRAZO, chamadoEmAtraso, diasDesde, prazoDoChamado, type PrazoChamado } from '../shared/chamado-prazo';
import { FluxoAcoesService } from '../shared/fluxo-acoes.service';
import { AuthService } from '../shared/auth.service';
import {
  CHAVES_SITUACAO,
  EXPLICACAO_FIM,
  classeDoSelo,
  corDoGrupo,
  rotuloDaChave,
  situacaoDoChamado,
  situacaoDoServico,
  type ChaveSituacao,
  type SituacaoServico
} from '../shared/situacao-servico';
import { abrirItemDaUrl } from '../shared/abrir-pela-url';
import type { Chamado, OrdemServico, Contrato } from '../shared/models';

interface DashboardChamado extends Chamado {
  dataFormatada: string;
  responsavelNome: string;
  responsavelIniciais: string;
  responsavelCorToken: string;
  unidadeSigla: string;
  unidadeNome: string;
  unidadeDica: string;
  contratoNumero?: string;
  prioridade: string;
  prioridadeClasse: string;
  prioridadeIcone: string;
  // Situação no vocabulário único do chamado e da OS (Z0.3).
  situacao: SituacaoServico;
  seloClasse: string;
  contratoId?: string;
  osNumero?: string;
  prazo: PrazoChamado | null;
}

// Recorte que chega do Painel gerencial pela URL (?periodo=30&atraso=1...).
interface FiltroPainel {
  periodo?: number;
  atraso?: boolean;
  fechados?: boolean;
  preventiva?: boolean;
}

interface GrupoChamados {
  // Situação do grupo, 'todos' na lista sem agrupar, vazio nos outros critérios.
  chave: ChaveSituacao | 'todos' | '';
  valor: string;
  // Quem age nas situações do grupo (só no agrupamento por situação).
  agora?: string;
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
    MatTooltipModule,
    ChamadosQuadroComponent
  ],
  templateUrl: './dashboard.component.html',
  styleUrl: './dashboard.component.scss'
})
export class DashboardComponent {
  private dialog = inject(MatDialog);
  private feedback = inject(UiFeedbackService);
  private route = inject(ActivatedRoute);
  private router = inject(Router);
  private fluxo = inject(FluxoAcoesService);
  private auth = inject(AuthService);
  dataService = inject(DataService);

  // Pedir conserto é da solicitante e da gestão. A contratada e o técnico
  // recebem a OS; "Novo chamado" não aparece para eles (Z0.7).
  readonly podeAbrirChamado = this.auth.isGestor();
  // Contrato é dinheiro: só gestão e responsável da contratada abrem.
  readonly podeVerContrato = this.auth.isGestor() || this.auth.isGestorContratado();
  readonly explicacaoFim = EXPLICACAO_FIM;
  // Filtro por situação, na ordem do fluxo, com o rótulo de quem olha.
  readonly opcoesSituacao = CHAVES_SITUACAO.map(chave => ({ chave, rotulo: rotuloDaChave(chave, this.auth.perfil) }));

  readonly explicacaoPrazo = EXPLICACAO_PRAZO;
  filtroPainel = signal<FiltroPainel | null>(null);

  // O que o recorte do painel está mostrando, em palavras, para o aviso acima da lista.
  descricaoFiltroPainel = computed(() => {
    const f = this.filtroPainel();
    if (!f) return '';
    const partes: string[] = [];
    if (f.periodo) partes.push(`criados nos últimos ${f.periodo} dias`);
    if (f.atraso) partes.push('em atraso');
    if (f.fechados) partes.push('já fechados');
    if (f.preventiva) partes.push('de manutenção preventiva');
    return partes.join(' · ');
  });

  abaAtiva = 'Lista';
  abas = ['Lista', 'Quadro'];

  agrupamentoAtivo = signal(true);
  criterioAgrupamento = signal<'status' | 'unidade' | 'contrato'>('status');
  filtroStatus = signal<ChaveSituacao | null>(null);
  rotuloFiltroStatus = computed(() => {
    const f = this.filtroStatus();
    return f ? rotuloDaChave(f, this.auth.perfil) : 'Todas';
  });
  termoBusca = signal('');
  ordenacaoAsc = signal(true);
  // Só os que passaram do prazo e ainda não tiveram o serviço feito.
  soAtrasados = signal(false);
  totalAtrasados = computed(() => this.chamadosReais().filter(c => chamadoEmAtraso(c)).length);

  chamadosReais = this.dataService.chamados;
  ordensReais = this.dataService.ordensServico;
  contratos = this.dataService.contratos;

  resumo = computed(() => {
    const chamados = this.chamadosReais();
    const ordens = this.ordensReais();
    return {
      chamadosTotal: chamados.length,
      chamadosAbertos: chamados.filter(c => faseDoChamado(c.status) === 'Aberto').length,
      chamadosEmAtendimento: chamados.filter(c => faseDoChamado(c.status) === 'Em atendimento').length,
      chamadosFinalizados: chamados.filter(c => faseDoChamado(c.status) === 'Finalizado').length,
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

  // A coluna mostra a urgência que quem pediu escolheu. Antes era uma
  // "prioridade" inventada a partir do status, que nenhum formulário pedia.
  private urgenciaDoChamado(chamado: Chamado): { prioridade: string; classe: string; icone: string } {
    switch (chamado.urgencia) {
      case 'alta': return { prioridade: 'Urgente', classe: 'danger', icone: 'priority_high' };
      case 'media': return { prioridade: 'Atrapalha', classe: 'warning', icone: 'clock' };
      case 'baixa': return { prioridade: 'Pode esperar', classe: 'neutral', icone: 'minus_circle' };
      default: return { prioridade: 'Não informada', classe: 'neutral', icone: 'minus_circle' };
    }
  }

  /**
   * "Com quem está": quem precisa agir agora, pela situação. Antes a coluna
   * "Responsável" mostrava a gestora em todo chamado já encaminhado (é ela
   * quem cria a OS), e não dizia nada.
   */
  private comQuemEsta(chamado: Chamado, situacao: SituacaoServico, os: OrdemServico | undefined, contrato: Contrato | undefined): { nome: string; pessoa: boolean } {
    switch (situacao.quemAge) {
      case 'gestao': {
        const gestora = chamado.responsavelId ? this.dataService.getUsuarioById(chamado.responsavelId) : undefined;
        return gestora ? { nome: gestora.nome, pessoa: true } : { nome: 'Gestão', pessoa: false };
      }
      case 'contratada':
        return { nome: contrato?.fornecedor ?? 'Empresa contratada', pessoa: false };
      case 'tecnico': {
        const tecnico = os?.tecnicoId ? this.dataService.getUsuarioById(os.tecnicoId) : undefined;
        return tecnico ? { nome: tecnico.nome, pessoa: true } : { nome: contrato ? `Técnico da ${contrato.fornecedor}` : 'Técnico', pessoa: false };
      }
      default:
        return { nome: 'Ninguém', pessoa: false };
    }
  }

  private toView(chamado: Chamado): DashboardChamado {
    const unidade = this.dataService.getUnidadeById(chamado.unidadeId);
    const os = chamado.ordemServicoId ? this.dataService.getOSById(chamado.ordemServicoId) : undefined;
    const contrato = os?.contratoId ? this.dataService.getContratoById(os.contratoId) : undefined;
    const situacao = situacaoDoChamado(this.dataService, chamado, this.auth.perfil);
    const comQuem = this.comQuemEsta(chamado, situacao, os, contrato);
    const nomeResponsavel = comQuem.nome;
    const prioridade = this.urgenciaDoChamado(chamado);

    return {
      ...chamado,
      dataFormatada: this.formatarData(chamado.dataCriacao),
      responsavelNome: nomeResponsavel,
      responsavelIniciais: situacao.quemAge === 'ninguem' ? '—' : nomeResponsavel.split(' ').filter(n => n.length > 2 || /^[A-Z]/.test(n)).map(n => n[0]).join('').slice(0, 2).toUpperCase(),
      responsavelCorToken: comQuem.pessoa ? this.corAvatarPorNome(nomeResponsavel) : 'neutral',
      unidadeSigla: unidade?.sigla ?? '',
      unidadeNome: nomeUnidade(unidade, 'Sem unidade'),
      unidadeDica: dicaUnidade(unidade),
      contratoNumero: contrato?.numero,
      prioridade: prioridade.prioridade,
      prioridadeClasse: prioridade.classe,
      prioridadeIcone: prioridade.icone,
      situacao,
      seloClasse: classeDoSelo(situacao.chave),
      // Só com o contrato carregado: sem ele, "Ver contrato" não abriria nada.
      contratoId: contrato?.id,
      osNumero: os?.numero,
      prazo: prazoDoChamado(chamado)
    };
  }

  chamadosView = computed(() => {
    let lista = this.chamadosReais().map(c => this.toView(c));
    const status = this.filtroStatus();
    if (status) {
      lista = lista.filter(c => c.situacao.chave === status);
    }
    const busca = this.termoBusca().trim().toLowerCase();
    if (busca) {
      lista = lista.filter(c =>
        c.numero.toLowerCase().includes(busca) ||
        c.equipamento.toLowerCase().includes(busca) ||
        c.responsavelNome.toLowerCase().includes(busca) ||
        c.unidadeNome.toLowerCase().includes(busca) ||
        c.unidadeSigla.toLowerCase().includes(busca)
      );
    }
    if (this.soAtrasados()) {
      lista = lista.filter(c => chamadoEmAtraso(c));
    }
    const painel = this.filtroPainel();
    if (painel) {
      lista = lista.filter(c => this.atendeFiltroPainel(c, painel));
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
        chave: 'todos',
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

    // Um grupo por situação, na ordem do fluxo. "Orçamento aprovado" e "A ser
    // finalizado" (a mesma etapa) caem no mesmo grupo. Cancelados ficam fora
    // do agrupamento, como antes; o filtro "Cancelado" mostra.
    const mapa = new Map<ChaveSituacao, GrupoChamados>();
    for (const chamado of chamados) {
      const chave = chamado.situacao.chave;
      if (chave === 'cancelado' && this.filtroStatus() !== 'cancelado') continue;
      if (!mapa.has(chave)) {
        mapa.set(chave, {
          chave,
          valor: chamado.situacao.rotulo,
          agora: chamado.situacao.agora,
          corClasse: corDoGrupo(chave),
          contagem: 0,
          collapsed: false,
          chamados: []
        });
      }
      const grupo = mapa.get(chave)!;
      grupo.chamados.push(chamado);
      grupo.contagem = grupo.chamados.length;
    }

    return CHAVES_SITUACAO
      .filter(s => mapa.has(s))
      .map(s => mapa.get(s)!);
  });

  private agruparPor(chamados: DashboardChamado[], chaveFn: (c: DashboardChamado) => string, corClasse: string): GrupoChamados[] {
    const mapa = new Map<string, GrupoChamados>();
    for (const chamado of chamados) {
      const chave = chaveFn(chamado);
      if (!mapa.has(chave)) {
        mapa.set(chave, { chave: '', valor: chave, corClasse, contagem: 0, collapsed: false, chamados: [] });
      }
      const grupo = mapa.get(chave)!;
      grupo.chamados.push(chamado);
      grupo.contagem = grupo.chamados.length;
    }
    return [...mapa.values()].sort((a, b) => a.valor.localeCompare(b.valor));
  }

  filtrosAtivos = computed(() => !!this.filtroStatus() || !!this.filtroPainel() || this.soAtrasados());

  // O que a lista mostra, para os números baterem com o Painel gerencial:
  // quantos aparecem e quantos cancelados ficam fora dos grupos.
  resumoLista = computed(() => {
    const visiveis = this.grupos().reduce((soma, g) => soma + g.contagem, 0);
    const foraDosGrupos = this.chamadosView().length - visiveis;
    return { visiveis, total: this.chamadosReais().length, filtrados: this.chamadosView().length, cancelados: foraDosGrupos };
  });

  constructor() {
    this.route.queryParamMap.pipe(takeUntilDestroyed()).subscribe(p => this.lerFiltrosDaRota(p));
    // Notificação de chamado: ?chamado=ID abre o painel dele.
    abrirItemDaUrl('chamado', id => this.dataService.getChamadoById(id), c => this.abrirChamado(c));
  }

  // Os cartões do Painel gerencial abrem esta lista com o recorte na URL.
  private lerFiltrosDaRota(p: ParamMap): void {
    const filtro: FiltroPainel = {};
    const periodo = Number(p.get('periodo'));
    if (Number.isFinite(periodo) && periodo > 0) filtro.periodo = Math.round(periodo);
    if (p.get('atraso') === '1') filtro.atraso = true;
    if (p.get('fechados') === '1') filtro.fechados = true;
    if (p.get('origem') === 'preventiva') filtro.preventiva = true;
    const temRecorte = Object.keys(filtro).length > 0;
    this.filtroPainel.set(temRecorte ? filtro : null);
    // Vindo do painel, a lista abre sem agrupar: o total do grupo único bate
    // com o número do cartão (o agrupamento por status não mostra cancelados).
    if (temRecorte) this.agrupamentoAtivo.set(false);
    // O painel manda o status gravado (?status=Encerrado); a lista filtra
    // pela situação equivalente.
    const status = p.get('status');
    if (status) {
      const chave = (CHAVES_SITUACAO as string[]).includes(status)
        ? (status as ChaveSituacao)
        : situacaoDoServico({ chamado: { status: status as Chamado['status'] } }).chave;
      this.filtroStatus.set(chave);
    }
  }

  // Mesmas regras do Painel gerencial, para a lista bater com o número do cartão.
  private atendeFiltroPainel(c: Chamado, f: FiltroPainel): boolean {
    if (f.periodo && diasDesde(c.dataCriacao) > f.periodo) return false;
    if (f.atraso && !chamadoEmAtraso(c)) return false;
    if (f.fechados && !c.dataFechamento) return false;
    if (f.preventiva && c.origem !== 'preventiva') return false;
    return true;
  }

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

  selecionarFiltroStatus(status: ChaveSituacao | null): void {
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
    this.soAtrasados.set(false);
    if (this.filtroPainel()) {
      this.filtroPainel.set(null);
      this.router.navigate([], { relativeTo: this.route, queryParams: {} });
    }
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

        // Arrastar também passa pela conferência: itens antes de aprovar,
        // quantidades e foto ao registrar, resumo antes de encerrar.
        case 'aprovar-orcamento':
          if (os) await this.fluxo.aprovarOrcamento(os);
          return;

        case 'executar-os':
          if (os) await this.fluxo.registrarServico(os);
          return;

        case 'encerrar-chamado':
          await this.fluxo.encerrarChamado(chamado);
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

  abrirChamado(chamado: Chamado): void {
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
}
