import { Component, Inject, inject, signal } from '@angular/core';
import { FormsModule, NgForm } from '@angular/forms';
import { MatCardModule } from '@angular/material/card';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatButtonModule } from '@angular/material/button';
import { MAT_DIALOG_DATA, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { IconComponent } from '../shared/icon/icon.component';
import { FlowButtonComponent } from '../shared/flow-button/flow-button.component';
import { DataService } from '../shared/data.service';
import type { Contrato, ItemContrato } from '../shared/models';

export interface ItemContratoFormData {
  contrato: Contrato;
  item?: ItemContrato;
}

@Component({
  selector: 'app-item-contrato-form',
  imports: [
    FormsModule,
    MatCardModule,
    MatFormFieldModule,
    MatInputModule,
    MatButtonModule,
    MatDialogModule,
    IconComponent,
    FlowButtonComponent
  ],
  templateUrl: './item-contrato-form.component.html',
  styleUrl: './item-contrato-form.component.scss'
})
export class ItemContratoFormComponent {
  private dataService = inject(DataService);
  private dialogRef = inject(MatDialogRef<ItemContratoFormComponent>);

  nome = '';
  unidadeMedida = 'un';
  quantidadeContratada = 1;
  precoUnitario = 0;

  erro = signal('');
  salvando = signal(false);

  constructor(@Inject(MAT_DIALOG_DATA) public data: ItemContratoFormData) {
    const item = data.item;
    if (item) {
      this.nome = item.nome;
      this.unidadeMedida = item.unidadeMedida;
      this.quantidadeContratada = item.quantidadeContratada;
      this.precoUnitario = item.precoUnitario;
    }
  }

  get isEdicao(): boolean {
    return !!this.data.item;
  }

  // Na edição a quantidade contratada é só leitura: ela muda por aditivo
  // (painel do contrato), que confere saldo e deixa registro. O serviço
  // ignora o valor quando o item já existe.
  async salvar(form: NgForm): Promise<void> {
    if (form.invalid) {
      form.control.markAllAsTouched();
      document.querySelector<HTMLElement>('.modal-scrollable-body .ng-invalid')?.focus();
      return;
    }

    this.erro.set('');
    this.salvando.set(true);

    try {
      await this.dataService.salvarItemContrato(this.data.contrato, {
        id: this.data.item?.id,
        nome: this.nome,
        unidadeMedida: this.unidadeMedida,
        quantidadeContratada: Number(this.quantidadeContratada),
        precoUnitario: Number(this.precoUnitario),
        // O serviço recalcula o saldo; estes campos vão só pra satisfazer o
        // tipo e são ignorados na escrita.
        quantidadeDisponivel: 0,
        quantidadeReservada: 0,
        quantidadeConsumida: 0
      });
      this.dialogRef.close(true);
    } catch (e) {
      this.erro.set(e instanceof Error ? e.message : 'Não foi possível salvar o item.');
    } finally {
      this.salvando.set(false);
    }
  }

  cancelar(): void {
    this.dialogRef.close();
  }
}
