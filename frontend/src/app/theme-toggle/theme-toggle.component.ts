import { Component, effect, OnInit, signal } from '@angular/core';
import { CommonModule } from '@angular/common';

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

@Component({
  selector: 'app-theme-toggle',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './theme-toggle.component.html',
  styleUrl: './theme-toggle.component.scss'
})
export class ThemeToggleComponent implements OnInit {
  // Começa pelo valor salvo: se começasse em "escuro" e só corrigisse no
  // ngOnInit, o effect abaixo rodaria uma vez tirando a classe light-mode
  // que o index.html já aplicou, e a tela piscaria escura no tema claro.
  isDarkMode = signal(lerTemaSalvo() !== 'light');

  constructor() {
    effect(() => {
      const dark = this.isDarkMode();
      const body = document.body;
      if (dark) {
        body.classList.remove('light-mode');
      } else {
        body.classList.add('light-mode');
      }
      localStorage.setItem(THEME_KEY, dark ? 'dark' : 'light');
      document.querySelector('meta[name="theme-color"]')?.setAttribute('content', dark ? '#111111' : '#ffffff');
    });
  }

  ngOnInit(): void {
    this.isDarkMode.set(lerTemaSalvo() !== 'light');
  }

  toggleTheme(): void {
    this.isDarkMode.update((value) => !value);
  }
}
