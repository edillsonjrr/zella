import { Component, Inject, inject, signal } from '@angular/core';
import { DatePipe } from '@angular/common';
import { FormsModule, NgForm } from '@angular/forms';
import { MatCardModule } from '@angular/material/card';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatButtonModule } from '@angular/material/button';
import { MAT_DIALOG_DATA, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { IconComponent } from '../shared/icon/icon.component';
import { FlowButtonComponent } from '../shared/flow-button/flow-button.component';
import { DataService } from '../shared/data.service';
import type { Contrato } from '../shared/models';

export interface AditivoContratoFormData {
  contrato: Contrato;
}

// Uma linha por item do contrato: a quantidade atual, o piso (o que já está
// reservado ou consumido não pode ser retirado) e a nova quantidade que a
// pessoa digita. Quem não mexer fica igual e não entra no aditivo.
interface LinhaItem {
  itemContratoId: string;
  nome: string;
  unidadeMedida: string;
  atual: number;
  minimo: number;
  nova: number;
}

/**
 * Aditivo de contrato: estende a vigência e/ou muda a quantidade contratada
 * dos itens. É a única porta pra isso depois que o contrato existe — o
 * formulário de item não deixa mais mexer na quantidade, e as rules travam
 * o campo. Quem grava é a Cloud Function `aditivarContrato`, que confere o
 * saldo e registra o aditivo com o log.
 */
@Component({
  selector: 'app-aditivo-contrato-form',
  imports: [
    FormsModule,
    DatePipe,
    MatCardModule,
    MatFormFieldModule,
    MatInputModule,
    MatButtonModule,
    MatDialogModule,
    IconComponent,
    FlowButtonComponent
  ],
  templateUrl: './aditivo-contrato-form.component.html',
  styleUrl: './aditivo-contrato-form.component.scss'
})
export class AditivoContratoFormComponent {
  private dataService = inject(DataService);
  private dialogRef = inject(MatDialogRef<AditivoContratoFormComponent>);

  contrato: Contrato;
  motivo = '';
  novaVigenciaFim: string;
  linhas: LinhaItem[];

  erro = signal('');
  salvando = signal(false);

  constructor(@Inject(MAT_DIALOG_DATA) public data: AditivoContratoFormData) {
    this.contrato = data.contrato;
    this.novaVigenciaFim = data.contrato.vigenciaFim;
    this.linhas = data.contrato.itens.map(item => ({
      itemContratoId: item.id,
      nome: item.nome,
      unidadeMedida: item.unidadeMedida,
      atual: item.quantidadeContratada,
      minimo: item.quantidadeReservada + item.quantidadeConsumida,
      nova: item.quantidadeContratada
    }));
  }

  get proximoNumero(): number {
    return (this.contrato.totalAditivos ?? 0) + 1;
  }

  get vigenciaMudou(): boolean {
    return !!this.novaVigenciaFim && this.novaVigenciaFim !== this.contrato.vigenciaFim;
  }

  get itensAlterados(): LinhaItem[] {
    return this.linhas.filter(l => Number(l.nova) !== l.atual);
  }

  get temMudanca(): boolean {
    return this.vigenciaMudou || this.itensAlterados.length > 0;
  }

  // Validação local, antes de chamar a função: o servidor repete as mesmas
  // checagens, mas errar aqui poupa uma ida e volta e mostra o problema ao
  // lado do campo.
  problemaLinha(linha: LinhaItem): string {
    const nova = Number(linha.nova);
    if (!Number.isFinite(nova) || nova < 0) return 'Informe um número maior ou igual a zero';
    if (nova < linha.minimo) return `Mínimo ${linha.minimo}`;
    return '';
  }

  get problemaVigencia(): string {
    if (!this.vigenciaMudou) return '';
    if (this.novaVigenciaFim < this.contrato.vigenciaFim) return 'Aditivo só estende a vigência';
    if (this.novaVigenciaFim <= this.contrato.vigenciaInicio) return 'Precisa terminar depois do início';
    return '';
  }

  delta(linha: LinhaItem): number {
    return Number(linha.nova) - linha.atual;
  }

  async salvar(form: NgForm): Promise<void> {
    if (form.invalid) {
      form.control.markAllAsTouched();
      return;
    }
    if (!this.temMudanca) {
      this.erro.set('Nada mudou: altere a vigência ou a quantidade de ao menos um item.');
      return;
    }
    if (this.problemaVigencia || this.linhas.some(l => this.problemaLinha(l))) {
      this.erro.set('Corrija os campos destacados antes de registrar o aditivo.');
      return;
    }

    this.erro.set('');
    this.salvando.set(true);

    try {
      await this.dataService.aditivarContrato({
        contratoId: this.contrato.id,
        motivo: this.motivo.trim(),
        ...(this.vigenciaMudou ? { novaVigenciaFim: this.novaVigenciaFim } : {}),
        itens: this.itensAlterados.map(l => ({
          itemContratoId: l.itemContratoId,
          novaQuantidadeContratada: Number(l.nova)
        }))
      });
      this.dialogRef.close(true);
    } catch (e) {
      this.erro.set(e instanceof Error ? e.message : 'Não foi possível registrar o aditivo.');
    } finally {
      this.salvando.set(false);
    }
  }

  cancelar(): void {
    this.dialogRef.close();
  }
}
