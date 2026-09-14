import { Component, computed, inject, signal } from '@angular/core';
import { MatCardModule } from '@angular/material/card';
import { MatButtonModule } from '@angular/material/button';
import { MatTableModule } from '@angular/material/table';
import { MatDialog, MatDialogModule } from '@angular/material/dialog';
import { IconComponent } from '../shared/icon/icon.component';
import { FlowButtonComponent } from '../shared/flow-button/flow-button.component';
import { DataService } from '../shared/data.service';
import { DialogoService } from '../shared/dialogo/dialogo.service';
import { UiFeedbackService } from '../shared/ui-feedback.service';
import { PlanoFormComponent, PERIODICIDADES } from '../plano-form/plano-form.component';
import type { PlanoManutencao } from '../shared/models';

interface PlanoView extends PlanoManutencao {
  equipamentoNome: string;
  local: string;
  periodicidadeLabel: string;
  proximaFormatada: string;
  diasRestantes: number;
  situacao: 'atrasado' | 'proximo' | 'em-dia' | 'inativo';
  situacaoLabel: string;
  itemNome?: string;
}

@Component({
  selector: 'app-preventiva',
  imports: [MatCardModule, MatButtonModule, MatTableModule, MatDialogModule, IconComponent, FlowButtonComponent],
  templateUrl: './preventiva.component.html',
  styleUrl: './preventiva.component.scss'
})
export class PreventivaComponent {
  private dataService = inject(DataService);
  private dialogo = inject(DialogoService);
  private feedback = inject(UiFeedbackService);
  private dialog = inject(MatDialog);

  displayedColumns = ['nome', 'equipamento', 'periodicidade', 'proxima', 'situacao', 'acoes'];

  planos = computed<PlanoView[]>(() =>
    this.dataService.planosManutencao()
      .map(p => this.toView(p))
      // Quem está atrasado tem que aparecer primeiro; depois, o que vence
      // antes. Inativo vai pro fim.
      .sort((a, b) => {
        if (a.ativo !== b.ativo) return a.ativo ? -1 : 1;
        return a.diasRestantes - b.diasRestantes;
      })
  );

  resumo = computed(() => {
    const lista = this.planos().filter(p => p.ativo);
    return {
      total: lista.length,
      atrasados: lista.filter(p => p.situacao === 'atrasado').length,
      proximos: lista.filter(p => p.situacao === 'proximo').length,
      // Projeção anual: quantas execuções esses planos geram em 12 meses.
      // É o número que sustenta conversa de orçamento com o cliente.
      execucoesAno: lista.reduce((soma, p) => soma + Math.round(365 / p.periodicidadeDias), 0)
    };
  });

  custoAnualPrevisto = computed(() => {
    let total = 0;
    for (const plano of this.dataService.planosManutencao()) {
      if (!plano.ativo || !plano.contratoId || !plano.itemContratoId || !plano.quantidadePrevista) continue;
      const item = this.dataService.getContratoById(plano.contratoId)?.itens.find(i => i.id === plano.itemContratoId);
      if (!item) continue;
      total += Math.round(365 / plano.periodicidadeDias) * plano.quantidadePrevista * item.precoUnitario;
    }
    return total;
  });

  private toView(plano: PlanoManutencao): PlanoView {
    const equipamento = this.dataService.getEquipamentoById(plano.equipamentoId);
    const sala = equipamento ? this.dataService.getSalaById(equipamento.salaId)?.nome : undefined;
    const unidade = equipamento ? this.dataService.getUnidadeById(equipamento.unidadeId)?.sigla : undefined;
    const item = plano.contratoId && plano.itemContratoId
      ? this.dataService.getContratoById(plano.contratoId)?.itens.find(i => i.id === plano.itemContratoId)
      : undefined;

    const dias = this.diasAte(plano.proximaExecucao);
    const situacao = !plano.ativo
      ? 'inativo'
      : dias < 0 ? 'atrasado'
      : dias <= plano.antecedenciaDias ? 'proximo'
      : 'em-dia';

    return {
      ...plano,
      equipamentoNome: equipamento?.nome ?? '—',
      local: [sala, unidade].filter(Boolean).join(' · ') || '—',
      periodicidadeLabel: PERIODICIDADES.find(p => p.dias === plano.periodicidadeDias)?.label ?? `${plano.periodicidadeDias} dias`,
      proximaFormatada: this.formatarData(plano.proximaExecucao),
      diasRestantes: dias,
      situacao,
      situacaoLabel: this.rotuloSituacao(situacao, dias),
      itemNome: item?.nome
    };
  }

  private diasAte(data: string): number {
    const hoje = new Date();
    hoje.setHours(0, 0, 0, 0);
    const alvo = new Date(`${data}T00:00:00`);
    return Math.round((alvo.getTime() - hoje.getTime()) / 86400000);
  }

  private rotuloSituacao(situacao: PlanoView['situacao'], dias: number): string {
    switch (situacao) {
      case 'inativo': return 'Inativo';
      case 'atrasado': return `Atrasado ${Math.abs(dias)} dia(s)`;
      case 'proximo': return dias === 0 ? 'Hoje' : `Em ${dias} dia(s)`;
      default: return `Em ${dias} dia(s)`;
    }
  }

  private formatarData(data: string): string {
    return new Date(`${data}T00:00:00`).toLocaleDateString('pt-BR');
  }

  formatarMoeda(valor: number): string {
    return valor.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
  }

  gerando = signal(false);
  resultadoGeracao = signal<string>('');

  async gerarAgora(): Promise<void> {
    this.gerando.set(true);
    this.resultadoGeracao.set('');
    try {
      const r = await this.dataService.rodarPreventivaAgora();
      this.resultadoGeracao.set(
        r.gerados
          ? `${r.gerados} chamado(s) gerado(s).`
          : 'Nenhum plano venceu a janela de antecedência agora.'
      );
    } catch (e) {
      this.resultadoGeracao.set(e instanceof Error ? e.message : 'Falha ao gerar.');
    } finally {
      this.gerando.set(false);
    }
  }

  novo(): void {
    this.abrirForm(null);
  }

  editar(plano: PlanoManutencao): void {
    this.abrirForm(plano);
  }

  private abrirForm(plano: PlanoManutencao | null): void {
    this.dialog.open(PlanoFormComponent, {
      width: '620px',
      maxWidth: '95vw',
      maxHeight: '90vh',
      panelClass: 'usuario-form-dialog',
      autoFocus: true,
      data: plano
    });
  }

  async excluir(plano: PlanoManutencao): Promise<void> {
    if (!(await this.dialogo.excluir(`Excluir o plano "${plano.nome}"?`, 'Os chamados já gerados por ele continuam existindo.'))) return;
    try {
      await this.dataService.excluirPlanoManutencao(plano.id);
    } catch (e) {
      this.feedback.announce(e instanceof Error ? e.message : 'Não foi possível excluir o plano.', 'assertive');
    }
  }
}
