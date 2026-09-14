import { Component, computed, inject } from '@angular/core';
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
import type { OrdemServico } from '../shared/models';

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

  // Abrir OS é do gestor e do gestor contratado (mesma linha de
  // permissoes.ts pra 'ordens-servico/nova'). Técnico e cliente só consultam.
  podeCriar = this.auth.isGestor() || this.auth.isGestorContratado();

  displayedColumns: string[] = ['numero', 'ativo', 'contrato', 'tecnico', 'status', 'orcamento', 'data', 'acoes'];
  tabSelecionada = 0;

  ordens = this.dataService.ordensServico;
  contratos = this.dataService.contratos;

  ordensView = computed(() => {
    return this.ordens().map(os => {
      const chamado = this.dataService.getChamadoById(os.chamadoId);
      const contrato = this.dataService.getContratoById(os.contratoId);
      const tecnico = this.dataService.getUsuarioById(os.tecnicoId ?? '');
      const orcamento = this.dataService.getOrcamentoByOS(os.id);
      return {
        ...os,
        ativo: chamado?.equipamento ?? '-',
        contrato: contrato ? `${contrato.numero} — ${contrato.fornecedor}` : '-',
        tecnico: tecnico?.nome ?? '-',
        orcamentoStatus: orcamento?.situacao ?? 'Sem orçamento',
        orcamentoTem: !!orcamento,
        data: os.dataCriacao
      };
    });
  });

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
    this.dialog.open(OsDetalheComponent, {
      panelClass: 'os-detalhe-dialog',
      data: ordem,
      position: { right: '0', top: '0' },
      height: '100vh',
      width: '320px',
      maxWidth: '100vw'
    });
  }

  badgeClass(status: string): string {
    switch (status) {
      case 'Aberta': return 'badge--aberta';
      case 'Em vistoria': return 'badge--vistoria';
      case 'Aprovada': return 'badge--aprovada';
      case 'Rejeitada': return 'badge--rejeitada';
      case 'Executada': return 'badge--executada';
      case 'Encerrada': return 'badge--encerrada';
      default: return '';
    }
  }

  statusIcon(status: string): string {
    switch (status) {
      case 'Aberta': return 'radio_button_unchecked';
      case 'Em vistoria': return 'search';
      case 'Aprovada': return 'check_circle';
      case 'Rejeitada': return 'cancel';
      case 'Executada': return 'check_circle';
      case 'Encerrada': return 'lock';
      default: return 'help';
    }
  }

  orcamentoBadgeClass(status: string): string {
    switch (status) {
      case 'Pendente': return 'badge--vistoria';
      case 'Aprovado': return 'badge--aprovada';
      case 'Rejeitado': return 'badge--rejeitada';
      case 'Substituído': return 'badge--encerrada';
      default: return '';
    }
  }

  orcamentoIcon(status: string): string {
    switch (status) {
      case 'Pendente': return 'request_quote';
      case 'Aprovado': return 'check_circle';
      case 'Rejeitado': return 'cancel';
      case 'Substituído': return 'clock';
      default: return 'add_circle';
    }
  }
}
