import { Component, Inject, Optional, computed, inject, signal } from '@angular/core';
import { CurrencyPipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { MatCardModule } from '@angular/material/card';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { MatButtonModule } from '@angular/material/button';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { MatDividerModule } from '@angular/material/divider';
import { MatDialogModule, MAT_DIALOG_DATA, MatDialogRef } from '@angular/material/dialog';
import { IconComponent } from '../shared/icon/icon.component';
import { FlowButtonComponent } from '../shared/flow-button/flow-button.component';
import { DataService } from '../shared/data.service';
import type { OrdemServico, Contrato, Orcamento } from '../shared/models';

interface ItemSelecionado {
  itemContratoId: string;
  nome: string;
  unidadeMedida: string;
  quantidade: number;
  saldo: number;
  precoUnitario: number;
  selecionado: boolean;
}

interface OrcamentoDialogData {
  os: OrdemServico;
}

@Component({
  selector: 'app-orcamento',
  imports: [
    FormsModule,
    CurrencyPipe,
    MatCardModule,
    MatFormFieldModule,
    MatInputModule,
    MatSelectModule,
    MatButtonModule,
    MatCheckboxModule,
    MatDividerModule,
    MatDialogModule,
    IconComponent,
    FlowButtonComponent
  ],
  templateUrl: './orcamento.component.html',
  styleUrl: './orcamento.component.scss'
})
export class OrcamentoComponent {
  private dataService = inject(DataService);

  os: OrdemServico = inject(MAT_DIALOG_DATA).os;
  orcamentoExistente = signal<Orcamento | undefined>(undefined);
  itensSelecionados = signal<ItemSelecionado[]>([]);
  salvando = signal(false);
  erro = signal('');

  contrato = computed(() => this.dataService.getContratoById(this.os.contratoId));
  // Só leitura quando não cabe mais orçamento novo: aprovado (a reserva já
  // foi feita) ou OS fora das situações que aceitam orçamento. Rejeitado e
  // Substituído continuam editáveis — servem de ponto de partida pro novo.
  modoLeitura = computed(() => {
    const orc = this.orcamentoExistente();
    if (orc?.situacao === 'Aprovado') return true;
    return !['Aberta', 'Em vistoria', 'Rejeitada'].includes(this.os.situacao);
  });

  // Marcar um item já sugere 1 unidade; o total acompanha cada mudança.
  aoMarcar(item: { selecionado: boolean; quantidade: number; saldo: number }): void {
    if (item.selecionado && !(Number(item.quantidade) > 0) && item.saldo > 0) item.quantidade = 1;
    this.recalcular();
  }

  recalcular(): void {
    this.itensSelecionados.update(lista => [...lista]);
  }

  total = computed(() => {
    return this.itensSelecionados()
      .filter(i => i.selecionado)
      .reduce((acc, i) => acc + (Number(i.quantidade) || 0) * i.precoUnitario, 0);
  });

  constructor(
    @Optional() private dialogRef: MatDialogRef<OrcamentoComponent>,
    @Optional() @Inject(MAT_DIALOG_DATA) public data: OrcamentoDialogData
  ) {
    this.carregarOrcamento();
  }

  private carregarOrcamento(): void {
    const orcamento = this.dataService.getOrcamentoByOS(this.os.id);
    this.orcamentoExistente.set(orcamento);

    const contrato = this.contrato();
    if (!contrato) {
      this.itensSelecionados.set([]);
      return;
    }

    const itens: ItemSelecionado[] = contrato.itens.map(item => {
      const orcItem = orcamento?.itens.find(i => i.itemContratoId === item.id);
      return {
        itemContratoId: item.id,
        nome: item.nome,
        unidadeMedida: item.unidadeMedida,
        quantidade: orcItem?.quantidade ?? 0,
        saldo: item.quantidadeDisponivel,
        precoUnitario: item.precoUnitario,
        selecionado: !!orcItem
      };
    });

    this.itensSelecionados.set(itens);
  }

  salvar(): void {
    this.erro.set('');
    const selecionados = this.itensSelecionados().filter(i => i.selecionado);
    if (!selecionados.length) {
      this.erro.set('Selecione ao menos um item.');
      return;
    }
    for (const item of selecionados) {
      if (!(Number(item.quantidade) > 0)) {
        this.erro.set(`Informe uma quantidade maior que zero para ${item.nome}.`);
        return;
      }
      if (Number(item.quantidade) > item.saldo) {
        this.erro.set(`Saldo insuficiente para ${item.nome}. Disponível: ${item.saldo}.`);
        return;
      }
    }

    // Só item e quantidade: nome e preço são copiados do contrato pela
    // Cloud Function. O preço mostrado aqui é informativo.
    const itens = selecionados.map(i => ({
      itemContratoId: i.itemContratoId,
      quantidade: Number(i.quantidade)
    }));

    // Não existe Cloud Function pra editar um orçamento Pendente existente
    // (as rules bloqueiam escrita direta em orcamentos/*) — reenviar cria um
    // orçamento novo e o pendente anterior passa a "Substituído".
    this.salvando.set(true);
    this.erro.set('');
    this.dataService.criarOrcamento(this.os.id, itens)
      .then(() => this.fechar())
      .catch((e: unknown) => this.erro.set(e instanceof Error ? e.message : 'Não foi possível salvar o orçamento.'))
      .finally(() => this.salvando.set(false));
  }

  fechar(): void {
    if (this.dialogRef) {
      this.dialogRef.close();
    }
  }
}
