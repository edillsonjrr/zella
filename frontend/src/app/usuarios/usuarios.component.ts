import { Component, inject } from '@angular/core';
import { MatCardModule } from '@angular/material/card';
import { MatTableModule } from '@angular/material/table';
import { MatButtonModule } from '@angular/material/button';
import { MatDialog, MatDialogModule } from '@angular/material/dialog';
import { IconComponent } from '../shared/icon/icon.component';
import { FlowButtonComponent } from '../shared/flow-button/flow-button.component';
import { DataService } from '../shared/data.service';
import { DialogoService } from '../shared/dialogo/dialogo.service';
import { UiFeedbackService } from '../shared/ui-feedback.service';
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
  private dialogo = inject(DialogoService);
  private feedback = inject(UiFeedbackService);
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

  async excluir(usuario: Usuario): Promise<void> {
    if (!(await this.dialogo.excluir(`Excluir o usuário ${usuario.nome}?`, 'A pessoa perde o acesso ao sistema.'))) return;
    try {
      await this.dataService.excluirUsuario(usuario.id);
    } catch (e) {
      this.feedback.announce(e instanceof Error ? e.message : 'Não foi possível excluir o usuário.', 'assertive');
    }
  }

  perfilLabel(perfil: PerfilUsuario): string {
    return this.perfis.find(p => p.value === perfil)?.label ?? perfil;
  }
}
