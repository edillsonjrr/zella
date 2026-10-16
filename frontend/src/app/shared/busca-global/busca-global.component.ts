import { ChangeDetectionStrategy, Component, ElementRef, computed, effect, inject, signal, untracked, viewChild } from '@angular/core';
import { A11yModule } from '@angular/cdk/a11y';
import { Router } from '@angular/router';
import { MatDialog } from '@angular/material/dialog';
import { AuthService } from '../auth.service';
import { DataService } from '../data.service';
import { IconComponent } from '../icon/icon.component';
import { secoesDoPerfil } from '../menu';
import { podeAcessar } from '../permissoes';
import { normalizarTexto } from '../csv';
import { nomeUnidade, rotuloPatrimonio, situacaoDoPedido } from '../rotulos';
import { situacaoDaOS, situacaoDoChamado } from '../situacao-servico';
import { alternarTema, temaEscuroAtivo } from '../../theme-toggle/theme-toggle.component';
import { BuscaGlobalService } from './busca-global.service';

interface Resultado {
  id: string;
  grupo: Grupo;
  titulo: string;
  descricao?: string;
  /** Texto extra só para a busca (local, série, solicitante…). */
  termos?: string;
  icone: string;
  /** Chamado ou OS já fechado: vai para o fim do grupo. */
  fechado?: boolean;
  /** Data de abertura, para o mais novo vir antes. */
  data?: string;
  executar: () => unknown;
}

const FECHADO = new Set(['Encerrado', 'Cancelado', 'Encerrada', 'Cancelada']);

type Grupo = 'Páginas' | 'Pedidos' | 'Chamados' | 'Ordens de serviço' | 'Unidades e salas' | 'Equipamentos' | 'Contratos' | 'Empresas contratadas' | 'Ações';

const ORDEM: Grupo[] = ['Páginas', 'Pedidos', 'Chamados', 'Ordens de serviço', 'Unidades e salas', 'Equipamentos', 'Contratos', 'Empresas contratadas', 'Ações'];
// Sem texto digitado, só os atalhos de navegação; o resto aparece ao digitar.
const SEM_TEXTO: Grupo[] = ['Páginas', 'Ações'];
const SAIDA_MS = 140;
const POR_GRUPO = 5;

/**
 * Busca global (mesmo padrão do Procera): páginas, chamados, OS, unidades,
 * salas, equipamentos, contratos e contratadas num lugar só. Abre com
 * ⌘K / Ctrl+K e pelo "Buscar…" do menu.
 *
 * Só entra o que o perfil já enxerga: as páginas passam pelo mesmo mapa dos
 * guards (shared/permissoes.ts) e os dados vêm do DataService, que só abre
 * as leituras que as regras do Firestore liberam para a sessão. Cada item
 * abre pelo mesmo endereço que a notificação usa (?chamado=, ?os=…).
 *
 * Padrão combobox + listbox, setas e Enter, foco preso na caixa.
 */
@Component({
  selector: 'app-busca-global',
  imports: [A11yModule, IconComponent],
  templateUrl: './busca-global.component.html',
  styleUrl: './busca-global.component.scss',
  host: {
    '(document:keydown)': 'atalhoGlobal($event)'
  },
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class BuscaGlobalComponent {
  readonly busca = inject(BuscaGlobalService);
  private readonly router = inject(Router);
  private readonly auth = inject(AuthService);
  private readonly ds = inject(DataService);
  private readonly dialog = inject(MatDialog);

  private readonly campo = viewChild<ElementRef<HTMLInputElement>>('campo');
  private readonly lista = viewChild<ElementRef<HTMLElement>>('lista');

  /** Continua na tela durante a animação de saída. */
  readonly visivel = signal(false);
  readonly saindo = signal(false);
  readonly consulta = signal('');
  private readonly indice = signal(0);
  private focoAnterior: HTMLElement | null = null;

  /** Texto de exemplo do campo, conforme o que o perfil encontra. */
  readonly dica = computed(() => {
    const { perfil } = this.auth.usuarioLogado();
    if (perfil === 'admin_plataforma') return 'Buscar páginas e ações…';
    if (perfil === 'cliente') return 'Buscar páginas e pedidos…';
    if (perfil === 'gestor') return 'Buscar páginas, chamados, OS, unidades, equipamentos, contratos…';
    return 'Buscar páginas, chamados, OS, contratos…';
  });

  private readonly resultados = computed<Resultado[]>(() => {
    const usuario = this.auth.usuarioLogado();
    const { perfil, adminPlataforma } = usuario;
    const pode = (rota: string) => podeAcessar(perfil, rota, adminPlataforma);
    const ir = (rota: string, queryParams?: Record<string, string>) => () => this.router.navigate([rota], { queryParams });
    const ds = this.ds;
    const lista: Resultado[] = [];

    for (const secao of secoesDoPerfil(perfil, adminPlataforma)) {
      for (const item of secao.itens) {
        lista.push({ id: 'p' + item.route.replace(/\W/g, '-'), grupo: 'Páginas', titulo: item.label, descricao: secao.titulo, termos: item.termos, icone: item.icon, executar: ir(item.route) });
      }
    }

    // Quem administra e quem executa acham o chamado no painel; a
    // solicitante, só os pedidos que ela mesma fez, na tela dela.
    if (pode('dashboard')) {
      for (const c of ds.chamados()) {
        lista.push({
          id: 'c-' + c.id,
          grupo: 'Chamados',
          titulo: `${c.numero} · ${c.equipamento}`,
          descricao: [situacaoDoChamado(ds, c, perfil).selo, c.local, nomeUnidade(ds.getUnidadeById(c.unidadeId), '')].filter(Boolean).join(' · '),
          termos: [c.titulo, c.descricao, c.numeroSerie, c.solicitanteNome].filter(Boolean).join(' '),
          icone: 'support_agent',
          fechado: FECHADO.has(c.status),
          data: c.dataCriacao,
          executar: ir('/dashboard', { chamado: c.id })
        });
      }
    } else if (pode('meus-pedidos')) {
      for (const c of ds.chamados()) {
        if (c.solicitanteId !== usuario.id) continue;
        lista.push({
          id: 'c-' + c.id,
          grupo: 'Pedidos',
          titulo: `${c.numero} · ${c.equipamento}`,
          descricao: [situacaoDoPedido(c.status).rotulo, c.local].filter(Boolean).join(' · '),
          termos: [c.titulo, c.descricao].filter(Boolean).join(' '),
          icone: 'checklist',
          fechado: FECHADO.has(c.status),
          data: c.dataCriacao,
          executar: ir('/meus-pedidos', { pedido: c.id })
        });
      }
    }

    if (pode('ordens-servico')) {
      for (const os of ds.ordensServico()) {
        const chamado = ds.getChamadoById(os.chamadoId);
        lista.push({
          id: 'os-' + os.id,
          grupo: 'Ordens de serviço',
          titulo: chamado ? `${os.numero} · ${chamado.equipamento}` : os.numero,
          descricao: [situacaoDaOS(ds, os, perfil).selo, chamado ? `do chamado ${chamado.numero}` : ''].filter(Boolean).join(' · '),
          termos: [chamado?.titulo, chamado?.local, ds.getContratoById(os.contratoId)?.numero].filter(Boolean).join(' '),
          icone: 'assignment',
          fechado: FECHADO.has(os.situacao),
          data: os.dataCriacao,
          executar: ir('/ordens-servico', { os: os.id })
        });
      }
    }

    if (pode('unidades')) {
      for (const u of ds.unidades()) {
        lista.push({ id: 'u-' + u.id, grupo: 'Unidades e salas', titulo: nomeUnidade(u), descricao: 'Unidade', termos: `${u.nome} ${u.sigla}`, icone: 'location_on', executar: ir('/unidades', { unidade: u.id }) });
      }
      for (const s of ds.salas()) {
        const bloco = s.blocoId ? ds.getBlocoById(s.blocoId)?.nome : undefined;
        lista.push({
          id: 's-' + s.id,
          grupo: 'Unidades e salas',
          titulo: s.nome,
          descricao: ['Sala', bloco, nomeUnidade(ds.getUnidadeById(s.unidadeId), '')].filter(Boolean).join(' · '),
          icone: 'table_chart',
          executar: ir('/unidades', { sala: s.id })
        });
      }
    }

    if (pode('equipamentos')) {
      for (const e of ds.equipamentos()) {
        lista.push({
          id: 'e-' + e.id,
          grupo: 'Equipamentos',
          titulo: e.nome,
          descricao: [ds.getSalaById(e.salaId)?.nome, nomeUnidade(ds.getUnidadeById(e.unidadeId), ''), e.patrimonio ? rotuloPatrimonio(e.patrimonio) : ''].filter(Boolean).join(' · '),
          termos: [e.patrimonio, e.fabricante, e.modelo].filter(Boolean).join(' '),
          icone: 'devices',
          executar: ir('/equipamentos', { equipamento: e.id })
        });
      }
    }

    if (pode('contratos')) {
      for (const c of ds.contratos()) {
        lista.push({ id: 'ct-' + c.id, grupo: 'Contratos', titulo: `${c.numero} · ${c.fornecedor}`, descricao: c.status, icone: 'description', executar: ir('/contratos', { contrato: c.id }) });
      }
    }

    if (pode('contratadas')) {
      for (const e of ds.empresasContratadas()) {
        lista.push({ id: 'ec-' + e.id, grupo: 'Empresas contratadas', titulo: e.nome, descricao: e.cnpj, termos: e.contato, icone: 'handyman', executar: ir('/contratadas') });
      }
    }

    // Mesmo formulário e mesmo texto dos botões da tela de chamados e de
    // "Meus pedidos".
    if (pode('dashboard') && perfil === 'gestor') {
      lista.push({ id: 'a-chamado', grupo: 'Ações', titulo: 'Novo chamado', termos: 'abrir criar conserto', icone: 'add', executar: () => this.novoChamado() });
    } else if (perfil === 'cliente') {
      lista.push({ id: 'a-chamado', grupo: 'Ações', titulo: 'Pedir um conserto', termos: 'novo chamado pedido', icone: 'add', executar: () => this.novoChamado() });
    }
    const escuro = temaEscuroAtivo();
    lista.push({
      id: 'a-tema',
      grupo: 'Ações',
      titulo: escuro ? 'Usar tema claro' : 'Usar tema escuro',
      termos: 'tema modo escuro claro aparência',
      icone: escuro ? 'light_mode' : 'dark_mode',
      executar: () => alternarTema()
    });
    return lista;
  });

  readonly grupos = computed(() => {
    const termos = normalizarTexto(this.consulta()).split(' ').filter(Boolean);
    const porGrupo = new Map<Grupo, { r: Resultado; nota: number }[]>();

    for (const r of this.resultados()) {
      let nota = 0;
      if (termos.length) {
        const titulo = normalizarTexto(r.titulo);
        const tudo = `${titulo} ${normalizarTexto(r.descricao)} ${normalizarTexto(r.termos)}`;
        if (!termos.every(t => tudo.includes(t))) continue;
        nota = titulo.startsWith(termos[0]) ? 2 : titulo.includes(termos[0]) ? 1 : 0;
      } else if (!SEM_TEXTO.includes(r.grupo)) {
        continue;
      }
      const g = porGrupo.get(r.grupo) ?? [];
      g.push({ r, nota });
      porGrupo.set(r.grupo, g);
    }

    return ORDEM.filter(nome => porGrupo.has(nome)).map(nome => ({
      nome,
      itens: porGrupo
        .get(nome)!
        // Melhor encaixe no título; depois o que ainda está aberto; depois o mais novo.
        .sort((a, b) => b.nota - a.nota || Number(!!a.r.fechado) - Number(!!b.r.fechado) || (b.r.data ?? '').localeCompare(a.r.data ?? ''))
        .slice(0, termos.length ? POR_GRUPO : 20)
        .map(x => x.r)
    }));
  });

  private readonly planos = computed(() => this.grupos().flatMap(g => g.itens));
  readonly ativo = computed(() => this.planos()[Math.min(this.indice(), this.planos().length - 1)] ?? null);

  constructor() {
    effect(() => {
      const aberto = this.busca.aberto();
      untracked(() => (aberto ? this.mostrar() : this.esconder()));
    });
  }

  atalhoGlobal(e: KeyboardEvent): void {
    if ((e.metaKey || e.ctrlKey) && !e.altKey && !e.shiftKey && e.key.toLowerCase() === 'k') {
      e.preventDefault();
      this.busca.alternar();
    }
  }

  digitar(valor: string): void {
    this.consulta.set(valor);
    this.indice.set(0);
    this.lista()?.nativeElement.scrollTo({ top: 0 });
  }

  teclado(e: KeyboardEvent): void {
    const total = this.planos().length;
    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault();
        this.mover(total ? (this.indice() + 1) % total : 0);
        break;
      case 'ArrowUp':
        e.preventDefault();
        this.mover(total ? (this.indice() - 1 + total) % total : 0);
        break;
      case 'Home':
        if (e.ctrlKey) {
          e.preventDefault();
          this.mover(0);
        }
        break;
      case 'End':
        if (e.ctrlKey) {
          e.preventDefault();
          this.mover(total - 1);
        }
        break;
      case 'Enter': {
        e.preventDefault();
        const r = this.ativo();
        if (r) this.executar(r);
        break;
      }
      case 'Escape':
        e.preventDefault();
        this.fechar();
        break;
    }
  }

  focar(r: Resultado): void {
    const i = this.planos().indexOf(r);
    if (i >= 0 && i !== this.indice()) this.indice.set(i);
  }

  executar(r: Resultado): void {
    // Navegar devolve o foco à página nova, não ao botão que abriu a busca.
    this.focoAnterior = null;
    this.fechar();
    void r.executar();
  }

  fechar(): void {
    this.busca.fechar();
  }

  /** Abre o mesmo formulário do botão "Novo chamado" / "Pedir um conserto". */
  private async novoChamado(): Promise<void> {
    const { NovoChamadoComponent } = await import('../../novo-chamado/novo-chamado.component');
    this.dialog.open(NovoChamadoComponent, {
      width: '560px',
      maxWidth: '95vw',
      maxHeight: '90vh',
      panelClass: 'novo-chamado-dialog',
      autoFocus: true
    });
  }

  private mover(i: number): void {
    this.indice.set(i);
    queueMicrotask(() => {
      const r = this.ativo();
      if (r) document.getElementById('bg-' + r.id)?.scrollIntoView({ block: 'nearest' });
    });
  }

  private mostrar(): void {
    this.focoAnterior = document.activeElement as HTMLElement | null;
    this.consulta.set('');
    this.indice.set(0);
    this.saindo.set(false);
    this.visivel.set(true);
    setTimeout(() => this.campo()?.nativeElement.focus());
  }

  private esconder(): void {
    if (!this.visivel()) return;
    this.saindo.set(true);
    setTimeout(() => {
      if (this.busca.aberto()) return;
      this.visivel.set(false);
      this.saindo.set(false);
      this.focoAnterior?.focus?.();
      this.focoAnterior = null;
    }, SAIDA_MS);
  }
}
