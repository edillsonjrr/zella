import { Injectable, inject } from '@angular/core';
import { MatDialog } from '@angular/material/dialog';
import { firstValueFrom } from 'rxjs';
import { DataService } from './data.service';
import { AprovarOrcamentoDialogComponent } from '../os-detalhe/aprovar-orcamento-dialog.component';
import { ExecutarOsDialogComponent } from '../os-detalhe/executar-os-dialog.component';
import { EncerrarChamadoDialogComponent } from '../chamado-detalhe/encerrar-chamado-dialog.component';
import type { Chamado, OrdemServico } from './models';

/**
 * As três ações do fluxo que mexem em saldo ou fecham o pedido passam por
 * uma janela de conferência, venha o clique de onde vier (painel da OS,
 * cartão da lista, arrastar no quadro):
 *
 * - aprovar: mostra os itens do orçamento antes do botão;
 * - registrar serviço feito: já preenchido com o aprovado, foto à mão;
 * - encerrar: mostra OS, técnico, observação, itens e custo.
 *
 * Cada janela faz a chamada e mostra o erro dentro dela; aqui só se abre e
 * se espera o resultado (`true` quando a ação aconteceu).
 */
@Injectable({ providedIn: 'root' })
export class FluxoAcoesService {
  private readonly dialog = inject(MatDialog);
  private readonly dataService = inject(DataService);

  async aprovarOrcamento(os: OrdemServico): Promise<boolean> {
    const orcamento = this.dataService.getOrcamentoByOS(os.id);
    if (!orcamento || orcamento.situacao !== 'Pendente') return false;
    const ref = this.dialog.open(AprovarOrcamentoDialogComponent, {
      panelClass: 'usuario-form-dialog',
      width: '520px',
      maxWidth: '95vw',
      maxHeight: '90vh',
      data: { numeroOS: os.numero, orcamento }
    });
    return (await firstValueFrom(ref.afterClosed())) === true;
  }

  async registrarServico(os: OrdemServico): Promise<boolean> {
    const chamado = this.dataService.getChamadoById(os.chamadoId);
    const unidade = chamado ? this.dataService.getUnidadeById(chamado.unidadeId)?.nome : undefined;
    const local = [chamado?.local, unidade].filter(Boolean).join(', ');
    const ref = this.dialog.open(ExecutarOsDialogComponent, {
      panelClass: 'usuario-form-dialog',
      width: '520px',
      maxWidth: '95vw',
      maxHeight: '90vh',
      autoFocus: false,
      data: {
        osId: os.id,
        numeroOS: os.numero,
        equipamento: chamado?.equipamento,
        local: local || undefined,
        orcamento: this.dataService.getOrcamentoByOS(os.id)
      }
    });
    return (await firstValueFrom(ref.afterClosed())) === true;
  }

  async encerrarChamado(chamado: Chamado): Promise<boolean> {
    const ref = this.dialog.open(EncerrarChamadoDialogComponent, {
      panelClass: 'usuario-form-dialog',
      width: '540px',
      maxWidth: '95vw',
      maxHeight: '90vh',
      autoFocus: false,
      data: chamado
    });
    return (await firstValueFrom(ref.afterClosed())) === true;
  }
}
