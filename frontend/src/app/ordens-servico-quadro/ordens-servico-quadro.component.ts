import { Component, EventEmitter, Input, Output, inject } from '@angular/core';
import { DatePipe } from '@angular/common';
import { IconComponent } from '../shared/icon/icon.component';
import { MatCardModule } from '@angular/material/card';
import { MatButtonModule } from '@angular/material/button';
import { DataService } from '../shared/data.service';
import { AuthService } from '../shared/auth.service';
import { agoraDaChave, corDoGrupo, rotuloDaChave, situacaoDaOS, type ChaveSituacao } from '../shared/situacao-servico';
import type { OrdemServico } from '../shared/models';

interface ColunaQuadro {
  chave: ChaveSituacao;
  titulo: string;
  // Quem age nesta coluna, numa frase.
  agora: string;
  corClasse: string;
  ordens: OrdemServico[];
}

interface OrdemView extends OrdemServico {
  ativo: string;
  contrato: string;
  tecnico: string;
}

// Colunas na ordem do fluxo, com o mesmo vocabulário do chamado (Z0.3).
// "Novo chamado" fica de fora: é etapa do chamado, antes de existir OS.
const CHAVES_DO_QUADRO: ChaveSituacao[] = [
  'aguardando-orcamento',
  'orcamento-recusado',
  'aguardando-aprovacao',
  'aprovado',
  'servico-feito',
  'encerrado'
];

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
  private auth = inject(AuthService);

  @Input() ordens: OrdemServico[] = [];
  // Só gestão e responsável da contratada criam OS (permissoes.ts).
  @Input() podeCriar = false;
  @Output() abrirNovaOs = new EventEmitter<void>();
  @Output() abrirDetalhe = new EventEmitter<OrdemServico>();

  colunas: ColunaQuadro[] = CHAVES_DO_QUADRO.map(chave => ({
    chave,
    titulo: rotuloDaChave(chave, this.auth.perfil),
    agora: agoraDaChave(chave, this.auth.perfil),
    corClasse: corDoGrupo(chave),
    ordens: []
  }));

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
    const porChave = new Map<ChaveSituacao, OrdemServico[]>();
    for (const os of this.ordens) {
      const chave = situacaoDaOS(this.dataService, os).chave;
      porChave.set(chave, [...(porChave.get(chave) ?? []), os]);
    }
    this.colunas.forEach(coluna => {
      coluna.ordens = porChave.get(coluna.chave) ?? [];
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
