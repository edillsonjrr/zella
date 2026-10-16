import { Injectable, signal } from '@angular/core';

/** Abre e fecha a busca global (⌘K / Ctrl+K). */
@Injectable({ providedIn: 'root' })
export class BuscaGlobalService {
  readonly aberto = signal(false);

  /** Rótulo da tecla modificadora do sistema, para os atalhos exibidos. */
  readonly modificador = typeof navigator !== 'undefined' && /Mac|iPhone|iPad/i.test(navigator.userAgent) ? '⌘' : 'Ctrl';

  abrir(): void {
    this.aberto.set(true);
  }

  fechar(): void {
    this.aberto.set(false);
  }

  alternar(): void {
    this.aberto.update(v => !v);
  }
}
