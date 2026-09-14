import { Component, inject, signal } from '@angular/core';
import { FormsModule, NgForm } from '@angular/forms';
import { MatCardModule } from '@angular/material/card';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatButtonModule } from '@angular/material/button';
import { updateDoc } from 'firebase/firestore';
import { sendPasswordResetEmail, updateProfile } from 'firebase/auth';
import { auth } from '../shared/firebase';
import { IconComponent } from '../shared/icon/icon.component';
import { FlowButtonComponent } from '../shared/flow-button/flow-button.component';
import { AuthService } from '../shared/auth.service';
import { DataService } from '../shared/data.service';

const ROTULO_PERFIL: Record<string, string> = {
  cliente: 'Cliente',
  gestor: 'Gestor',
  gestor_contratado: 'Gestor contratado',
  tecnico: 'Técnico'
};

/**
 * Dados da própria pessoa. Só o nome é editável aqui (a regra do Firestore
 * deixa cada um trocar só o próprio nome); perfil, e-mail e vínculos são do
 * gestor. A senha muda pelo mesmo e-mail de redefinição da tela de login.
 */
@Component({
  selector: 'app-minha-conta',
  imports: [FormsModule, MatCardModule, MatFormFieldModule, MatInputModule, MatButtonModule, IconComponent, FlowButtonComponent],
  templateUrl: './minha-conta.component.html',
  styleUrl: './minha-conta.component.scss'
})
export class MinhaContaComponent {
  private auth = inject(AuthService);
  private dataService = inject(DataService);

  usuario = this.auth.usuarioLogado;
  nome = this.usuario().nome;
  salvando = signal(false);
  aviso = signal('');
  erro = signal('');

  get perfilRotulo(): string {
    return ROTULO_PERFIL[this.usuario().perfil] ?? this.usuario().perfil;
  }

  get unidadeNome(): string {
    return this.dataService.getUnidadeById(this.usuario().unidadeId ?? '')?.nome ?? '';
  }

  get contratadaNome(): string {
    return this.dataService.getEmpresaContratadaById(this.usuario().empresaContratadaId)?.nome ?? '';
  }

  async salvarNome(form: NgForm): Promise<void> {
    if (form.invalid) {
      form.control.markAllAsTouched();
      return;
    }
    this.erro.set('');
    this.aviso.set('');
    this.salvando.set(true);
    try {
      const nome = this.nome.trim();
      await updateDoc(this.dataService.docRef('usuarios', this.usuario().id), { nome });
      if (auth.currentUser) await updateProfile(auth.currentUser, { displayName: nome });
      this.aviso.set('Nome atualizado. Ele aparece corrigido no próximo login.');
    } catch {
      this.erro.set('Não foi possível salvar o nome.');
    } finally {
      this.salvando.set(false);
    }
  }

  async alterarSenha(): Promise<void> {
    this.erro.set('');
    this.aviso.set('');
    try {
      await sendPasswordResetEmail(auth, this.usuario().email);
      this.aviso.set(`Enviamos um e-mail para ${this.usuario().email} com o link para definir a nova senha.`);
    } catch {
      this.erro.set('Não foi possível enviar o e-mail de redefinição.');
    }
  }
}
