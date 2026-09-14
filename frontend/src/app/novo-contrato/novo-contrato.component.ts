import { Component, Inject, Optional, inject } from '@angular/core';
import { IconComponent } from '../shared/icon/icon.component';
import { FlowButtonComponent } from '../shared/flow-button/flow-button.component';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { MatCardModule } from '@angular/material/card';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { MatButtonModule } from '@angular/material/button';
import { MatDividerModule } from '@angular/material/divider';
import { MatDialogModule, MAT_DIALOG_DATA, MatDialogRef } from '@angular/material/dialog';
import { DataService } from '../shared/data.service';
import type { ItemContrato } from '../shared/models';

@Component({
  selector: 'app-novo-contrato',
  imports: [
    FormsModule,
    MatCardModule,
    MatFormFieldModule,
    MatInputModule,
    MatSelectModule,
    MatButtonModule,
    IconComponent,
    FlowButtonComponent,
    MatDividerModule,
    MatDialogModule
  ],
  templateUrl: './novo-contrato.component.html',
  styleUrl: './novo-contrato.component.scss'
})
export class NovoContratoComponent {
  private dataService = inject(DataService);

  empresasContratadas = this.dataService.empresasContratadas;

  numero = '';
  fornecedor = '';
  empresaContratadaId = '';
  vigenciaInicio = '';
  vigenciaFim = '';
  itens: ItemContrato[] = [
    this.criarItemVazio()
  ];

  constructor(
    private router: Router,
    @Optional() private dialogRef: MatDialogRef<NovoContratoComponent>,
    @Optional() @Inject(MAT_DIALOG_DATA) public data: any
  ) {}

  get isDialog(): boolean {
    return !!this.dialogRef;
  }

  private criarItemVazio(): ItemContrato {
    return {
      id: '',
      nome: '',
      unidadeMedida: 'un',
      quantidadeContratada: 1,
      quantidadeDisponivel: 1,
      quantidadeReservada: 0,
      quantidadeConsumida: 0,
      precoUnitario: 0
    };
  }

  selecionarContratada(id: string): void {
    const empresa = this.empresasContratadas().find(e => e.id === id);
    if (empresa && !this.fornecedor) this.fornecedor = empresa.nome;
  }

  adicionarItem(): void {
    this.itens.push(this.criarItemVazio());
  }

  removerItem(index: number): void {
    this.itens.splice(index, 1);
  }

  salvar(): void {
    if (!this.numero || !this.fornecedor || !this.vigenciaInicio || !this.vigenciaFim || !this.itens.length) return;

    this.dataService.criarContrato(
      {
        numero: this.numero,
        fornecedor: this.fornecedor,
        ...(this.empresaContratadaId ? { empresaContratadaId: this.empresaContratadaId } : {}),
        vigenciaInicio: this.vigenciaInicio,
        vigenciaFim: this.vigenciaFim,
        status: 'Ativo'
      },
      this.itens
    );

    this.fechar();
  }

  cancelar(): void {
    this.fechar();
  }

  private fechar(): void {
    if (this.dialogRef) {
      this.dialogRef.close();
    } else {
      this.router.navigate(['/contratos']);
    }
  }
}
