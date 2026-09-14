import { Component, computed, inject, signal } from '@angular/core';
import { MatCardModule } from '@angular/material/card';
import { MatButtonModule } from '@angular/material/button';
import { MatMenuModule } from '@angular/material/menu';
import { IconComponent } from '../shared/icon/icon.component';
import { DataService } from '../shared/data.service';
import type { AlvoLog, LogEntrada, OperacaoLog } from '../shared/models';

interface LogView extends LogEntrada {
  dataFormatada: string;
  horaFormatada: string;
  iniciais: string;
  icone: string;
  corClasse: string;
  detalhesTexto: string[];
}

const ROTULO_ALVO: Record<AlvoLog, string> = {
  unidade: 'Unidade',
  bloco: 'Bloco',
  sala: 'Sala',
  equipamento: 'Equipamento',
  usuario: 'Usuário',
  empresaContratada: 'Empresa contratada',
  contrato: 'Contrato',
  itemContrato: 'Item de contrato',
  planoManutencao: 'Plano preventivo',
  chamado: 'Chamado',
  ordemServico: 'Ordem de serviço',
  orcamento: 'Orçamento'
};

const ICONE_ALVO: Record<AlvoLog, string> = {
  unidade: 'location_on',
  bloco: 'layers',
  sala: 'folder',
  equipamento: 'handyman',
  usuario: 'person',
  empresaContratada: 'handyman',
  contrato: 'description',
  itemContrato: 'format_list_bulleted',
  planoManutencao: 'calendar_check',
  chamado: 'support_agent',
  ordemServico: 'assignment',
  orcamento: 'request_quote'
};

const COR_OPERACAO: Record<OperacaoLog, string> = {
  criar: 'success',
  editar: 'info',
  excluir: 'danger',
  transicao: 'primary',
  importar: 'warning'
};

@Component({
  selector: 'app-logs',
  imports: [MatCardModule, MatButtonModule, MatMenuModule, IconComponent],
  templateUrl: './logs.component.html',
  styleUrl: './logs.component.scss'
})
export class LogsComponent {
  private dataService = inject(DataService);

  termoBusca = signal('');
  filtroAlvo = signal<AlvoLog | null>(null);
  filtroOperacao = signal<OperacaoLog | null>(null);

  alvos = Object.entries(ROTULO_ALVO) as [AlvoLog, string][];
  operacoes: [OperacaoLog, string][] = [
    ['criar', 'Criação'],
    ['editar', 'Edição'],
    ['excluir', 'Exclusão'],
    ['transicao', 'Mudança de estado'],
    ['importar', 'Importação']
  ];

  private formatador = new Intl.DateTimeFormat('pt-BR');
  private formatadorHora = new Intl.DateTimeFormat('pt-BR', { hour: '2-digit', minute: '2-digit' });

  registros = computed<LogView[]>(() => {
    const termo = this.termoBusca().trim().toLowerCase();
    const alvo = this.filtroAlvo();
    const operacao = this.filtroOperacao();

    return this.dataService.logs()
      .filter(l => !alvo || l.alvo === alvo)
      .filter(l => !operacao || l.operacao === operacao)
      .filter(l => !termo ||
        l.descricao.toLowerCase().includes(termo) ||
        l.usuarioNome.toLowerCase().includes(termo) ||
        l.alvoRotulo.toLowerCase().includes(termo))
      .map(l => this.toView(l));
  });

  totalBruto = computed(() => this.dataService.logs().length);
  filtrosAtivos = computed(() => !!this.filtroAlvo() || !!this.filtroOperacao() || !!this.termoBusca());

  private toView(log: LogEntrada): LogView {
    const data = new Date(log.data);
    return {
      ...log,
      dataFormatada: this.formatador.format(data),
      horaFormatada: this.formatadorHora.format(data),
      iniciais: log.usuarioNome.split(' ').map(p => p[0]).join('').slice(0, 2).toUpperCase(),
      icone: ICONE_ALVO[log.alvo] ?? 'info',
      corClasse: COR_OPERACAO[log.operacao] ?? 'neutral',
      detalhesTexto: this.formatarDetalhes(log.detalhes)
    };
  }

  // Achata o objeto de detalhes em linhas legíveis, dando forma de
  // "campo: de → para" quando a entrada guardou um antes/depois.
  private formatarDetalhes(detalhes: Record<string, unknown> | undefined): string[] {
    if (!detalhes) return [];

    return Object.entries(detalhes).flatMap(([chave, valor]) => {
      if (valor === null || valor === undefined) return [];

      if (typeof valor === 'object' && 'de' in (valor as object) && 'para' in (valor as object)) {
        const mudanca = valor as { de: unknown; para: unknown };
        return [`${chave}: ${mudanca.de ?? '—'} → ${mudanca.para ?? '—'}`];
      }

      return [`${chave}: ${valor}`];
    });
  }

  rotuloAlvo(alvo: AlvoLog): string {
    return ROTULO_ALVO[alvo] ?? alvo;
  }

  atualizarBusca(valor: string): void {
    this.termoBusca.set(valor);
  }

  selecionarAlvo(alvo: AlvoLog | null): void {
    this.filtroAlvo.set(alvo);
  }

  selecionarOperacao(operacao: OperacaoLog | null): void {
    this.filtroOperacao.set(operacao);
  }

  limparFiltros(): void {
    this.filtroAlvo.set(null);
    this.filtroOperacao.set(null);
    this.termoBusca.set('');
  }
}
