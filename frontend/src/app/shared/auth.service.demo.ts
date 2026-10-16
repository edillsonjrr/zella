import { Injectable, computed, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { DataService } from './data.service';
import { rotaInicial } from './permissoes';
import { DADOS_COMERCIAIS, whatsappFormatado } from './comercial.config';
import { banco } from '../demo/banco';
import { AVISO_DEMO } from '../demo/fluxo';
import { EMPRESA_DEMO_ID, EMPRESA_DEMO_NOME } from '../demo/semente';
import type { PerfilUsuario, Usuario } from './models';

// Sessão de quem abriu o link do QR Code sem estar logado.
const USUARIO_CONVIDADO: Usuario = {
  id: 'convidado',
  nome: 'Visitante',
  email: '',
  perfil: 'convidado'
};

/** O pedaço do usuário do Firebase Auth que as telas leem. */
interface SessaoAuth {
  uid: string;
  isAnonymous: boolean;
}

/**
 * AuthService da demonstração (trocado pela configuração `demo`). Não há
 * senha nem Firebase Auth: a pessoa escolhe quem quer ser (`entrarComo`) e
 * a sessão é o cadastro dela no banco em memória, com o mesmo perfil, a
 * mesma unidade e a mesma contratada — por isso vê exatamente o que veria
 * de verdade. A sessão fica guardada na aba (demo/banco.ts).
 */
@Injectable({
  providedIn: 'root'
})
export class AuthService {
  private dataService = inject(DataService);
  private router = inject(Router);

  usuarioFirebase = signal<SessaoAuth | null>(null);
  carregando = signal(false);
  erro = signal('');
  aviso = signal('');
  erroDoSistema = signal(false);

  private sessao = signal<Usuario | null>(null);

  // A sessão é restaurada na construção, sem esperar nada.
  get pronto(): Promise<void> {
    return Promise.resolve();
  }

  usuarioLogado = computed<Usuario>(() => this.sessao() ?? USUARIO_CONVIDADO);

  constructor() {
    const salva = banco.sessao;
    if (salva === 'convidado') {
      this.usuarioFirebase.set({ uid: 'visitante-qr', isAnonymous: true });
    } else if (salva && !this.entrarComo(salva)) {
      // O cadastro sumiu (foi excluído na demonstração): volta a escolher.
      banco.definirSessao(null);
    }
  }

  /**
   * Entra como uma pessoa do exemplo, sem senha. Devolve false se o cadastro
   * não existe mais (excluído na tela de Usuários).
   */
  entrarComo(usuarioId: string): boolean {
    const cadastro = banco.ler().usuarios.find(u => u.id === usuarioId);
    if (!cadastro) return false;
    const usuario: Usuario = { ...cadastro, empresaId: EMPRESA_DEMO_ID, empresaNome: EMPRESA_DEMO_NOME };
    this.erro.set('');
    this.aviso.set('');
    this.dataService.parar();
    this.usuarioFirebase.set({ uid: usuario.id, isAnonymous: false });
    this.sessao.set(usuario);
    banco.definirSessao(usuario.id);
    this.dataService.iniciar(usuario);
    return true;
  }

  estaAutenticado(): boolean {
    return this.sessao() !== null;
  }

  isConvidado(): boolean {
    return this.usuarioFirebase()?.isAnonymous === true;
  }

  /** Quem abriu o link do QR Code sem estar logado. */
  async entrarComoConvidado(): Promise<void> {
    this.dataService.parar();
    this.sessao.set(null);
    this.usuarioFirebase.set({ uid: 'visitante-qr', isAnonymous: true });
    banco.definirSessao('convidado');
  }

  get perfil(): PerfilUsuario {
    return this.usuarioLogado().perfil;
  }

  get unidadeId(): string | undefined {
    return this.usuarioLogado().unidadeId;
  }

  get empresaContratadaId(): string | undefined {
    return this.usuarioLogado().empresaContratadaId;
  }

  get empresaId(): string | undefined {
    return this.usuarioLogado().empresaId;
  }

  isAdminPlataforma(): boolean {
    return this.perfil === 'admin_plataforma' || this.usuarioLogado().adminPlataforma === true;
  }

  isCliente(): boolean {
    return this.perfil === 'cliente';
  }

  isGestor(): boolean {
    return this.perfil === 'gestor';
  }

  isGestorContratado(): boolean {
    return this.perfil === 'gestor_contratado';
  }

  isTecnico(): boolean {
    return this.perfil === 'tecnico';
  }

  // A tela de entrar da demonstração não pede senha; se alguém chegar aqui,
  // vale o e-mail do cadastro de exemplo.
  async loginComEmailSenha(email: string, _senha: string): Promise<void> {
    const cadastro = banco.ler().usuarios.find(u => u.email.toLowerCase() === email.trim().toLowerCase());
    if (!cadastro || !this.entrarComo(cadastro.id)) {
      this.erro.set('Na demonstração, escolha uma das pessoas de exemplo para entrar.');
      return;
    }
    this.router.navigate([rotaInicial(cadastro.perfil as PerfilUsuario)]);
  }

  async loginComGoogle(): Promise<void> {
    this.erro.set('Na demonstração, escolha uma das pessoas de exemplo para entrar.');
  }

  async cancelarEntrada(): Promise<void> {
    this.carregando.set(false);
    this.erro.set('');
    this.erroDoSistema.set(false);
  }

  contatoSuporte(): { email: string; whatsapp: string; whatsappTexto: string } {
    const email = DADOS_COMERCIAIS.emailComercial.trim();
    const whatsapp = DADOS_COMERCIAIS.whatsappComercial.replace(/\D/g, '');
    return { email, whatsapp, whatsappTexto: whatsapp ? whatsappFormatado(whatsapp) : '' };
  }

  async enviarLinkDeSenha(email: string): Promise<void> {
    this.erro.set('');
    this.aviso.set(`${AVISO_DEMO} Nenhum e-mail foi enviado para ${email}.`);
  }

  /** Troca o nome da própria pessoa (Minha conta). */
  async salvarMeuNome(nome: string): Promise<void> {
    const id = this.usuarioLogado().id;
    banco.alterar(d => {
      const cadastro = d.usuarios.find(u => u.id === id);
      if (!cadastro) throw new Error('Cadastro não encontrado.');
      cadastro.nome = nome;
    });
    this.sessao.update(s => (s ? { ...s, nome } : s));
  }

  /** E-mail para trocar a senha (Minha conta): na demonstração não sai. */
  async enviarEmailDeNovaSenha(): Promise<string> {
    return `${AVISO_DEMO} Nenhum e-mail foi enviado para ${this.usuarioLogado().email}.`;
  }

  async logout(): Promise<void> {
    this.dataService.parar();
    this.sessao.set(null);
    this.usuarioFirebase.set(null);
    banco.definirSessao(null);
    this.router.navigate(['/login']);
  }
}
