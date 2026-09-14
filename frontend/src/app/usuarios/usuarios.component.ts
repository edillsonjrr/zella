import { Component, inject } from '@angular/core';
import { MatCardModule } from '@angular/material/card';
import { MatTableModule } from '@angular/material/table';
import { MatButtonModule } from '@angular/material/button';
import { MatDialog, MatDialogModule } from '@angular/material/dialog';
import { IconComponent } from '../shared/icon/icon.component';
import { FlowButtonComponent } from '../shared/flow-button/flow-button.component';
import { DataService } from '../shared/data.service';
import { UsuarioFormComponent } from '../usuario-form/usuario-form.component';
import type { PerfilUsuario, Usuario } from '../shared/models';

@Component({
  selector: 'app-usuarios',
  imports: [
    MatCardModule,
    MatTableModule,
    MatButtonModule,
    MatDialogModule,
    IconComponent,
    FlowButtonComponent
  ],
  templateUrl: './usuarios.component.html',
  styleUrl: './usuarios.component.scss'
})
export class UsuariosComponent {
  dataService = inject(DataService);
  private dialog = inject(MatDialog);

  displayedColumns: string[] = ['nome', 'email', 'perfil', 'unidade', 'contratada', 'acoes'];
  usuarios = this.dataService.usuarios;

  perfis: { value: PerfilUsuario; label: string }[] = [
    { value: 'cliente', label: 'Cliente' },
    { value: 'gestor', label: 'Gestor' },
    { value: 'gestor_contratado', label: 'Gestor contratado' },
    { value: 'tecnico', label: 'Técnico' }
  ];

  nova(): void {
    this.dialog.open(UsuarioFormComponent, {
      width: '560px',
      maxWidth: '95vw',
      maxHeight: '90vh',
      panelClass: 'usuario-form-dialog',
      autoFocus: true,
      data: null
    });
  }

  editar(usuario: Usuario): void {
    this.dialog.open(UsuarioFormComponent, {
      width: '560px',
      maxWidth: '95vw',
      maxHeight: '90vh',
      panelClass: 'usuario-form-dialog',
      autoFocus: true,
      data: usuario
    });
  }

  excluir(usuario: Usuario): void {
    if (confirm(`Deseja excluir o usuário ${usuario.nome}?`)) {
      try {
        this.dataService.excluirUsuario(usuario.id);
      } catch (e) {
        alert((e as Error).message);
      }
    }
  }

  perfilLabel(perfil: PerfilUsuario): string {
    return this.perfis.find(p => p.value === perfil)?.label ?? perfil;
  }
}
