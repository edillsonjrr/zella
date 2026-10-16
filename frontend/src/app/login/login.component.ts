import { IconComponent } from '../shared/icon/icon.component';
import { Component, DestroyRef, computed, effect, inject, signal } from '@angular/core';
import { NgComponentOutlet } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { LoginBackgroundComponent } from '../login-background/login-background.component';
import { LogoComponent } from '../shared/logo/logo.component';
import { SpinnerComponent } from '../shared/spinner/spinner.component';
import { FlowButtonComponent } from '../shared/flow-button/flow-button.component';
import { AuthService } from '../shared/auth.service';
import { linkEmail, linkWhatsapp } from '../shared/comercial.config';
import { ENTRADA_SEM_SENHA } from '../shared/modo';

// "entrar": e-mail e senha. "link": primeiro acesso ou senha esquecida, com o
// texto à vista. "confirmar": a pergunta antes de mandar o e-mail.
type Etapa = 'entrar' | 'link' | 'confirmar';

// Depois disso a espera deixa de ser normal e a tela explica o que está
// acontecendo, com uma saída.
const ESPERA_LONGA_MS = 5000;

@Component({
  selector: 'app-login',
  standalone: true,
  imports: [NgComponentOutlet, FormsModule, LoginBackgroundComponent, LogoComponent, SpinnerComponent, FlowButtonComponent, IconComponent],
  templateUrl: './login.component.html',
  styleUrl: './login.component.scss'
})
export class LoginComponent {
  private auth = inject(AuthService);

  // Só na demonstração: a escolha de perfil no lugar de e-mail e senha.
  readonly entradaSemSenha = ENTRADA_SEM_SENHA;

  email = '';
  senha = '';
  etapa = signal<Etapa>('entrar');
  // E-mail que vai receber o link, mostrado na confirmação.
  emailDoLink = '';

  erro = this.auth.erro;
  aviso = this.auth.aviso;
  carregando = this.auth.carregando;
  erroDoSistema = this.auth.erroDoSistema;

  // "Conferindo seu cadastro..." depois de 5 s entrando.
  demorando = signal(false);
  private timer: ReturnType<typeof setTimeout> | undefined;

  // Título do aviso de erro: diz o que falhou nesta etapa.
  tituloErro = computed(() => {
    if (this.erroDoSistema()) return 'Falha no sistema';
    return this.etapa() === 'entrar' ? 'Não foi possível entrar' : 'Não foi possível enviar o link';
  });

  // Contato do arquivo comercial (shared/comercial.config.ts). Vazio, a
  // mensagem só pede para tentar de novo em alguns minutos.
  contato = (() => {
    const c = this.auth.contatoSuporte();
    return {
      email: c.email,
      emailLink: c.email ? linkEmail(c.email, 'Não consigo entrar no Zella') : '',
      whatsappTexto: c.whatsappTexto,
      whatsappLink: c.whatsapp ? linkWhatsapp(c.whatsapp, 'Olá! Não consigo entrar no Zella: a senha está certa, mas o cadastro não carrega.') : ''
    };
  })();

  constructor() {
    effect(() => {
      const entrando = this.carregando() && this.etapa() === 'entrar';
      clearTimeout(this.timer);
      if (!entrando) {
        this.demorando.set(false);
        return;
      }
      this.timer = setTimeout(() => this.demorando.set(true), ESPERA_LONGA_MS);
    });
    inject(DestroyRef).onDestroy(() => clearTimeout(this.timer));
  }

  login(): void {
    if (!this.email || !this.senha) {
      this.auth.erro.set('Preencha e-mail e senha.');
      return;
    }
    this.auth.loginComEmailSenha(this.email.trim(), this.senha);
  }

  loginComGoogle(): void {
    this.auth.loginComGoogle();
  }

  cancelarEntrada(): void {
    this.auth.cancelarEntrada();
  }

  /* Primeiro acesso ou senha esquecida ------------------------------------ */

  abrirLink(): void {
    this.limparAvisos();
    this.etapa.set('link');
  }

  voltarParaEntrar(): void {
    this.limparAvisos();
    this.etapa.set('entrar');
  }

  // Primeiro confere o e-mail e pergunta; só envia no "Sim, enviar".
  pedirConfirmacao(): void {
    this.limparAvisos();
    const email = this.email.trim();
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      this.auth.erro.set('Digite o e-mail que o gestor cadastrou, como voce@empresa.com.');
      return;
    }
    this.emailDoLink = email;
    this.etapa.set('confirmar');
  }

  async enviarLink(): Promise<void> {
    await this.auth.enviarLinkDeSenha(this.emailDoLink);
    // Enviado: volta para a explicação, com o aviso de sucesso à vista.
    if (!this.erro()) this.etapa.set('link');
  }

  private limparAvisos(): void {
    this.auth.erro.set('');
    this.auth.aviso.set('');
    this.auth.erroDoSistema.set(false);
  }
}
