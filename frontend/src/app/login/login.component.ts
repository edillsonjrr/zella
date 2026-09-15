import { Component, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { LoginBackgroundComponent } from '../login-background/login-background.component';
import { LogoComponent } from '../shared/logo/logo.component';
import { SpinnerComponent } from '../shared/spinner/spinner.component';
import { FlowButtonComponent } from '../shared/flow-button/flow-button.component';
import { AuthService } from '../shared/auth.service';

@Component({
  selector: 'app-login',
  standalone: true,
  imports: [FormsModule, LoginBackgroundComponent, LogoComponent, SpinnerComponent, FlowButtonComponent],
  templateUrl: './login.component.html',
  styleUrl: './login.component.scss'
})
export class LoginComponent {
  private auth = inject(AuthService);

  email = '';
  senha = '';

  erro = this.auth.erro;
  aviso = this.auth.aviso;
  carregando = this.auth.carregando;

  login(): void {
    if (!this.email || !this.senha) {
      this.auth.erro.set('Preencha e-mail e senha.');
      return;
    }
    this.auth.loginComEmailSenha(this.email, this.senha);
  }

  loginComGoogle(): void {
    this.auth.loginComGoogle();
  }

  definirSenha(): void {
    if (!this.email) {
      this.auth.erro.set('Digite seu e-mail no campo acima para receber o link.');
      return;
    }
    this.auth.enviarLinkDeSenha(this.email.trim());
  }
}
