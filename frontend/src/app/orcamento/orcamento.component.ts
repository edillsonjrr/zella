import { Component, Inject, Optional, computed, inject, signal } from '@angular/core';
import { CurrencyPipe, DecimalPipe } from '@angular/common';
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
import type { OrdemServico, Orcamento, DecisaoForaContrato, ItemForaContratoPedido } from '../shared/models';

interface ItemSelecionado {
  itemContratoId: string;
  nome: string;
  unidadeMedida: string;
  quantidade: number;
  saldo: number;
  precoUnitario: number;
  selecionado: boolean;
}

// Item fora do contrato (Z3.5), como a prestadora preenche. Os números ficam
// null enquanto o campo está vazio.
interface LinhaForaContrato {
  descricao: string;
  quantidade: number | null;
  unidade: string;
  precoUnitario: number | null;
  // Só no orçamento já decidido, para mostrar o que a gestão fez.
  decisao?: DecisaoForaContrato;
}

interface OrcamentoDialogData {
  os: OrdemServico;
}

@Component({
  selector: 'app-orcamento',
  imports: [DecimalPipe, 
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
  // No celular os botões do rodapé ocupam a largura toda, um embaixo do outro.
  readonly celular = typeof matchMedia === 'function' && matchMedia('(max-width: 480px)').matches;

  os: OrdemServico = inject(MAT_DIALOG_DATA).os;
  orcamentoExistente = signal<Orcamento | undefined>(undefined);
  itensSelecionados = signal<ItemSelecionado[]>([]);
  itensFora = signal<LinhaForaContrato[]>([]);
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
    this.itensFora.update(lista => [...lista]);
  }

  acrescentarForaContrato(): void {
    this.itensFora.update(lista => [...lista, { descricao: '', quantidade: 1, unidade: 'un', precoUnitario: null }]);
    // Leva o foco para a descrição do item novo.
    setTimeout(() => {
      const campos = document.querySelectorAll<HTMLInputElement>('.fora-descricao input');
      campos[campos.length - 1]?.focus();
    });
  }

  removerForaContrato(indice: number): void {
    this.itensFora.update(lista => lista.filter((_, i) => i !== indice));
  }

  subtotalFora(f: LinhaForaContrato): number {
    return (Number(f.quantidade) || 0) * (Number(f.precoUnitario) || 0);
  }

  totalFora = computed(() => this.itensFora().reduce((s, f) => s + this.subtotalFora(f), 0));

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
      this.itensFora.set([]);
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
    this.itensFora.set(
      (orcamento?.itensForaContrato ?? []).map(f => ({
        descricao: f.descricao,
        quantidade: f.quantidade,
        unidade: f.unidade,
        precoUnitario: f.precoUnitario,
        // A decisão só vale para o orçamento que ela decidiu; no reenvio
        // depois de recusado, os itens voltam sem decisão.
        decisao: orcamento?.situacao === 'Aprovado' ? f.decisao : undefined
      }))
    );
  }

  salvar(): void {
    this.erro.set('');
    const selecionados = this.itensSelecionados().filter(i => i.selecionado);
    const fora = this.itensFora();
    if (!selecionados.length && !fora.length) {
      this.erro.set('Selecione ao menos um item do contrato ou acrescente um item fora do contrato.');
      return;
    }
    for (const item of selecionados) {
      if (!(Number(item.quantidade) > 0)) {
        this.erro.set(`Informe uma quantidade maior que zero para ${item.nome}.`);
        return;
      }
      if (Number(item.quantidade) > item.saldo) {
        this.erro.set(`Saldo insuficiente para ${item.nome}. Restam ${item.saldo} ${item.unidadeMedida} no contrato.`);
        return;
      }
    }

    for (const [i, f] of fora.entries()) {
      const qual = f.descricao.trim() ? `"${f.descricao.trim()}"` : `o item fora do contrato ${i + 1}`;
      if (f.descricao.trim().length < 3) {
        this.erro.set(`Escreva a descrição do item fora do contrato ${i + 1}.`);
        return;
      }
      if (!(Number(f.quantidade) > 0)) {
        this.erro.set(`Informe uma quantidade maior que zero para ${qual}.`);
        return;
      }
      if (!f.unidade.trim()) {
        this.erro.set(`Informe a unidade de ${qual} (un, m, h...).`);
        return;
      }
      if (!(Number(f.precoUnitario) > 0)) {
        this.erro.set(`Informe o preço unitário de ${qual}.`);
        return;
      }
    }

    // Só item e quantidade: nome e preço são copiados do contrato pela
    // Cloud Function. O preço mostrado aqui é informativo.
    const itens = selecionados.map(i => ({
      itemContratoId: i.itemContratoId,
      quantidade: Number(i.quantidade)
    }));
    // Fora do contrato vai com descrição, unidade e preço: não há contrato
    // de onde copiar.
    const itensForaContrato: ItemForaContratoPedido[] = fora.map(f => ({
      descricao: f.descricao.trim(),
      quantidade: Number(f.quantidade),
      unidade: f.unidade.trim(),
      precoUnitario: Number(f.precoUnitario)
    }));

    // Não existe Cloud Function pra editar um orçamento Pendente existente
    // (as rules bloqueiam escrita direta em orcamentos/*) — reenviar cria um
    // orçamento novo e o pendente anterior passa a "Substituído".
    this.salvando.set(true);
    this.erro.set('');
    this.dataService.criarOrcamento(this.os.id, itens, itensForaContrato)
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
