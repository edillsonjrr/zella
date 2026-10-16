import { Component, OnDestroy, OnInit, computed, inject, signal } from '@angular/core';
import { MatCardModule } from '@angular/material/card';
import { MatTooltipModule } from '@angular/material/tooltip';
import { MatDialog, MatDialogModule } from '@angular/material/dialog';
import { RouterLink } from '@angular/router';
import { NgApexchartsModule } from 'ng-apexcharts';
import type { ApexAxisChartSeries, ApexOptions, ChartType } from 'ng-apexcharts';
import { IconComponent } from '../shared/icon/icon.component';
import { CountUpDirective } from '../shared/count-up.directive';
import { DataService } from '../shared/data.service';
import { RelatorioMensalDialogComponent } from '../relatorio-mensal/relatorio-mensal-dialog.component';
import { situacaoContrato } from '../shared/contrato-status';
import { nomeUnidade } from '../shared/rotulos';
import { EXPLICACAO_PRAZO, chamadoEmAndamento, chamadoEmAtraso } from '../shared/chamado-prazo';
import { CHAVES_SITUACAO, rotuloDaChave, situacaoDaOS, situacaoDoChamado, type ChaveSituacao } from '../shared/situacao-servico';
import type { Chamado } from '../shared/models';

type Periodo = 30 | 90 | 180;

interface Contagem {
  categoria: string;
  total: number;
}

interface CartaoKpi {
  rotulo: string;
  icone: string;
  valor: number;
  formato: (v: number) => string;
  variante?: 'perigo' | 'alerta';
  /** Texto menor ao lado do número ("em média", "dos chamados foram preventivos"). */
  sufixo?: string;
  /** Comparação com a janela anterior de mesmo tamanho. */
  // `antes` diz o valor de comparação ("eram 5 nos 180 dias anteriores"):
  // sem ele, "▲ 633%" não explicava contra o quê.
  delta?: { texto: string; descricao: string; antes: string; tendencia: 'sobe' | 'desce' | 'igual'; bom: boolean | null };
  /** Evolução dentro do período (uma posição por semana ou bloco de 30 dias). */
  spark?: number[];
  dica?: string;
  /** Explicação da regra, mostrada como dica ao passar o mouse ou focar o cartão. */
  ajuda?: string;
  /** Lista que o cartão abre, já filtrada. */
  link: { rota: string; params?: Record<string, string | number> };
}

const DIAS_SEMANA = ['Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb', 'Dom'];

const inteiro = (v: number) => Math.round(v).toLocaleString('pt-BR');
const percentual = (v: number) => `${Math.round(v)}%`;
const umaCasa = new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 1 });
// "10 dias", "2,5 dias", "1 dia": por extenso, sem o "d" solto.
const dias = (v: number) => {
  const n = umaCasa.format(v);
  return `${n} ${n === '1' ? 'dia' : 'dias'}`;
};

// Chamado e OS contados pela mesma máquina de situações (Z0.3), na ordem do
// fluxo. "Orçamento aprovado" e "A ser finalizado" caem na mesma barra.
// Cancelados entram: sem eles o "Total" da rosca (40) não batia com os
// chamados criados no período (44), nem a fatia "Encerrado" com a taxa de
// conclusão (65% × 59%).
const ORDEM_SITUACAO = CHAVES_SITUACAO;

@Component({
  selector: 'app-painel-gerencial',
  imports: [MatCardModule, MatTooltipModule, MatDialogModule, RouterLink, NgApexchartsModule, IconComponent, CountUpDirective],
  templateUrl: './painel-gerencial.component.html',
  styleUrl: './painel-gerencial.component.scss'
})
export class PainelGerencialComponent implements OnInit, OnDestroy {
  private dataService = inject(DataService);
  private dialog = inject(MatDialog);
  private observadorTema?: MutationObserver;

  // Relatório do mês em PDF (Z3.2): saldo, serviços, preventivas e chamados.
  abrirRelatorio(): void {
    this.dialog.open(RelatorioMensalDialogComponent, {
      panelClass: 'usuario-form-dialog',
      width: '480px',
      maxWidth: '95vw',
      maxHeight: '90vh',
      autoFocus: false
    });
  }

  periodoDias = signal<Periodo>(180);
  compararAnterior = signal(true);
  verTabela = signal(false);
  private temaVersao = signal(0);

  ngOnInit(): void {
    this.observadorTema = new MutationObserver(() => this.temaVersao.update(v => v + 1));
    this.observadorTema.observe(document.body, { attributes: true, attributeFilter: ['class'] });
  }

  ngOnDestroy(): void {
    this.observadorTema?.disconnect();
  }

  selecionarPeriodo(periodo: Periodo): void {
    this.periodoDias.set(periodo);
  }

  private diasDesde(dataIso: string): number {
    const [ano, mes, dia] = dataIso.split('-').map(Number);
    const data = new Date(ano, mes - 1, dia).setHours(0, 0, 0, 0);
    const hoje = new Date().setHours(0, 0, 0, 0);
    return Math.round((hoje - data) / 86400000);
  }

  chamadosNoPeriodo = computed(() => {
    const dias = this.periodoDias();
    return this.dataService.chamados().filter(c => this.diasDesde(c.dataCriacao) <= dias);
  });

  /** A janela imediatamente anterior, do mesmo tamanho: base dos deltas. */
  chamadosPeriodoAnterior = computed(() => {
    const dias = this.periodoDias();
    return this.dataService.chamados().filter(c => {
      const idade = this.diasDesde(c.dataCriacao);
      return idade > dias && idade <= dias * 2;
    });
  });

  kpis = computed(() => {
    const lista = this.chamadosNoPeriodo();
    // "Ainda em andamento": nem executado, nem encerrado, nem cancelado —
    // a mesma regra que tira o cancelado do "Em atraso".
    const abertos = lista.filter(c => chamadoEmAndamento(c)).length;
    const atrasados = lista.filter(c => chamadoEmAtraso(c)).length;
    const contratosEmAtencao = this.dataService
      .contratos()
      .filter(c => ['Crítico', 'Vencido'].includes(situacaoContrato(c).status)).length;

    return { total: lista.length, abertos, atrasados, taxaConclusao: this.taxaConclusao(lista), contratosEmAtencao };
  });

  // Métricas por lista: servem ao período, ao anterior e a cada faixa do sparkline.

  private taxaConclusao(lista: Chamado[]): number {
    return lista.length ? (lista.filter(c => c.status === 'Encerrado').length / lista.length) * 100 : 0;
  }

  /** Dias corridos da abertura ao fechamento, só de quem já fechou. */
  private tempoFechamento(lista: Chamado[]): number {
    const fechados = lista.filter(c => c.dataFechamento);
    if (!fechados.length) return 0;
    const soma = fechados.reduce((total, c) => total + (this.diasDesde(c.dataCriacao) - this.diasDesde(c.dataFechamento!)), 0);
    return soma / fechados.length;
  }

  /** Quanto do volume veio de plano preventivo (o resto é corretiva). */
  private preventivaPct(lista: Chamado[]): number {
    return lista.length ? (lista.filter(c => c.origem === 'preventiva').length / lista.length) * 100 : 0;
  }

  /** Semanas até 90 dias; blocos de 30 dias em 180. */
  private tamanhoFaixa = computed(() => (this.periodoDias() <= 90 ? 7 : 30));

  /** Chamados da janela que começa `deslocamento` dias atrás, em faixas da mais antiga para a mais recente. */
  private faixas(deslocamento: number): Chamado[][] {
    const periodo = this.periodoDias();
    const faixa = this.tamanhoFaixa();
    const total = Math.ceil(periodo / faixa);
    const grupos: Chamado[][] = Array.from({ length: total }, () => []);
    for (const c of this.dataService.chamados()) {
      const idade = this.diasDesde(c.dataCriacao) - deslocamento;
      if (idade < (deslocamento ? 1 : 0) || idade > periodo) continue;
      const indice = Math.min(total - 1, Math.floor(idade / faixa));
      grupos[total - 1 - indice].push(c);
    }
    return grupos;
  }

  private faixasAtuais = computed(() => this.faixas(0));
  private faixasAnteriores = computed(() => this.faixas(this.periodoDias()));

  // Variação em palavras e em número absoluto: "39 a mais", "41 pontos a
  // menos", "2 dias a mais", sempre com o valor de antes ao lado. Contagem
  // não vira porcentagem: com poucos chamados no período anterior (o
  // histórico começa em abril), saía "▲ 833%".
  private delta(atual: number, anterior: number, tipo: 'contagem' | 'pontos' | 'dias', sobeEhBom: boolean): CartaoKpi['delta'] {
    const diferenca = atual - anterior;
    const janela = `nos ${this.periodoDias()} dias anteriores`;
    const valorAntes = tipo === 'contagem' ? inteiro(anterior) : tipo === 'pontos' ? percentual(anterior) : dias(anterior);
    const antes = `${tipo === 'contagem' && anterior === 1 ? 'era' : 'eram'} ${valorAntes} ${janela}`;
    if (Math.abs(diferenca) < 0.05 || (tipo !== 'dias' && Math.round(Math.abs(diferenca)) === 0)) {
      return { texto: 'igual', descricao: `Igual ao valor ${janela} (${valorAntes})`, antes, tendencia: 'igual', bom: null };
    }
    const lado = diferenca > 0 ? 'a mais' : 'a menos';
    let texto: string;
    let descricao: string;
    if (tipo === 'contagem') {
      const n = Math.round(Math.abs(diferenca));
      texto = `${inteiro(n)} ${lado}`;
      descricao = `${inteiro(n)} ${n === 1 ? 'chamado' : 'chamados'} ${lado} que ${janela} (${valorAntes})`;
    } else if (tipo === 'pontos') {
      const pontos = Math.round(Math.abs(diferenca));
      texto = `${pontos} ${pontos === 1 ? 'ponto' : 'pontos'} ${lado}`;
      descricao = `${pontos} ${pontos === 1 ? 'ponto percentual' : 'pontos percentuais'} ${lado} que ${janela} (${valorAntes})`;
    } else {
      texto = `${dias(Math.abs(diferenca))} ${lado}`;
      descricao = `${texto} que ${janela} (${valorAntes})`;
    }
    return { texto, descricao, antes, tendencia: diferenca > 0 ? 'sobe' : 'desce', bom: (diferenca > 0) === sobeEhBom };
  }

  cartoes = computed<CartaoKpi[]>(() => {
    const atual = this.chamadosNoPeriodo();
    const anterior = this.chamadosPeriodoAnterior();
    const faixas = this.faixasAtuais();
    const k = this.kpis();
    const fechamento = this.tempoFechamento(atual);
    const fechamentoAnterior = this.tempoFechamento(anterior);
    // Cada cartão abre a lista de Chamados com o mesmo recorte.
    const periodo = this.periodoDias();
    const lista = (extra: Record<string, string | number> = {}) => ({ rota: '/dashboard', params: { periodo, ...extra } });

    return [
      {
        rotulo: `Chamados criados nos últimos ${periodo} dias`,
        icone: 'support_agent',
        valor: atual.length,
        formato: inteiro,
        delta: this.delta(atual.length, anterior.length, 'contagem', false),
        spark: faixas.map(f => f.length),
        dica: `${inteiro(k.abertos)} ainda em andamento`,
        link: lista()
      },
      {
        rotulo: 'Em atraso agora',
        icone: 'warning',
        valor: k.atrasados,
        formato: inteiro,
        variante: k.atrasados > 0 ? 'perigo' : undefined,
        dica: 'passaram do prazo de atendimento',
        ajuda: `Chamados criados no período que passaram do prazo e ainda não foram executados, encerrados nem cancelados. ${EXPLICACAO_PRAZO}`,
        link: lista({ atraso: 1 })
      },
      {
        rotulo: 'Tempo até fechar',
        icone: 'clock',
        valor: fechamento,
        formato: v => (v ? dias(v) : '—'),
        sufixo: fechamento ? 'em média' : undefined,
        delta: fechamento && fechamentoAnterior ? this.delta(fechamento, fechamentoAnterior, 'dias', false) : undefined,
        spark: faixas.map(f => this.tempoFechamento(f)),
        dica: 'da abertura ao fechamento',
        link: lista({ fechados: 1 })
      },
      {
        rotulo: 'Taxa de conclusão',
        icone: 'check_circle',
        valor: k.taxaConclusao,
        formato: percentual,
        delta: anterior.length ? this.delta(k.taxaConclusao, this.taxaConclusao(anterior), 'pontos', true) : undefined,
        spark: faixas.map(f => this.taxaConclusao(f)),
        dica: 'encerrados sobre os criados no período',
        link: lista({ status: 'Encerrado' })
      },
      {
        rotulo: 'Manutenção preventiva',
        icone: 'calendar_check',
        valor: this.preventivaPct(atual),
        formato: percentual,
        sufixo: 'dos chamados foram preventivos',
        delta: anterior.length ? this.delta(this.preventivaPct(atual), this.preventivaPct(anterior), 'pontos', true) : undefined,
        spark: faixas.map(f => this.preventivaPct(f)),
        link: lista({ origem: 'preventiva' })
      },
      {
        rotulo: 'Contratos em atenção',
        icone: 'description',
        valor: k.contratosEmAtencao,
        formato: inteiro,
        variante: k.contratosEmAtencao > 0 ? 'alerta' : undefined,
        dica: 'críticos ou vencidos hoje',
        ajuda: 'Contratos vencidos, que vencem em até 30 dias ou com algum item com 10% ou menos livre. Abre a lista de contratos.',
        link: { rota: '/contratos' }
      }
    ];
  });

  /** Linha do sparkline em coordenadas 0–100 × 0–30. */
  pontosSpark(valores: number[] | undefined): string {
    if (!valores || valores.length < 2 || valores.every(v => v === 0)) return '';
    const max = Math.max(...valores);
    const min = Math.min(...valores);
    const amplitude = max - min || 1;
    return valores
      .map((v, i) => `${((i / (valores.length - 1)) * 100).toFixed(1)},${(28 - ((v - min) / amplitude) * 26).toFixed(1)}`)
      .join(' ');
  }

  private contarPor(lista: Chamado[], chave: (c: Chamado) => string): Contagem[] {
    const mapa = new Map<string, number>();
    for (const item of lista) {
      const valor = chave(item);
      mapa.set(valor, (mapa.get(valor) ?? 0) + 1);
    }
    return [...mapa.entries()].map(([categoria, total]) => ({ categoria, total }));
  }

  /** Volume por faixa, com a faixa equivalente do período anterior ao lado. */
  volume = computed(() => {
    const faixa = this.tamanhoFaixa();
    const atuais = this.faixasAtuais();
    const anteriores = this.faixasAnteriores();
    const formato = new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: 'short' });
    const hoje = new Date();
    hoje.setHours(0, 0, 0, 0);
    return atuais.map((grupo, i) => {
      const inicio = new Date(hoje);
      inicio.setDate(hoje.getDate() - (atuais.length - i) * faixa + 1);
      return { rotulo: formato.format(inicio).replace('.', ''), atual: grupo.length, anterior: anteriores[i]?.length ?? 0 };
    });
  });

  /** Dia da semana × unidade (as 8 com mais chamados): onde e quando a demanda nasce. */
  mapaCalor = computed(() => {
    const unidades = this.porUnidade().slice(0, 8).map(u => u.categoria);
    const grade = DIAS_SEMANA.map(() => new Map<string, number>(unidades.map(u => [u, 0])));
    for (const c of this.chamadosNoPeriodo()) {
      const unidade = nomeUnidade(this.dataService.getUnidadeById(c.unidadeId));
      if (!grade[0].has(unidade)) continue;
      const [ano, mes, dia] = c.dataCriacao.split('-').map(Number);
      const semana = (new Date(ano, mes - 1, dia).getDay() + 6) % 7;
      grade[semana].set(unidade, (grade[semana].get(unidade) ?? 0) + 1);
    }
    return { unidades, grade };
  });

  statusDistribuicao = computed<Contagem[]>(() => {
    const mapa = new Map<ChaveSituacao, number>();
    for (const c of this.chamadosNoPeriodo()) {
      const chave = situacaoDoChamado(this.dataService, c).chave;
      mapa.set(chave, (mapa.get(chave) ?? 0) + 1);
    }
    return ORDEM_SITUACAO.filter(s => mapa.has(s)).map(s => ({ categoria: rotuloDaChave(s), total: mapa.get(s)! }));
  });

  porUnidade = computed<Contagem[]>(() => {
    return this.contarPor(this.chamadosNoPeriodo(), c => nomeUnidade(this.dataService.getUnidadeById(c.unidadeId)))
      .sort((a, b) => b.total - a.total);
  });

  porContrato = computed<Contagem[]>(() => {
    return this.contarPor(this.chamadosNoPeriodo(), c => {
      const os = c.ordemServicoId ? this.dataService.getOSById(c.ordemServicoId) : undefined;
      const contrato = os ? this.dataService.getContratoById(os.contratoId) : undefined;
      return contrato?.numero ?? 'Sem contrato';
    }).sort((a, b) => b.total - a.total);
  });

  osPorSituacao = computed<Contagem[]>(() => {
    const idsNoPeriodo = new Set(this.chamadosNoPeriodo().map(c => c.id));
    const osNoPeriodo = this.dataService.ordensServico().filter(os => idsNoPeriodo.has(os.chamadoId));
    const mapa = new Map<ChaveSituacao, number>();
    for (const os of osNoPeriodo) {
      const chave = situacaoDaOS(this.dataService, os).chave;
      mapa.set(chave, (mapa.get(chave) ?? 0) + 1);
    }
    return ORDEM_SITUACAO.filter(s => mapa.has(s)).map(s => ({ categoria: rotuloDaChave(s), total: mapa.get(s)! }));
  });

  porEquipamento = computed<Contagem[]>(() => {
    return this.contarPor(this.chamadosNoPeriodo(), c => c.equipamento.split(' - ')[0])
      .sort((a, b) => b.total - a.total)
      .slice(0, 5);
  });

  private corVar(token: string): string {
    this.temaVersao();
    const valor = getComputedStyle(document.documentElement).getPropertyValue(token).trim();
    return valor || '#0f6b6e';
  }

  /*
    Paleta categorica dos graficos.

    A anterior era [primary, info, success, warning, danger, ...] -- cores
    SEMANTICAS usadas como serie. Isso fazia "Em orcamento" aparecer em verde
    de sucesso e "A ser finalizado" em vermelho de perigo, quando os dois sao
    apenas etapas do fluxo: a cor afirmava uma coisa que o dado nao diz. Cor de
    estado (bom/atencao/grave/critico) fica reservada para estado.

    Esta e uma paleta categorica de verdade, com degraus proprios para cada
    tema, validada contra daltonismo e contraste: as duas listas passam em
    banda de luminosidade, piso de croma, separacao CVD e piso de visao normal.
    Nao reordenar nem trocar um matiz sem revalidar -- a ordem e parte do que
    faz vizinhas se distinguirem.
  */
  private readonly SERIES_CLARO = ['#2a78d6', '#eb6834', '#1baf7a', '#eda100', '#e87ba4', '#008300', '#4a3aa7', '#e34948'];
  private readonly SERIES_ESCURO = ['#3987e5', '#d95926', '#199e70', '#c98500', '#d55181', '#008300', '#9085e9', '#e66767'];

  private paleta = computed<string[]>(() =>
    this.temaApex() === 'light' ? this.SERIES_CLARO : this.SERIES_ESCURO
  );

  /**
   * Cor unica das barras.
   *
   * Unidade, contrato, equipamento e situacao medem a MESMA coisa (quantidade
   * de chamados) em entidades diferentes. Pintar cada barra de uma cor nao
   * acrescenta informacao nenhuma -- quem diz qual e qual e o rotulo do eixo.
   * Cor que nao significa nada so compete com a que significa.
   */
  // Teal da marca: o azul da paleta categórica ficava fora das cores do
  // Zella. A paleta categórica continua nos gráficos de várias séries.
  private corSerie = computed<string>(() => this.corVar('--primary-500'));

  private temaApex = computed<'dark' | 'light'>(() => {
    this.temaVersao();
    return document.body.classList.contains('light-mode') ? 'light' : 'dark';
  });

  private baseChart(tipo: ChartType, altura: number): ApexOptions['chart'] {
    return {
      type: tipo,
      height: altura,
      background: 'transparent',
      foreColor: this.corVar('--text-secondary'),
      fontFamily: 'inherit',
      toolbar: { show: false },
      animations: { enabled: true }
    };
  }

  private baseGrid(): ApexOptions['grid'] {
    return { borderColor: this.corVar('--border-default'), strokeDashArray: 3 };
  }

  private baseXAxis(categorias: string[]): ApexOptions['xaxis'] {
    return {
      categories: categorias,
      labels: { style: { colors: this.corVar('--text-tertiary') } },
      axisBorder: { color: this.corVar('--border-default') },
      axisTicks: { color: this.corVar('--border-default') }
    };
  }

  volumeChartOptions = computed<ApexOptions>(() => {
    const dados = this.volume();
    const comparar = this.compararAnterior();
    const series: ApexAxisChartSeries = [{ name: 'Este período', data: dados.map(d => d.atual) }];
    if (comparar) series.push({ name: 'Período anterior', data: dados.map(d => d.anterior) });
    return {
      chart: this.baseChart('area', 260),
      series,
      xaxis: this.baseXAxis(dados.map(d => d.rotulo)),
      colors: [this.corSerie(), this.corVar('--text-tertiary')],
      stroke: { curve: 'smooth', width: comparar ? [3, 2] : 3, dashArray: comparar ? [0, 5] : 0 },
      fill: { type: 'gradient', opacity: comparar ? [1, 0] : 1, gradient: { shadeIntensity: 1, opacityFrom: 0.35, opacityTo: 0.05 } },
      dataLabels: { enabled: false },
      legend: { show: false },
      grid: this.baseGrid(),
      tooltip: { theme: this.temaApex(), shared: true }
    };
  });

  calorChartOptions = computed<ApexOptions>(() => {
    const { unidades, grade } = this.mapaCalor();
    return {
      chart: this.baseChart('heatmap', DIAS_SEMANA.length * 34 + 60),
      // O Apex desenha a primeira série embaixo: invertida, a semana começa no topo.
      series: DIAS_SEMANA.map((dia, i) => ({ name: dia, data: unidades.map(u => ({ x: u, y: grade[i].get(u) ?? 0 })) })).reverse(),
      colors: [this.corSerie()],
      plotOptions: { heatmap: { radius: 4, shadeIntensity: 0.6, enableShades: true } },
      dataLabels: { enabled: true, style: { fontSize: '11px', colors: [this.corVar('--text-primary')] } },
      stroke: { width: 2, colors: [this.corVar('--bg-secondary')] },
      xaxis: { labels: { style: { colors: this.corVar('--text-tertiary') } }, axisBorder: { show: false }, axisTicks: { show: false } },
      yaxis: { labels: { style: { colors: [this.corVar('--text-tertiary')] } } },
      legend: { show: false },
      grid: { show: false },
      tooltip: { theme: this.temaApex(), y: { formatter: (v: number) => `${v} chamado${v === 1 ? '' : 's'}` } }
    };
  });

  statusChartOptions = computed<ApexOptions>(() => {
    const dados = this.statusDistribuicao();
    const total = dados.reduce((soma, d) => soma + d.total, 0);
    return {
      chart: this.baseChart('donut', 280),
      series: dados.map(d => d.total),
      labels: dados.map(d => d.categoria),
      colors: this.paleta(),
      legend: { position: 'bottom', fontSize: '13px', labels: { colors: this.corVar('--text-secondary') } },
      // Porcentagem inteira e no padrão brasileiro: o Apex escrevia "7.5%".
      dataLabels: { enabled: true, style: { fontSize: '12px' }, formatter: (v: number) => percentual(v) },
      plotOptions: {
        pie: {
          donut: {
            size: '68%',
            labels: {
              show: true,
              total: {
                show: true,
                label: 'Total',
                color: this.corVar('--text-tertiary'),
                fontSize: '13px',
                formatter: () => String(total)
              },
              value: {
                color: this.corVar('--text-primary'),
                fontSize: '1.625rem',
                fontWeight: 700,
                offsetY: -4
              }
            }
          }
        }
      },
      tooltip: { theme: this.temaApex() }
    };
  });

  private barCategorico(dados: Contagem[], horizontal: boolean): ApexOptions {
    const altura = Math.max(200, dados.length * (horizontal ? 46 : 60) + 60);
    return {
      chart: this.baseChart('bar', altura),
      series: [{ name: 'Chamados', data: dados.map(d => d.total) }],
      xaxis: this.baseXAxis(dados.map(d => d.categoria)),
      colors: [this.corSerie()],
      plotOptions: {
        bar: {
          horizontal,
          borderRadius: 4,
          // Uma serie, uma cor: `distributed` pintava cada barra de um matiz
          // diferente sem que isso quisesse dizer nada.
          distributed: false,
          barHeight: horizontal ? '55%' : undefined,
          columnWidth: horizontal ? undefined : '45%'
        }
      },
      legend: { show: false },
      dataLabels: {
        enabled: true,
        style: { fontSize: '12px', fontWeight: 600, colors: [this.corVar('--text-primary')] },
        offsetX: horizontal ? 8 : 0,
        offsetY: horizontal ? 0 : -18,
        dropShadow: { enabled: false }
      },
      grid: this.baseGrid(),
      tooltip: { theme: this.temaApex() }
    };
  }

  unidadeChartOptions = computed<ApexOptions>(() => this.barCategorico(this.porUnidade(), true));
  contratoChartOptions = computed<ApexOptions>(() => this.barCategorico(this.porContrato(), true));
  osChartOptions = computed<ApexOptions>(() => this.barCategorico(this.osPorSituacao(), false));
  equipamentoChartOptions = computed<ApexOptions>(() => this.barCategorico(this.porEquipamento(), true));
}
