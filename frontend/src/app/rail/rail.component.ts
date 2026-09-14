import { Component, inject } from '@angular/core';
import { Router, RouterLink, RouterLinkActive } from '@angular/router';
import { MatButtonModule } from '@angular/material/button';
import { MatMenuModule } from '@angular/material/menu';
import { MatDividerModule } from '@angular/material/divider';
import { IconComponent } from '../shared/icon/icon.component';
import { LogoComponent } from '../shared/logo/logo.component';
import { MatTooltipModule } from '@angular/material/tooltip';
import { AuthService } from '../shared/auth.service';
import { podeAcessar } from '../shared/permissoes';

interface RailBadge {
  type: 'number' | 'dot';
  value?: string | number;
}

interface RailItem {
  label: string;
  route: string;
  icon: string;
  badge?: RailBadge;
  destaque?: boolean;
}

/** Seção de um menu agrupado (abre em flyout a partir do rail). */
interface RailGrupo {
  titulo: string;
  itens: RailItem[];
}

@Component({
  selector: 'app-rail',
  imports: [
    RouterLink,
    RouterLinkActive,
    MatButtonModule,
    MatMenuModule,
    MatDividerModule,
    IconComponent,
    LogoComponent,
    MatTooltipModule
  ],
  templateUrl: './rail.component.html',
  styleUrl: './rail.component.scss'
})
export class RailComponent {
  private auth = inject(AuthService);
  private router = inject(Router);

  // O rail mostra só o fluxo do dia a dia. Cadastros e ferramentas de
  // administração ficam agrupados num único botão com menu flutuante:
  // antes eram 14 atalhos empilhados e o rail não cabia em telas de
  // notebook (sem scroll, os últimos itens sumiam).
  private readonly principais: RailItem[] = [
    { label: 'Início', route: '/dashboard', icon: 'dashboard' },
    { label: 'OS', route: '/ordens-servico', icon: 'assignment' },
    { label: 'Contratos', route: '/contratos', icon: 'description' },
    { label: 'Saldo', route: '/painel-saldo', icon: 'account_balance_wallet' },
    { label: 'Preventiva', route: '/preventiva', icon: 'calendar_check' },
    { label: 'Gerencial', route: '/painel-gerencial', icon: 'bar_chart' }
  ];

  private readonly administracao: RailGrupo[] = [
    {
      titulo: 'Cadastros',
      itens: [
        { label: 'Empresas', route: '/empresas', icon: 'business' },
        { label: 'Unidades', route: '/unidades', icon: 'location_on' },
        { label: 'Usuários', route: '/usuarios', icon: 'group' },
        { label: 'Contratadas', route: '/contratadas', icon: 'handyman' }
      ]
    },
    {
      titulo: 'Ferramentas',
      itens: [
        { label: 'Importar contratos', route: '/contratos/importar', icon: 'upload_file' },
        { label: 'QR Codes', route: '/qrcodes', icon: 'qr_code' },
        { label: 'Histórico de alterações', route: '/logs', icon: 'clock' }
      ]
    }
  ];

  // O menu é filtrado pelo mesmo mapa que os guards de rota consultam, então
  // nenhum atalho visível leva a um redirecionamento.
  get itensPrincipais(): RailItem[] {
    return this.principais.filter(item => this.permitido(item));
  }

  get gruposAdministracao(): RailGrupo[] {
    return this.administracao
      .map(grupo => ({ ...grupo, itens: grupo.itens.filter(item => this.permitido(item)) }))
      .filter(grupo => grupo.itens.length > 0);
  }

  /** O botão do grupo acende quando a tela atual pertence a ele. */
  get administracaoAtiva(): boolean {
    const url = this.router.url;
    return this.administracao.some(grupo =>
      grupo.itens.some(item => url === item.route || url.startsWith(item.route + '/') || url.startsWith(item.route + '?'))
    );
  }


  private permitido(item: RailItem): boolean {
    const { perfil, adminPlataforma } = this.auth.usuarioLogado();
    return podeAcessar(perfil, item.route, adminPlataforma);
  }
}
