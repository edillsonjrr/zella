import { Component, Inject, computed, inject, signal } from '@angular/core';
import { FormsModule, NgForm } from '@angular/forms';
import { MatCardModule } from '@angular/material/card';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { MatButtonModule } from '@angular/material/button';
import { MatSlideToggleModule } from '@angular/material/slide-toggle';
import { MAT_DIALOG_DATA, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { IconComponent } from '../shared/icon/icon.component';
import { FlowButtonComponent } from '../shared/flow-button/flow-button.component';
import { DataService } from '../shared/data.service';
import type { PlanoManutencao } from '../shared/models';

export const PERIODICIDADES: { dias: number; label: string }[] = [
  { dias: 30, label: 'Mensal' },
  { dias: 90, label: 'Trimestral' },
  { dias: 180, label: 'Semestral' },
  { dias: 365, label: 'Anual' }
];

@Component({
  selector: 'app-plano-form',
  imports: [
    FormsModule,
    MatCardModule,
    MatFormFieldModule,
    MatInputModule,
    MatSelectModule,
    MatButtonModule,
    MatSlideToggleModule,
    MatDialogModule,
    IconComponent,
    FlowButtonComponent
  ],
  templateUrl: './plano-form.component.html',
  styleUrl: './plano-form.component.scss'
})
export class PlanoFormComponent {
  private dataService = inject(DataService);
  private dialogRef = inject(MatDialogRef<PlanoFormComponent>);

  periodicidades = PERIODICIDADES;
  equipamentos = this.dataService.equipamentos;
  contratos = this.dataService.contratos;

  nome = '';
  equipamentoId = '';
  periodicidadeDias = 90;
  proximaExecucao = new Date().toISOString().split('T')[0];
  antecedenciaDias = 7;
  contratoId = '';
  itemContratoId = '';
  quantidadePrevista: number | null = null;
  ativo = true;

  salvando = signal(false);

  // Os itens dependem do contrato escolhido; sem isso o usuário veria itens
  // de contratos que não têm nada a ver com o plano.
  itensDoContrato = computed(() =>
    this.contratos().find(c => c.id === this.contratoIdSelecionado())?.itens ?? []
  );
  private contratoIdSelecionado = signal('');

  constructor(@Inject(MAT_DIALOG_DATA) public plano: PlanoManutencao | null) {
    if (plano) {
      this.nome = plano.nome;
      this.equipamentoId = plano.equipamentoId;
      this.periodicidadeDias = plano.periodicidadeDias;
      this.proximaExecucao = plano.proximaExecucao;
      this.antecedenciaDias = plano.antecedenciaDias;
      this.contratoId = plano.contratoId ?? '';
      this.itemContratoId = plano.itemContratoId ?? '';
      this.quantidadePrevista = plano.quantidadePrevista ?? null;
      this.ativo = plano.ativo;
      this.contratoIdSelecionado.set(this.contratoId);
    }
  }

  get isEdicao(): boolean {
    return !!this.plano;
  }

  aoTrocarContrato(id: string): void {
    this.contratoIdSelecionado.set(id);
    // Trocar de contrato invalida o item escolhido antes.
    this.itemContratoId = '';
  }

  descricaoEquipamento(equipamentoId: string): string {
    const eq = this.dataService.getEquipamentoById(equipamentoId);
    if (!eq) return equipamentoId;
    const sala = this.dataService.getSalaById(eq.salaId)?.nome;
    const unidade = this.dataService.getUnidadeById(eq.unidadeId)?.sigla;
    return [eq.nome, sala, unidade].filter(Boolean).join(' · ');
  }

  salvar(form: NgForm): void {
    if (form.invalid) {
      form.control.markAllAsTouched();
      document.querySelector<HTMLElement>('.modal-scrollable-body .ng-invalid')?.focus();
      return;
    }

    this.salvando.set(true);
    this.dataService.salvarPlanoManutencao({
      id: this.plano?.id,
      nome: this.nome,
      equipamentoId: this.equipamentoId,
      periodicidadeDias: Number(this.periodicidadeDias),
      proximaExecucao: this.proximaExecucao,
      antecedenciaDias: Number(this.antecedenciaDias),
      contratoId: this.contratoId || undefined,
      itemContratoId: this.itemContratoId || undefined,
      quantidadePrevista: this.quantidadePrevista ?? undefined,
      ativo: this.ativo
    });
    this.dialogRef.close(true);
  }

  cancelar(): void {
    this.dialogRef.close();
  }
}
