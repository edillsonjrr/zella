import { Component, computed, effect, Input, OnInit, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatTooltipModule } from '@angular/material/tooltip';
import { IconComponent } from '../shared/icon/icon.component';

// Mesma chave lida pelo script inline do index.html, que aplica o tema
// antes de o Angular subir.
const THEME_KEY = 'gm-theme';

function lerTemaSalvo(): string | null {
  try {
    return localStorage.getItem(THEME_KEY);
  } catch {
    return null;
  }
}

// Sem escolha salva, o celular começa no tema claro (quem usa o app na rua,
// no sol, lê melhor no claro) e o computador no escuro. A mesma regra está no
// script do index.html, que aplica o tema antes de o Angular subir.
function celular(): boolean {
  try {
    return window.matchMedia('(max-width: 760px)').matches;
  } catch {
    return false;
  }
}

function temaInicialEscuro(): boolean {
  const salvo = lerTemaSalvo();
  if (salvo === 'light') return false;
  if (salvo === 'dark') return true;
  return !celular();
}

// Um estado só para todas as instâncias: a landing tem o botão na barra e
// outro no menu do celular, e os dois precisam mostrar o mesmo tema.
const temaEscuro = signal(temaInicialEscuro());

/** Tema escuro ligado agora (para quem mostra o tema fora do botão, como o menu da conta). */
export const temaEscuroAtivo = temaEscuro.asReadonly();

// Só a escolha da pessoa fica salva; o padrão (claro no celular, escuro no
// computador) não, para continuar valendo em cada aparelho.
export function alternarTema(): void {
  temaEscuro.update((value) => !value);
  try {
    localStorage.setItem(THEME_KEY, temaEscuro() ? 'dark' : 'light');
  } catch {
    // Sem armazenamento (aba privada): vale até recarregar.
  }
}

@Component({
  selector: 'app-theme-toggle',
  standalone: true,
  imports: [CommonModule, MatTooltipModule, IconComponent],
  templateUrl: './theme-toggle.component.html',
  styleUrl: './theme-toggle.component.scss'
})
export class ThemeToggleComponent implements OnInit {
  // Começa pelo valor salvo: se começasse em "escuro" e só corrigisse no
  // ngOnInit, o effect abaixo rodaria uma vez tirando a classe light-mode
  // que o index.html já aplicou, e a tela piscaria escura no tema claro.
  isDarkMode = temaEscuro;
  // Nome curto à vista, embaixo do ícone ("Tema"), na barra do topo do celular.
  @Input() rotulo = '';
  // Nome do botão e dica: o que o clique faz.
  acao = computed(() => (this.isDarkMode() ? 'Usar tema claro' : 'Usar tema escuro'));

  constructor() {
    effect(() => {
      const dark = this.isDarkMode();
      const body = document.body;
      if (dark) {
        body.classList.remove('light-mode');
      } else {
        body.classList.add('light-mode');
      }
      document.querySelector('meta[name="theme-color"]')?.setAttribute('content', dark ? '#0e1416' : '#ffffff');
    });
  }

  ngOnInit(): void {
    this.isDarkMode.set(temaInicialEscuro());
  }

  toggleTheme(): void {
    alternarTema();
  }
}
