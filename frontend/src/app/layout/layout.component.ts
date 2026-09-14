import { Component, inject } from '@angular/core';
import { RouterLink, RouterOutlet } from '@angular/router';
import { MatToolbarModule } from '@angular/material/toolbar';
import { MatButtonModule } from '@angular/material/button';
import { MatMenuModule } from '@angular/material/menu';
import { MatDividerModule } from '@angular/material/divider';
import { RailComponent } from '../rail/rail.component';
import { ThemeToggleComponent } from '../theme-toggle/theme-toggle.component';
import { IconComponent } from '../shared/icon/icon.component';
import { LogoComponent } from '../shared/logo/logo.component';
import { NotificacoesComponent } from '../shared/notificacoes/notificacoes.component';
import { AuthService } from '../shared/auth.service';

@Component({
  selector: 'app-layout',
  imports: [
    RouterOutlet,
    RouterLink,
    MatToolbarModule,
    MatButtonModule,
    MatMenuModule,
    MatDividerModule,
    RailComponent,
    ThemeToggleComponent,
    LogoComponent,
    IconComponent,
    NotificacoesComponent
  ],
  templateUrl: './layout.component.html',
  styleUrl: './layout.component.scss'
})
export class LayoutComponent {
  private auth = inject(AuthService);

  usuarioLogado = this.auth.usuarioLogado;

  sair(): void {
    this.auth.logout();
  }
}
