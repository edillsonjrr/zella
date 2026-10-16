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
  updateProfile,
  type User
} from 'firebase/auth';
import { updateDoc } from 'firebase/firestore';
import { httpsCallable } from 'firebase/functions';
import { auth, functions } from './firebase';
import { DataService } from './data.service';
import { rotaInicial } from './permissoes';
import { DADOS_COMERCIAIS, whatsappFormatado } from './comercial.config';
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
  // A falha foi do sistema (o cadastro não carregou), não da pessoa. A tela
  // troca o título do aviso e mostra o contato de suporte (Z0.5).
  erroDoSistema = signal(false);

  // Cada tentativa de entrar ganha um número. "Cancelar" troca o número, e a
  // resposta que chegar depois (de uma tentativa abandonada) é ignorada.
  private tentativa = 0;

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
      'E-mail ou senha inválidos.',
      'senha'
    );
  }

  async loginComGoogle(): Promise<void> {
    await this.login(
      () => signInWithPopup(auth, new GoogleAuthProvider()),
      'Não foi possível entrar com o Google.',
      'google'
    );
  }

  /**
   * "Cancelar" da espera longa ("Conferindo seu cadastro..."): abandona a
   * tentativa, sai da conta e devolve a tela de entrar. A resposta que ainda
   * chegar é descartada pelo número da tentativa.
   */
  async cancelarEntrada(): Promise<void> {
    this.tentativa++;
    this.uidCarregado = null;
    this.carregamento = Promise.resolve();
    this.carregando.set(false);
    this.erro.set('');
    this.erroDoSistema.set(false);
    try {
      await signOut(auth);
    } catch {
      // Sem sessão para encerrar: nada a fazer.
    }
  }

  /** Contato de suporte do arquivo comercial; vazio quando não há nenhum. */
  contatoSuporte(): { email: string; whatsapp: string; whatsappTexto: string } {
    const email = DADOS_COMERCIAIS.emailComercial.trim();
    const whatsapp = DADOS_COMERCIAIS.whatsappComercial.replace(/\D/g, '');
    return { email, whatsapp, whatsappTexto: whatsapp ? whatsappFormatado(whatsapp) : '' };
  }

  // A senha (ou a conta Google) foi aceita, mas o cadastro não carregou: a
  // falha é do sistema. Sem contato no arquivo comercial, só "tente de novo".
  private mensagemFalhaPerfil(metodo: 'senha' | 'google' | 'sessao'): string {
    const inicio =
      metodo === 'google'
        ? 'O Google confirmou sua conta, mas o sistema não conseguiu carregar seu cadastro.'
        : metodo === 'senha'
          ? 'Sua senha está certa, mas o sistema não conseguiu carregar seu cadastro.'
          : 'O sistema não conseguiu carregar seu cadastro.';
    const { email, whatsappTexto } = this.contatoSuporte();
    const contato = [email, whatsappTexto ? `WhatsApp ${whatsappTexto}` : ''].filter(Boolean).join(' ou ');
    return contato
      ? `${inicio} A falha é nossa, não sua. Tente de novo em alguns minutos; se continuar, fale com o suporte: ${contato}.`
      : `${inicio} A falha é nossa, não sua. Tente de novo em alguns minutos.`;
  }

  private metodoAtual: 'senha' | 'google' | 'sessao' = 'sessao';

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
    this.erroDoSistema.set(false);
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
      this.erro.set('O e-mail com o link não saiu. Confira a internet e tente de novo em alguns minutos.');
    } finally {
      this.carregando.set(false);
    }
  }

  /**
   * Troca o nome da própria pessoa (Minha conta). A regra do Firestore
   * deixa cada um mudar só o próprio nome; o do Auth vai junto.
   */
  async salvarMeuNome(nome: string): Promise<void> {
    await updateDoc(this.dataService.docRef('usuarios', this.usuarioLogado().id), { nome });
    if (auth.currentUser) await updateProfile(auth.currentUser, { displayName: nome });
  }

  /**
   * E-mail de redefinição para a própria pessoa (Minha conta). Devolve o
   * aviso para a tela: o texto depende de onde o app roda (a demonstração
   * não manda e-mail).
   */
  async enviarEmailDeNovaSenha(): Promise<string> {
    const email = this.usuarioLogado().email;
    await sendPasswordResetEmail(auth, email);
    return `Enviamos um e-mail para ${email} com o link para definir a nova senha.`;
  }

  async logout(): Promise<void> {
    await signOut(auth);
    this.router.navigate(['/login']);
  }

  // Entra no Auth e espera a carga do perfil antes de navegar: sem isso o
  // guard do dashboard rodaria com a sessão ainda vazia e devolveria pro
  // login. Se a conta não tem cadastro, `carregarPerfil` já encerrou a
  // sessão e deixou a mensagem em `erro`.
  private async login(entrar: () => Promise<{ user: User }>, mensagemFalha: string, metodo: 'senha' | 'google'): Promise<void> {
    const tentativa = ++this.tentativa;
    this.erro.set('');
    this.aviso.set('');
    this.erroDoSistema.set(false);
    this.carregando.set(true);
    this.metodoAtual = metodo;
    try {
      const credencial = await entrar();
      if (tentativa !== this.tentativa) return;
      await this.atualizarSessao(credencial.user);
      if (tentativa !== this.tentativa) return;
      const usuario = this.sessao();
      if (usuario) {
        this.router.navigate([rotaInicial(usuario.perfil)]);
      }
    } catch (e) {
      if (tentativa === this.tentativa) this.erro.set(this.motivoDaFalha(e, mensagemFalha, metodo));
    } finally {
      if (tentativa === this.tentativa) this.carregando.set(false);
      this.metodoAtual = 'sessao';
    }
  }

  /**
   * O motivo da recusa em palavras, pelo código do Firebase. "Não foi
   * possível entrar com o Google" sozinho não dizia se a janela foi fechada,
   * bloqueada pelo navegador ou se faltou internet.
   */
  private motivoDaFalha(e: unknown, padrao: string, metodo: 'senha' | 'google'): string {
    const codigo = (e as { code?: string })?.code ?? '';
    switch (codigo) {
      case 'auth/popup-closed-by-user':
      case 'auth/cancelled-popup-request':
        return 'A janela do Google foi fechada antes de terminar. Tente de novo e escolha a sua conta.';
      case 'auth/popup-blocked':
        return 'O navegador bloqueou a janela do Google. Permita janelas (pop-ups) para este site e tente de novo.';
      case 'auth/network-request-failed':
        return 'Sem conexão com a internet. Confira a rede e tente de novo.';
      case 'auth/unauthorized-domain':
        return 'Este endereço não está liberado para entrar com o Google. Use o endereço oficial do Zella ou entre com e-mail e senha.';
      case 'auth/account-exists-with-different-credential':
        return 'Este e-mail já está cadastrado com senha. Entre com e-mail e senha.';
      case 'auth/user-disabled':
        return 'Esta conta foi desativada. Fale com a gestão da sua empresa.';
      case 'auth/too-many-requests':
        return 'Muitas tentativas seguidas. Espere alguns minutos e tente de novo, ou use "Definir ou recuperar senha".';
      default:
        if (metodo === 'google' && codigo) return `${padrao} O Google recusou a entrada (${codigo.replace('auth/', '')}). Tente de novo ou entre com e-mail e senha.`;
        if (metodo === 'google') return `${padrao} Tente de novo ou entre com e-mail e senha.`;
        return padrao;
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
    const metodo = this.metodoAtual;
    // Cancelado ("Cancelar" na espera) ou trocado de conta no meio: a
    // resposta desta carga não vale mais.
    const abandonada = () => this.uidCarregado !== user.uid;
    try {
      const carregar = httpsCallable<void, RespostaPerfil>(functions, 'carregarPerfil');
      const { usuario } = (await carregar()).data;
      if (abandonada()) return;

      if (!usuario) {
        await signOut(auth);
        this.erro.set('Seu e-mail não tem cadastro no sistema. Peça acesso a um gestor.');
        return;
      }

      // O backend acabou de gravar o claim; o token em memória ainda é o
      // antigo. Renovar aqui é o que faz as Security Rules enxergarem o
      // perfil já na primeira leitura.
      await user.getIdToken(true);
      if (abandonada()) return;

      this.sessao.set(usuario);
      // O administrador da plataforma não pertence a empresa nenhuma: não há
      // subárvore pra ouvir. A tela dele lê a lista de empresas por conta
      // própria.
      if (usuario.empresaId) {
        this.dataService.iniciar(usuario);
      }
    } catch {
      if (abandonada()) return;
      await signOut(auth);
      this.erroDoSistema.set(true);
      this.erro.set(this.mensagemFalhaPerfil(metodo));
    }
  }
}
