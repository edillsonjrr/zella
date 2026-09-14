import { Component, Inject, inject } from '@angular/core';
import { FormsModule, NgForm } from '@angular/forms';
import { MatCardModule } from '@angular/material/card';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { MatButtonModule } from '@angular/material/button';
import { MAT_DIALOG_DATA, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { IconComponent } from '../shared/icon/icon.component';
import { FlowButtonComponent } from '../shared/flow-button/flow-button.component';
import { DataService } from '../shared/data.service';
import type { PerfilUsuario, Usuario } from '../shared/models';

@Component({
  selector: 'app-usuario-form',
  imports: [
    FormsModule,
    MatCardModule,
    MatFormFieldModule,
    MatInputModule,
    MatSelectModule,
    MatButtonModule,
    MatDialogModule,
    IconComponent,
    FlowButtonComponent
  ],
  templateUrl: './usuario-form.component.html',
  styleUrl: './usuario-form.component.scss'
})
export class UsuarioFormComponent {
  private dataService = inject(DataService);
  private dialogRef = inject(MatDialogRef<UsuarioFormComponent>);

  unidades = this.dataService.unidades;
  empresasContratadas = this.dataService.empresasContratadas;
  erro = '';

  perfis: { value: PerfilUsuario; label: string }[] = [
    { value: 'cliente', label: 'Cliente' },
    { value: 'gestor', label: 'Gestor' },
    { value: 'gestor_contratado', label: 'Gestor contratado' },
    { value: 'tecnico', label: 'Técnico' }
  ];

  nome = '';
  email = '';
  perfil: PerfilUsuario = 'cliente';
  unidadeId = '';
  empresaContratadaId = '';

  constructor(@Inject(MAT_DIALOG_DATA) public data: Usuario | null) {
    if (data) {
      this.nome = data.nome;
      this.email = data.email;
      this.perfil = data.perfil;
      this.unidadeId = data.unidadeId ?? '';
      this.empresaContratadaId = data.empresaContratadaId ?? '';
    }
  }

  get exigeContratada(): boolean {
    return this.perfil === 'gestor_contratado' || this.perfil === 'tecnico';
  }

  get isEdicao(): boolean {
    return !!this.data;
  }

  salvar(form: NgForm): void {
    if (form.invalid) {
      form.control.markAllAsTouched();
      document.querySelector<HTMLElement>('.modal-scrollable-body .ng-invalid')?.focus();
      return;
    }

    const dados: Partial<Usuario> = {
      nome: this.nome,
      email: this.email,
      perfil: this.perfil
    };

    if (this.perfil === 'cliente' && this.unidadeId) {
      dados.unidadeId = this.unidadeId;
    }
    if (this.exigeContratada && this.empresaContratadaId) {
      dados.empresaContratadaId = this.empresaContratadaId;
    }

    try {
      this.dataService.salvarUsuario({
        id: this.data?.id,
        ...dados
      } as Omit<Usuario, 'id'> & { id?: string });
    } catch (e) {
      this.erro = (e as Error).message;
      return;
    }

    this.dialogRef.close();
  }

  cancelar(): void {
    this.dialogRef.close();
  }
}
