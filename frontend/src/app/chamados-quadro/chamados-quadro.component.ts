import { Component, EventEmitter, Input, Output, inject } from '@angular/core';
import { DatePipe } from '@angular/common';
import { CdkDrag, CdkDragDrop, CdkDropList, CdkDropListGroup } from '@angular/cdk/drag-drop';
import { MatCardModule } from '@angular/material/card';
import { MatButtonModule } from '@angular/material/button';
import { MatTooltipModule } from '@angular/material/tooltip';
import { IconComponent } from '../shared/icon/icon.component';
import { DataService } from '../shared/data.service';
import { AuthService } from '../shared/auth.service';
import type { Chamado } from '../shared/models';

export type StatusChamado = Chamado['status'];

// O status do chamado é derivado da máquina de estados no backend (as rules
// do Firestore barram escrita direta do cliente em /chamados). Por isso cada
// coluna declara qual ação de negócio leva o chamado até ela: soltar o card
// dispara essa ação, em vez de gravar o status na mão. Colunas sem ação
// (Aberto, Orçamento aprovado) não aceitam drop — nada no fluxo volta pra lá.
export type AcaoTransicao =
  | 'criar-os'
  | 'criar-orcamento'
  | 'aprovar-orcamento'
  | 'executar-os'
  | 'encerrar-chamado';

export interface TransicaoChamado {
  chamado: Chamado;
  destino: StatusChamado;
  acao: AcaoTransicao;
}

interface ColunaQuadro {
  status: StatusChamado;
  titulo: string;
  corClasse: string;
  acao?: AcaoTransicao;
  chamados: ChamadoCard[];
  aceita: (drag: CdkDrag<ChamadoCard>) => boolean;
}

interface ChamadoCard extends Chamado {
  responsavelNome: string;
  responsavelIniciais: string;
  unidadeSigla: string;
  osNumero?: string;
}

@Component({
  selector: 'app-chamados-quadro',
  imports: [
    MatCardModule,
    MatButtonModule,
    MatTooltipModule,
    IconComponent,
    DatePipe,
    CdkDropListGroup,
    CdkDropList,
    CdkDrag
  ],
  templateUrl: './chamados-quadro.component.html',
  styleUrl: './chamados-quadro.component.scss'
})
export class ChamadosQuadroComponent {
  private dataService = inject(DataService);
  private auth = inject(AuthService);

  @Input() chamados: Chamado[] = [];
  @Output() abrirNovoChamado = new EventEmitter<void>();
  @Output() abrirDetalhe = new EventEmitter<Chamado>();
  @Output() transicao = new EventEmitter<TransicaoChamado>();

  colunas: ColunaQuadro[] = [
    { status: 'Aberto', titulo: 'Aberto', corClasse: 'info', chamados: [], aceita: () => false },
    { status: 'Em atendimento', titulo: 'Em atendimento', corClasse: 'warning', acao: 'criar-os', chamados: [], aceita: () => false },
    { status: 'Em orçamento', titulo: 'Em orçamento', corClasse: 'primary', acao: 'criar-orcamento', chamados: [], aceita: () => false },
    { status: 'Orçamento aprovado', titulo: 'Orçamento aprovado', corClasse: 'success', chamados: [], aceita: () => false },
    { status: 'A ser finalizado', titulo: 'A ser finalizado', corClasse: 'warning-accent', acao: 'aprovar-orcamento', chamados: [], aceita: () => false },
    { status: 'Executado', titulo: 'Executado', corClasse: 'primary-accent', acao: 'executar-os', chamados: [], aceita: () => false },
    { status: 'Encerrado', titulo: 'Encerrado', corClasse: 'success', acao: 'encerrar-chamado', chamados: [], aceita: () => false }
  ];

  constructor() {
    // O predicate é criado uma vez por coluna: o CDK consulta ele a cada
    // movimento do mouse, então não pode ser uma arrow nova por render.
    this.colunas.forEach(coluna => {
      coluna.aceita = (drag: CdkDrag<ChamadoCard>) => this.podeMover(drag.data, coluna);
    });
  }

  ngOnChanges(): void {
    this.colunas.forEach(coluna => {
      coluna.chamados = this.chamados
        .filter(c => c.status === coluna.status)
        .map(c => this.toCard(c));
    });
  }

  private toCard(chamado: Chamado): ChamadoCard {
    const responsavel = chamado.responsavelId ? this.dataService.getUsuarioById(chamado.responsavelId) : undefined;
    const nome = responsavel?.nome ?? 'Não atribuído';
    const os = chamado.ordemServicoId ? this.dataService.getOSById(chamado.ordemServicoId) : undefined;

    return {
      ...chamado,
      responsavelNome: nome,
      responsavelIniciais: responsavel ? nome.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase() : '—',
      unidadeSigla: this.dataService.getUnidadeById(chamado.unidadeId)?.sigla ?? '-',
      osNumero: os?.numero
    };
  }

  // Espelha as pré-condições das Cloud Functions. Se mudar lá, muda aqui —
  // do contrário o card é solto e a chamada volta com failed-precondition.
  private podeMover(chamado: Chamado | undefined, coluna: ColunaQuadro): boolean {
    if (!chamado || !coluna.acao || chamado.status === coluna.status) return false;

    // Chamado encerrado é ponto final: nenhuma função do fluxo o traz de
    // volta. (O criarOrcamento do backend aceitaria e ressuscitaria o
    // chamado como 'Em orçamento' — por isso o bloqueio vive aqui.)
    if (chamado.status === 'Encerrado') return false;

    const os = chamado.ordemServicoId ? this.dataService.getOSById(chamado.ordemServicoId) : undefined;
    const orcamento = os ? this.dataService.getOrcamentoByOS(os.id) : undefined;

    const gestor = this.auth.isGestor();
    const contratada = this.auth.isGestorContratado() || this.auth.isTecnico();

    switch (coluna.acao) {
      case 'criar-os':
        return (gestor || this.auth.isGestorContratado()) && !chamado.ordemServicoId;
      case 'criar-orcamento':
        // Logo depois de abrir a OS, ou pra refazer um orçamento rejeitado.
        // Quem orça é a contratada.
        return contratada && !!os && ['Aberta', 'Em vistoria', 'Rejeitada'].includes(os.situacao) && orcamento?.situacao !== 'Pendente';
      case 'aprovar-orcamento':
        // Só o gestor do cliente decide: é o saldo do contrato dele.
        return gestor && orcamento?.situacao === 'Pendente';
      case 'executar-os':
        return contratada && os?.situacao === 'Aprovada';
      case 'encerrar-chamado':
        // Só depois de executado; antes disso a reserva do orçamento ficaria
        // presa. Quem não vai executar cancela pelo painel do chamado.
        return gestor && chamado.status === 'Executado';
    }
  }

  motivoBloqueio(coluna: ColunaQuadro): string {
    switch (coluna.acao) {
      case 'criar-os': return 'Abre a Nova OS para este chamado';
      case 'criar-orcamento': return 'Abre o orçamento da OS deste chamado';
      case 'aprovar-orcamento': return 'Aprova o orçamento pendente';
      case 'executar-os': return 'Marca a OS aprovada como executada';
      case 'encerrar-chamado': return 'Encerra o chamado';
      default: return 'Esta coluna é definida pelo fluxo e não aceita arrastar';
    }
  }

  soltar(evento: CdkDragDrop<ColunaQuadro>, destino: ColunaQuadro): void {
    if (evento.previousContainer === evento.container) return;

    const chamado = evento.item.data as ChamadoCard;
    if (!destino.acao || !this.podeMover(chamado, destino)) return;

    this.transicao.emit({ chamado, destino: destino.status, acao: destino.acao });
  }

  onAbrirNovoChamado(): void {
    this.abrirNovoChamado.emit();
  }

  onAbrirDetalhe(chamado: Chamado): void {
    this.abrirDetalhe.emit(chamado);
  }
}
