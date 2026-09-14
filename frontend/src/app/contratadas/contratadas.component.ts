import { Component, inject, signal } from '@angular/core';
import { FormsModule, NgForm } from '@angular/forms';
import { MatCardModule } from '@angular/material/card';
import { MatTableModule } from '@angular/material/table';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { IconComponent } from '../shared/icon/icon.component';
import { FlowButtonComponent } from '../shared/flow-button/flow-button.component';
import { DataService } from '../shared/data.service';
import type { EmpresaContratada } from '../shared/models';

/**
 * Empresas prestadoras de serviço do cliente. Gestor contratado e técnico
 * são vinculados a uma delas no cadastro de usuários, e o contrato aponta
 * pra que presta o serviço: é esse vínculo que limita cada contratada ao
 * que é dela.
 */
@Component({
  selector: 'app-contratadas',
  imports: [
    FormsModule,
    MatCardModule,
    MatTableModule,
    MatButtonModule,
    MatFormFieldModule,
    MatInputModule,
    IconComponent,
    FlowButtonComponent
  ],
  templateUrl: './contratadas.component.html',
  styleUrl: './contratadas.component.scss'
})
export class ContratadasComponent {
  dataService = inject(DataService);

  empresas = this.dataService.empresasContratadas;
  displayedColumns = ['nome', 'cnpj', 'contato', 'usuarios', 'contratos', 'acoes'];

  editandoId: string | null = null;
  nome = '';
  cnpj = '';
  contato = '';
  erro = signal('');

  get isEdicao(): boolean {
    return !!this.editandoId;
  }

  usuariosDe(id: string): number {
    return this.dataService.usuarios().filter(u => u.empresaContratadaId === id).length;
  }

  contratosDe(id: string): number {
    return this.dataService.contratos().filter(c => c.empresaContratadaId === id).length;
  }

  editar(empresa: EmpresaContratada): void {
    this.editandoId = empresa.id;
    this.nome = empresa.nome;
    this.cnpj = empresa.cnpj ?? '';
    this.contato = empresa.contato ?? '';
    this.erro.set('');
  }

  limpar(form?: NgForm): void {
    this.editandoId = null;
    this.nome = '';
    this.cnpj = '';
    this.contato = '';
    this.erro.set('');
    form?.resetForm();
  }

  salvar(form: NgForm): void {
    if (form.invalid) {
      form.control.markAllAsTouched();
      return;
    }
    this.dataService.salvarEmpresaContratada({
      id: this.editandoId ?? undefined,
      nome: this.nome.trim(),
      cnpj: this.cnpj.trim() || undefined,
      contato: this.contato.trim() || undefined
    });
    this.limpar(form);
  }

  excluir(empresa: EmpresaContratada): void {
    if (!confirm(`Excluir a empresa contratada ${empresa.nome}?`)) return;
    try {
      this.dataService.excluirEmpresaContratada(empresa.id);
    } catch (e) {
      this.erro.set((e as Error).message);
    }
  }
}
