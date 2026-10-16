import { AuthService } from '../shared/auth.service';
import { podeAcessar } from '../shared/permissoes';
import { Component, signal, computed, inject, effect, untracked } from '@angular/core';
import { CountUpDirective } from '../shared/count-up.directive';
import { IconComponent } from '../shared/icon/icon.component';
import { MatCardModule } from '@angular/material/card';
import { MatTableModule } from '@angular/material/table';
import { MatButtonModule } from '@angular/material/button';
import { MatSelectModule } from '@angular/material/select';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatTooltipModule } from '@angular/material/tooltip';
import { RouterLink } from '@angular/router';
import { CurrencyPipe, DecimalPipe } from '@angular/common';
import { MatDialog, MatDialogModule } from '@angular/material/dialog';
import { SaldoDetalheComponent } from '../saldo-detalhe/saldo-detalhe.component';
import { DataService } from '../shared/data.service';
import { MiniManometroComponent } from '../shared/mini-manometro/mini-manometro.component';
import { LegendaSaldoComponent } from '../shared/legenda-saldo/legenda-saldo.component';
import { FORMULA_UTILIZACAO, avisoContaNaoFecha, contaSaldo, utilizacao } from '../shared/saldo';
import type { Contrato, ItemContrato } from '../shared/models';

export interface SaldoItemView {
  id: string;
  contratoId: string;
  item: string;
  contrato: string;
  unidadeMedida: string;
  contratado: number;
  consumido: number;
  reservado: number;
  disponivel: number;
  precoUnitario: number;
  // "Contratado 1.000 un = Usado 0 un + Separado 50 un + Livre 950 un"
  conta: string;
  // Só quando a conta não fecha (dado antigo): diz quanto falta ou sobra.
  avisoConta: string;
}

@Component({
  selector: 'app-painel-saldo',
  imports: [DecimalPipe, 
    CountUpDirective,
    CurrencyPipe,
    MatCardModule,
    MatTableModule,
    MiniManometroComponent,
    LegendaSaldoComponent,
    IconComponent,
    MatButtonModule,
    MatSelectModule,
    MatFormFieldModule,
    MatTooltipModule,
    RouterLink,
    MatDialogModule
  ],
  templateUrl: './painel-saldo.component.html',
  styleUrl: './painel-saldo.component.scss'
})
export class PainelSaldoComponent {
  private dialog = inject(MatDialog);
  private dataService = inject(DataService);
  // Importar contratos é tela só do gestor (permissoes.ts): a contratada não
  // vê um botão que a barraria no clique.
  readonly podeImportar = podeAcessar(inject(AuthService).perfil, 'contratos/importar');

  displayedColumns: string[] = ['item', 'contratado', 'consumido', 'reservado', 'disponivel', 'alerta'];
  readonly formulaUtilizacao = FORMULA_UTILIZACAO;

  contratoSelecionado = signal<Contrato | null>(null);

  contratos = this.dataService.contratos;

  itensFiltrados = computed(() => {
    const contrato = this.contratoSelecionado();
    if (!contrato) return [];
    return contrato.itens.map(i => this.mapItem(i, contrato));
  });

  // O mesmo saldo em reais (quantidade × preço do item). O aviso do sino fala
  // em R$ ("orçamento de R$ 74,00"); sem isto a tela só mostrava quantidade.
  totaisEmReais = computed(() => {
    const itens = this.itensFiltrados();
    const soma = (campo: 'contratado' | 'consumido' | 'reservado' | 'disponivel') =>
      itens.reduce((total, i) => total + i[campo] * i.precoUnitario, 0);
    return { contratado: soma('contratado'), usado: soma('consumido'), separado: soma('reservado'), livre: soma('disponivel') };
  });

  // A tela abre já com o primeiro contrato escolhido (antes abria com um
  // cartão enorme pedindo para escolher). Se os dados mudarem, a escolha é
  // relida pelo id, para não mostrar um contrato desatualizado.
  private readonly escolherContrato = effect(() => {
    const lista = this.contratos();
    const atual = untracked(this.contratoSelecionado);
    const novo = (atual && lista.find(c => c.id === atual.id)) || lista[0] || null;
    if (novo !== atual) this.contratoSelecionado.set(novo);
  });

  selecionarContrato(contrato: Contrato | null): void {
    this.contratoSelecionado.set(contrato);
  }

  compararContratos(a: Contrato | null, b: Contrato | null): boolean {
    return !!a && !!b && a.id === b.id;
  }

  abrirDetalhe(item: SaldoItemView): void {
    const contrato = this.contratoSelecionado();
    if (!contrato) return;

    this.dialog.open(SaldoDetalheComponent, {
      panelClass: 'saldo-detalhe-dialog',
      data: { item, contrato },
      position: { right: '0', top: '0' },
      height: '100vh',
      width: '400px',
      maxWidth: '100vw'
    });
  }

  percentual(item: SaldoItemView): number {
    return utilizacao({ quantidadeContratada: item.contratado, quantidadeConsumida: item.consumido, quantidadeReservada: item.reservado });
  }

  private mapItem(item: ItemContrato, contrato: Contrato): SaldoItemView {
    return {
      id: item.id,
      contratoId: contrato.id,
      conta: contaSaldo(item),
      avisoConta: avisoContaNaoFecha(item),
      item: item.nome,
      contrato: contrato.numero,
      unidadeMedida: item.unidadeMedida,
      contratado: item.quantidadeContratada,
      consumido: item.quantidadeConsumida,
      reservado: item.quantidadeReservada,
      disponivel: item.quantidadeDisponivel,
      precoUnitario: item.precoUnitario
    };
  }
}
