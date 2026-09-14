import { Component, OnDestroy, OnInit, computed, inject, signal } from '@angular/core';
import { MatCardModule } from '@angular/material/card';
import { NgApexchartsModule } from 'ng-apexcharts';
import type { ApexOptions, ChartType } from 'ng-apexcharts';
import { IconComponent } from '../shared/icon/icon.component';
import { DataService } from '../shared/data.service';
import type { Chamado, OrdemServico } from '../shared/models';

type Periodo = 30 | 90 | 180;

interface Contagem {
  categoria: string;
  total: number;
}

const ORDEM_STATUS: Chamado['status'][] = [
  'Aberto',
  'Em atendimento',
  'Em orçamento',
  'Orçamento aprovado',
  'A ser finalizado',
  'Executado',
  'Encerrado'
];

const ORDEM_SITUACAO_OS: OrdemServico['situacao'][] = [
  'Aberta',
  'Em vistoria',
  'Aprovada',
  'Rejeitada',
  'Executada',
  'Encerrada'
];

@Component({
  selector: 'app-painel-gerencial',
  imports: [MatCardModule, NgApexchartsModule, IconComponent],
  templateUrl: './painel-gerencial.component.html',
  styleUrl: './painel-gerencial.component.scss'
})
export class PainelGerencialComponent implements OnInit, OnDestroy {
  private dataService = inject(DataService);
  private observadorTema?: MutationObserver;

  periodoDias = signal<Periodo>(180);
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

  kpis = computed(() => {
    const lista = this.chamadosNoPeriodo();
    const finalizados = ['Executado', 'Encerrado'];
    const abertos = lista.filter(c => !finalizados.includes(c.status)).length;
    const atrasados = lista.filter(
      c => c.dataVencimento && this.diasDesde(c.dataVencimento) > 0 && !finalizados.includes(c.status)
    ).length;
    const encerrados = lista.filter(c => c.status === 'Encerrado').length;
    const taxaConclusao = lista.length ? Math.round((encerrados / lista.length) * 100) : 0;
    const contratosEmAtencao = this.dataService
      .contratos()
      .filter(c => c.status === 'Crítico' || -this.diasDesde(c.vigenciaFim) <= 30).length;

    return { total: lista.length, abertos, atrasados, taxaConclusao, contratosEmAtencao };
  });

  private contarPor(lista: Chamado[], chave: (c: Chamado) => string): Contagem[] {
    const mapa = new Map<string, number>();
    for (const item of lista) {
      const valor = chave(item);
      mapa.set(valor, (mapa.get(valor) ?? 0) + 1);
    }
    return [...mapa.entries()].map(([categoria, total]) => ({ categoria, total }));
  }

  volumePorMes = computed<Contagem[]>(() => {
    const mapa = new Map<string, number>();
    for (const c of this.chamadosNoPeriodo()) {
      const chave = c.dataCriacao.slice(0, 7);
      mapa.set(chave, (mapa.get(chave) ?? 0) + 1);
    }
    const formatter = new Intl.DateTimeFormat('pt-BR', { month: 'short', year: '2-digit' });
    return [...mapa.keys()].sort().map(chave => {
      const [ano, mes] = chave.split('-').map(Number);
      return { categoria: formatter.format(new Date(ano, mes - 1, 1)), total: mapa.get(chave)! };
    });
  });

  statusDistribuicao = computed<Contagem[]>(() => {
    const contagem = this.contarPor(this.chamadosNoPeriodo(), c => c.status);
    const mapa = new Map(contagem.map(c => [c.categoria, c.total]));
    return ORDEM_STATUS.filter(s => mapa.has(s)).map(s => ({ categoria: s, total: mapa.get(s)! }));
  });

  porUnidade = computed<Contagem[]>(() => {
    return this.contarPor(this.chamadosNoPeriodo(), c => this.dataService.getUnidadeById(c.unidadeId)?.sigla ?? '—')
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
    const mapa = new Map<string, number>();
    for (const os of osNoPeriodo) mapa.set(os.situacao, (mapa.get(os.situacao) ?? 0) + 1);
    return ORDEM_SITUACAO_OS.filter(s => mapa.has(s)).map(s => ({ categoria: s, total: mapa.get(s)! }));
  });

  porEquipamento = computed<Contagem[]>(() => {
    return this.contarPor(this.chamadosNoPeriodo(), c => c.equipamento.split(' - ')[0])
      .sort((a, b) => b.total - a.total)
      .slice(0, 5);
  });

  private corVar(token: string): string {
    this.temaVersao();
    const valor = getComputedStyle(document.documentElement).getPropertyValue(token).trim();
    return valor || '#7b68ee';
  }

  private paleta = computed<string[]>(() => [
    this.corVar('--primary-500'),
    this.corVar('--info-500'),
    this.corVar('--success-500'),
    this.corVar('--warning-500'),
    this.corVar('--danger-500'),
    this.corVar('--primary-400'),
    this.corVar('--primary-600')
  ]);

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
    const dados = this.volumePorMes();
    return {
      chart: this.baseChart('area', 260),
      series: [{ name: 'Chamados', data: dados.map(d => d.total) }],
      xaxis: this.baseXAxis(dados.map(d => d.categoria)),
      colors: [this.paleta()[0]],
      stroke: { curve: 'smooth', width: 3 },
      fill: { type: 'gradient', gradient: { shadeIntensity: 1, opacityFrom: 0.35, opacityTo: 0.05 } },
      dataLabels: { enabled: false },
      grid: this.baseGrid(),
      tooltip: { theme: this.temaApex() }
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
      dataLabels: { enabled: true, style: { fontSize: '12px' } },
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
      colors: this.paleta(),
      plotOptions: {
        bar: {
          horizontal,
          borderRadius: 4,
          distributed: true,
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
