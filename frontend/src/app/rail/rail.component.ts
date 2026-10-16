import { Component, inject, signal } from '@angular/core';
import { NavigationEnd, Router, RouterLink, RouterLinkActive } from '@angular/router';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { filter } from 'rxjs';
import { MatMenuModule } from '@angular/material/menu';
import { MatTooltipModule } from '@angular/material/tooltip';
import { IconComponent } from '../shared/icon/icon.component';
import { LogoComponent } from '../shared/logo/logo.component';
import { NotificacoesComponent } from '../shared/notificacoes/notificacoes.component';
import { ThemeToggleComponent } from '../theme-toggle/theme-toggle.component';
import { AuthService } from '../shared/auth.service';
import { SECOES_MENU, secoesDoPerfil, type ItemMenu, type SecaoMenu } from '../shared/menu';
import { BuscaGlobalService } from '../shared/busca-global/busca-global.service';
import { ROTULO_PERFIL } from '../shared/rotulos';

type RailItem = ItemMenu;
type RailSecao = SecaoMenu;

const CHAVE_RECOLHIDO = 'gm-rail';
const CHAVE_SECOES = 'gm-rail-secoes';

function ler(chave: string): string | null {
  try {
    return localStorage.getItem(chave);
  } catch {
    return null;
  }
}

function gravar(chave: string, valor: string): void {
  try {
    localStorage.setItem(chave, valor);
  } catch {
    // Sem storage (aba privada): vale só para esta sessão.
  }
}

@Component({
  selector: 'app-rail',
  imports: [RouterLink, RouterLinkActive, MatMenuModule, MatTooltipModule, IconComponent, LogoComponent, NotificacoesComponent, ThemeToggleComponent],
  templateUrl: './rail.component.html',
  styleUrl: './rail.component.scss',
  host: { '[class.recolhido]': 'recolhido()', '[class.sem-barra]': 'itensBarra.length === 0' }
})
export class RailComponent {
  private auth = inject(AuthService);
  private router = inject(Router);

  usuario = this.auth.usuarioLogado;

  // Menu em seções à la Linear: o dia a dia no topo, sem título; o resto em
  // seções com cabeçalho que recolhe. Recolhido, vira só ícones com tooltip.
  // A lista mora em shared/menu.ts, junto da busca global.
  private readonly secoes: RailSecao[] = SECOES_MENU;
  readonly busca = inject(BuscaGlobalService);

  readonly rotuloPerfil: Record<string, string> = ROTULO_PERFIL;

  recolhido = signal(ler(CHAVE_RECOLHIDO) === '1');
  private fechadas = signal<Set<string>>(this.lerSecoes());

  constructor() {
    this.abrirSecaoDaRota(this.router.url);
    this.router.events
      .pipe(filter((e): e is NavigationEnd => e instanceof NavigationEnd), takeUntilDestroyed())
      .subscribe(e => this.abrirSecaoDaRota(e.urlAfterRedirects));
  }

  // O menu é filtrado pelo mesmo mapa que os guards de rota consultam, então
  // nenhum atalho visível leva a um redirecionamento.
  get secoesVisiveis(): RailSecao[] {
    const { perfil, adminPlataforma } = this.auth.usuarioLogado();
    return secoesDoPerfil(perfil, adminPlataforma);
  }

  /**
   * Celular: os quatro primeiros destinos na barra; o resto em "Mais". Com um
   * destino só (a solicitante), a barra não aparece: não há para onde ir.
   */
  get itensBarra(): RailItem[] {
    const todos = this.secoesVisiveis.flatMap(s => s.itens);
    return todos.length > 1 ? todos.slice(0, 4) : [];
  }

  get itensMais(): RailItem[] {
    return this.secoesVisiveis.flatMap(s => s.itens).slice(4);
  }

  /** "Mais" do celular agrupado pelos mesmos tópicos do menu lateral. */
  get secoesMais(): RailSecao[] {
    const mais = new Set(this.itensMais.map(i => i.route));
    return this.secoesVisiveis
      .map(s => ({ ...s, titulo: s.titulo ?? 'Operação', itens: s.itens.filter(i => mais.has(i.route)) }))
      .filter(s => s.itens.length > 0);
  }

  get iniciais(): string {
    const partes = (this.usuario().nome ?? '').trim().split(/\s+/).filter(Boolean);
    return ((partes[0]?.[0] ?? '') + (partes.length > 1 ? partes[partes.length - 1][0] : '')).toUpperCase() || '?';
  }

  secaoFechada(id: string): boolean {
    return this.fechadas().has(id);
  }

  alternarSecao(id: string): void {
    const proximo = new Set(this.fechadas());
    if (proximo.has(id)) proximo.delete(id);
    else proximo.add(id);
    this.fechadas.set(proximo);
    gravar(CHAVE_SECOES, JSON.stringify([...proximo]));
  }

  alternarRecolhido(): void {
    this.recolhido.update(v => !v);
    gravar(CHAVE_RECOLHIDO, this.recolhido() ? '1' : '0');
  }

  sair(): void {
    this.auth.logout();
  }

  /** Navegar para um item de seção fechada reabre a seção, senão o ativo some. */
  private abrirSecaoDaRota(url: string): void {
    const secao = this.secoes.find(
      s => s.titulo && s.itens.some(i => url === i.route || url.startsWith(i.route + '/') || url.startsWith(i.route + '?'))
    );
    if (secao && this.fechadas().has(secao.id)) this.alternarSecao(secao.id);
  }

  private lerSecoes(): Set<string> {
    try {
      const salvo = JSON.parse(ler(CHAVE_SECOES) ?? '[]');
      return new Set(Array.isArray(salvo) ? salvo : []);
    } catch {
      return new Set();
    }
  }
}
