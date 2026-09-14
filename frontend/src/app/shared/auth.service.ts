import { Injectable, computed, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import {
  GoogleAuthProvider,
  onAuthStateChanged,
  sendPasswordResetEmail,
  signInAnonymously,
  signInWithEmailAndPassword,
  signInWithPopup,
  signOut,
  type User
} from 'firebase/auth';
import { httpsCallable } from 'firebase/functions';
import { auth, functions } from './firebase';
import { DataService } from './data.service';
import { rotaInicial } from './permissoes';
import type { PerfilUsuario, Usuario } from './models';

// Sessão anônima de quem escaneou um QR Code. Não tem cadastro, não tem
// e-mail e o perfil 'convidado' só abre a tela de novo chamado.
const USUARIO_CONVIDADO: Usuario = {
  id: 'convidado',
  nome: 'Visitante',
  email: '',
  perfil: 'convidado'
};

// O que a callable `carregarPerfil` (functions/src/perfis.ts) devolve.
type RespostaPerfil = { usuario: Usuario | null };

@Injectable({
  providedIn: 'root'
})
export class AuthService {
  private dataService = inject(DataService);
  private router = inject(Router);

  usuarioFirebase = signal<User | null>(null);
  carregando = signal(false);
  erro = signal('');
  aviso = signal('');

  // Cadastro de quem está logado, vindo do backend. Só existe depois que a
  // callable `carregarPerfil` achou o cadastro pelo e-mail e gravou o perfil
  // no token (custom claim). É o token que as Security Rules leem, então o
  // app só passa a ouvir o Firestore depois disso — antes, toda leitura
  // seria negada.
  private sessao = signal<Usuario | null>(null);

  // O Firebase Auth restaura a sessão de forma assíncrona. Sem esperar por
  // essa primeira resposta, um guard que rodasse no carregamento da página
  // chutaria pra tela de login quem já estava logado.
  private resolverPrimeiraResposta!: () => void;
  private readonly primeiraResposta = new Promise<void>((resolve) => {
    this.resolverPrimeiraResposta = resolve;
  });

  // Carga do perfil em andamento (ou já concluída) para o uid atual.
  private carregamento: Promise<void> = Promise.resolve();
  private uidCarregado: string | null = null;

  // Resolve quando dá pra decidir se há sessão: depois da restauração do
  // Auth E da carga do perfil, que é o que diz se a conta tem cadastro.
  get pronto(): Promise<void> {
    return this.primeiraResposta.then(() => this.carregamento);
  }

  usuarioLogado = computed<Usuario>(() => this.sessao() ?? USUARIO_CONVIDADO);

  constructor() {
    onAuthStateChanged(auth, (user) => {
      this.atualizarSessao(user).finally(() => this.resolverPrimeiraResposta());
    });
  }

  // Tem sessão de verdade: login por e-mail ou Google E cadastro com perfil.
  // A sessão anônima do QR Code não conta, e conta do Auth sem cadastro
  // também não — ela é encerrada assim que o backend responde que não a
  // conhece.
  estaAutenticado(): boolean {
    return this.sessao() !== null;
  }

  isConvidado(): boolean {
    return this.usuarioFirebase()?.isAnonymous === true;
  }

  /**
   * Abre a sessão anônima de quem escaneou o QR Code.
   *
   * O estado é atualizado aqui mesmo, sem esperar o onAuthStateChanged: quem
   * chama é o guard de rota, que precisa decidir na mesma volta se deixa
   * entrar. Esperar o callback assíncrono faria o guard ler a sessão antiga.
   */
  async entrarComoConvidado(): Promise<void> {
    const credencial = await signInAnonymously(auth);
    await this.atualizarSessao(credencial.user);
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

  async loginComEmailSenha(email: string, senha: string): Promise<void> {
    await this.login(
      () => signInWithEmailAndPassword(auth, email, senha),
      'E-mail ou senha inválidos.'
    );
  }

  async loginComGoogle(): Promise<void> {
    await this.login(
      () => signInWithPopup(auth, new GoogleAuthProvider()),
      'Não foi possível entrar com o Google.'
    );
  }

  /**
   * "Definir ou recuperar senha": serve tanto pra quem esqueceu quanto pra
   * quem acabou de ser cadastrado e ainda não tem senha. Antes de pedir o
   * e-mail de redefinição, a callable garante que a conta exista no Auth
   * (cadastro antigo, feito antes do convite automático). A mensagem final
   * é a mesma com ou sem cadastro, de propósito.
   */
  async enviarLinkDeSenha(email: string): Promise<void> {
    this.erro.set('');
    this.aviso.set('');
    this.carregando.set(true);
    try {
      const preparar = httpsCallable<{ email: string }, { ok: true }>(functions, 'prepararAcessoPorSenha');
      await preparar({ email });
      try {
        await sendPasswordResetEmail(auth, email);
      } catch (e) {
        // Sem conta no Auth (e-mail não cadastrado) o Firebase pode recusar;
        // pra quem digita, a resposta tem que ser a mesma.
        if ((e as { code?: string }).code !== 'auth/user-not-found') throw e;
      }
      this.aviso.set(`Se ${email} estiver cadastrado, um e-mail com o link para definir a senha foi enviado. Confira também a caixa de spam.`);
    } catch {
      this.erro.set('Não foi possível enviar o e-mail. Tente de novo em instantes.');
    } finally {
      this.carregando.set(false);
    }
  }

  async logout(): Promise<void> {
    await signOut(auth);
    this.router.navigate(['/login']);
  }

  // Entra no Auth e espera a carga do perfil antes de navegar: sem isso o
  // guard do dashboard rodaria com a sessão ainda vazia e devolveria pro
  // login. Se a conta não tem cadastro, `carregarPerfil` já encerrou a
  // sessão e deixou a mensagem em `erro`.
  private async login(entrar: () => Promise<{ user: User }>, mensagemFalha: string): Promise<void> {
    this.erro.set('');
    this.aviso.set('');
    this.carregando.set(true);
    try {
      const credencial = await entrar();
      await this.atualizarSessao(credencial.user);
      const usuario = this.sessao();
      if (usuario) {
        this.router.navigate([rotaInicial(usuario.perfil)]);
      }
    } catch {
      this.erro.set(mensagemFalha);
    } finally {
      this.carregando.set(false);
    }
  }

  // Ponto único de mudança de sessão: chamado pelo onAuthStateChanged e
  // também direto pelo login e pelo convidado, que não podem esperar o
  // callback. A carga do perfil é feita uma vez por uid — se o callback
  // chegar depois do login pra mesma conta, reaproveita a carga em curso.
  private atualizarSessao(user: User | null): Promise<void> {
    this.usuarioFirebase.set(user);

    const uid = user && !user.isAnonymous ? user.uid : null;
    if (uid && uid === this.uidCarregado) {
      return this.carregamento;
    }

    this.uidCarregado = uid;
    this.sessao.set(null);
    this.dataService.parar();
    this.carregamento = uid ? this.carregarPerfil(user!) : Promise.resolve();
    return this.carregamento;
  }

  private async carregarPerfil(user: User): Promise<void> {
    try {
      const carregar = httpsCallable<void, RespostaPerfil>(functions, 'carregarPerfil');
      const { usuario } = (await carregar()).data;

      if (!usuario) {
        await signOut(auth);
        this.erro.set('Seu e-mail não tem cadastro no sistema. Peça acesso a um gestor.');
        return;
      }

      // O backend acabou de gravar o claim; o token em memória ainda é o
      // antigo. Renovar aqui é o que faz as Security Rules enxergarem o
      // perfil já na primeira leitura.
      await user.getIdToken(true);

      this.sessao.set(usuario);
      // O administrador da plataforma não pertence a empresa nenhuma: não há
      // subárvore pra ouvir. A tela dele lê a lista de empresas por conta
      // própria.
      if (usuario.empresaId) {
        this.dataService.iniciar(usuario);
      }
    } catch {
      await signOut(auth);
      this.erro.set('Não foi possível carregar seu perfil. Tente de novo.');
    }
  }
}
