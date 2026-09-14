import { Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MatCardModule } from '@angular/material/card';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatDialog, MatDialogModule } from '@angular/material/dialog';
import { IconComponent } from '../shared/icon/icon.component';
import { FlowButtonComponent } from '../shared/flow-button/flow-button.component';
import { DataService } from '../shared/data.service';
import { UnidadeDetalheComponent } from '../unidade-detalhe/unidade-detalhe.component';
import type { Unidade } from '../shared/models';

@Component({
  selector: 'app-unidades',
  imports: [
    FormsModule,
    MatCardModule,
    MatButtonModule,
    MatFormFieldModule,
    MatInputModule,
    MatDialogModule,
    IconComponent,
    FlowButtonComponent
  ],
  templateUrl: './unidades.component.html',
  styleUrl: './unidades.component.scss'
})
export class UnidadesComponent {
  dataService = inject(DataService);
  private dialog = inject(MatDialog);

  unidades = this.dataService.unidades;

  editandoId = signal<string | null>(null);
  nome = '';
  sigla = '';

  private unidadesExpandidas = signal<Set<string>>(new Set());
  private blocosExpandidos = signal<Set<string>>(new Set());

  unidadeExpandida(id: string): boolean {
    return this.unidadesExpandidas().has(id);
  }

  blocoExpandido(id: string): boolean {
    return this.blocosExpandidos().has(id);
  }

  toggleUnidade(id: string): void {
    this.unidadesExpandidas.update(atual => {
      const proximo = new Set(atual);
      proximo.has(id) ? proximo.delete(id) : proximo.add(id);
      return proximo;
    });
  }

  toggleBloco(id: string): void {
    this.blocosExpandidos.update(atual => {
      const proximo = new Set(atual);
      proximo.has(id) ? proximo.delete(id) : proximo.add(id);
      return proximo;
    });
  }

  nova(): void {
    this.editandoId.set('novo');
    this.nome = '';
    this.sigla = '';
  }

  editar(unidade: Unidade): void {
    this.editandoId.set(unidade.id);
    this.nome = unidade.nome;
    this.sigla = unidade.sigla;
  }

  cancelar(): void {
    this.editandoId.set(null);
  }

  salvar(): void {
    if (!this.nome || !this.sigla) return;

    const id = this.editandoId();
    this.dataService.salvarUnidade({
      id: id && id !== 'novo' ? id : undefined,
      nome: this.nome,
      sigla: this.sigla
    });

    this.cancelar();
  }

  excluir(unidade: Unidade): void {
    if (confirm(`Deseja excluir a unidade ${unidade.nome}? Blocos, salas e equipamentos dela também serão removidos.`)) {
      this.dataService.excluirUnidade(unidade.id);
    }
  }

  gerenciarEstrutura(unidade: Unidade): void {
    this.dialog.open(UnidadeDetalheComponent, {
      panelClass: 'unidade-detalhe-dialog',
      data: unidade,
      position: { right: '0', top: '0' },
      height: '100vh',
      width: '360px',
      maxWidth: '100vw'
    });
  }
}
