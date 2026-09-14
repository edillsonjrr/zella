import { Component, EventEmitter, Input, Output, inject } from '@angular/core';
import { DatePipe } from '@angular/common';
import { IconComponent } from '../shared/icon/icon.component';
import { MatCardModule } from '@angular/material/card';
import { MatButtonModule } from '@angular/material/button';
import { DataService } from '../shared/data.service';
import type { OrdemServico } from '../shared/models';

type StatusOs = 'Aberta' | 'Em vistoria' | 'Aprovada' | 'Rejeitada' | 'Executada' | 'Encerrada';

interface ColunaQuadro {
  status: StatusOs;
  titulo: string;
  icone: string;
  corClasse: string;
  ordens: OrdemServico[];
}

interface OrdemView extends OrdemServico {
  ativo: string;
  contrato: string;
  tecnico: string;
}

@Component({
  selector: 'app-ordens-servico-quadro',
  imports: [
    MatCardModule,
    MatButtonModule,
    IconComponent,
    DatePipe
  ],
  templateUrl: './ordens-servico-quadro.component.html',
  styleUrl: './ordens-servico-quadro.component.scss'
})
export class OrdensServicoQuadroComponent {
  private dataService = inject(DataService);

  @Input() ordens: OrdemServico[] = [];
  @Output() abrirNovaOs = new EventEmitter<void>();
  @Output() abrirDetalhe = new EventEmitter<OrdemServico>();

  colunas: ColunaQuadro[] = [
    { status: 'Aberta', titulo: 'Aberta', icone: 'radio_button_unchecked', corClasse: 'info', ordens: [] },
    { status: 'Em vistoria', titulo: 'Em vistoria', icone: 'search', corClasse: 'warning', ordens: [] },
    { status: 'Aprovada', titulo: 'Aprovada', icone: 'check_circle', corClasse: 'success', ordens: [] },
    { status: 'Rejeitada', titulo: 'Rejeitada', icone: 'cancel', corClasse: 'danger', ordens: [] },
    { status: 'Executada', titulo: 'Executada', icone: 'check_circle', corClasse: 'primary-accent', ordens: [] },
    { status: 'Encerrada', titulo: 'Encerrada', icone: 'lock', corClasse: 'success', ordens: [] }
  ];

  private toView(os: OrdemServico): OrdemView {
    const chamado = this.dataService.getChamadoById(os.chamadoId);
    const contrato = this.dataService.getContratoById(os.contratoId);
    const tecnico = this.dataService.getUsuarioById(os.tecnicoId ?? '');
    return {
      ...os,
      ativo: chamado?.equipamento ?? '-',
      contrato: contrato ? `${contrato.numero} — ${contrato.fornecedor}` : '-',
      tecnico: tecnico?.nome ?? '-'
    };
  }

  ngOnChanges(): void {
    this.colunas.forEach(coluna => {
      coluna.ordens = this.ordens.filter(o => o.situacao === coluna.status);
    });
  }

  ordensDaColuna(coluna: ColunaQuadro): OrdemView[] {
    return coluna.ordens.map(o => this.toView(o));
  }

  onAbrirNovaOs(): void {
    this.abrirNovaOs.emit();
  }

  onAbrirDetalhe(ordem: OrdemServico): void {
    this.abrirDetalhe.emit(ordem);
  }
}
