import { Component } from '@angular/core';
import { IconComponent } from '../icon/icon.component';
import { LEGENDA_SALDO } from '../rotulos';

/**
 * Legenda de uma linha que explica os três números do saldo de um item
 * (separado, usado e livre). Vai em toda tela que mostra esses números.
 */
@Component({
  selector: 'app-legenda-saldo',
  standalone: true,
  imports: [IconComponent],
  template: `<p class="legenda-saldo"><app-icon name="info" aria-hidden="true"></app-icon><span>{{ texto }}</span></p>`,
  styles: `
    :host { display: block; }
    .legenda-saldo {
      display: flex;
      align-items: flex-start;
      gap: 6px;
      margin: 0;
      font-size: 0.75rem;
      line-height: 1.45;
      color: var(--text-tertiary);
      text-wrap: pretty;
    }
    app-icon { flex-shrink: 0; font-size: 14px; margin-top: 2px; }
  `
})
export class LegendaSaldoComponent {
  readonly texto = LEGENDA_SALDO;
}
