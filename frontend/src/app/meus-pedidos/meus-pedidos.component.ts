import { Component, computed, inject } from '@angular/core';
import { DatePipe, NgTemplateOutlet } from '@angular/common';
import { MatDialog, MatDialogModule } from '@angular/material/dialog';
import { IconComponent } from '../shared/icon/icon.component';
import { DataService } from '../shared/data.service';
import { AuthService } from '../shared/auth.service';
import { NovoChamadoComponent } from '../novo-chamado/novo-chamado.component';
import { PedidoDetalheComponent } from './pedido-detalhe.component';
import { abrirItemDaUrl } from '../shared/abrir-pela-url';
import { prazoDoChamado, type PrazoChamado } from '../shared/chamado-prazo';
import { nomeUnidade, situacaoDoPedido, type SituacaoPedido } from '../shared/rotulos';
import type { Chamado } from '../shared/models';

interface PedidoView {
  chamado: Chamado;
  situacao: SituacaoPedido;
  onde: string;
  prazo: PrazoChamado | null;
}

/**
 * "Meus pedidos": a tela inicial da solicitante (perfil 'cliente'). Um botão
 * grande para pedir conserto e a lista dos pedidos dela, com a situação em
 * palavras de quem pediu. Ela não cai no painel de gestão.
 *
 * Só os pedidos que ela abriu: a leitura da unidade inteira (que as rules
 * permitem) traria os chamados da preventiva e de colegas, que ela poderia
 * achar que são dela.
 */
@Component({
  selector: 'app-meus-pedidos',
  imports: [DatePipe, NgTemplateOutlet, MatDialogModule, IconComponent],
  templateUrl: './meus-pedidos.component.html',
  styleUrl: './meus-pedidos.component.scss'
})
export class MeusPedidosComponent {
  private readonly dialog = inject(MatDialog);
  private readonly dataService = inject(DataService);
  private readonly auth = inject(AuthService);

  readonly usuario = this.auth.usuarioLogado;
  readonly primeiroNome = computed(() => (this.usuario().nome ?? '').trim().split(/\s+/)[0] ?? '');

  private readonly pedidos = computed<PedidoView[]>(() => {
    const meuId = this.usuario().id;
    return this.dataService
      .chamados()
      .filter(c => c.solicitanteId === meuId)
      .sort((a, b) => b.dataCriacao.localeCompare(a.dataCriacao) || b.numero.localeCompare(a.numero))
      .map(c => {
        const situacao = situacaoDoPedido(c.status);
        return {
          chamado: c,
          situacao,
          onde: [c.local, nomeUnidade(this.dataService.getUnidadeById(c.unidadeId), '')].filter(Boolean).join(' · '),
          prazo: situacao.tom === 'feito' || situacao.tom === 'cancelado' ? null : prazoDoChamado(c)
        };
      });
  });

  emAndamento = computed(() => this.pedidos().filter(p => p.situacao.tom === 'andamento' || p.situacao.tom === 'espera' || p.chamado.status === 'Executado'));
  concluidos = computed(() => this.pedidos().filter(p => p.chamado.status === 'Encerrado' || p.chamado.status === 'Cancelado'));
  totalPedidos = computed(() => this.pedidos().length);

  constructor() {
    // Notificação de um pedido: ?pedido=ID abre o detalhe dele.
    abrirItemDaUrl('pedido', id => this.dataService.getChamadoById(id), c => this.abrir(c));
  }

  pedirConserto(): void {
    this.dialog.open(NovoChamadoComponent, {
      width: '560px',
      maxWidth: '95vw',
      maxHeight: '90vh',
      panelClass: 'novo-chamado-dialog',
      autoFocus: false
    });
  }

  abrir(chamado: Chamado): void {
    this.dialog.open(PedidoDetalheComponent, {
      panelClass: 'chamado-detalhe-dialog',
      data: chamado,
      position: { right: '0', top: '0' },
      height: '100vh',
      width: '400px',
      maxWidth: '100vw'
    });
  }
}
