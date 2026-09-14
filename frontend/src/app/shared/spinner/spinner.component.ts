import { Component, Input } from '@angular/core';

export type SpinnerSize = 'sm' | 'md' | 'lg';

/**
 * Indicador de carregamento da marca: o "Z" da logo, sem fundo, que se
 * escreve do início ao fim e depois se apaga em sentido inverso.
 *
 * O traço usa stroke-dasharray/dashoffset com pathLength="100": o offset vai
 * de 100 (nada desenhado) a 0 (Z completo), segura um instante e volta a
 * 100, recolhendo o traço da ponta para o início. Tudo em CSS, sem timer.
 * Herda a cor do texto, então dentro de um botão fica na cor do botão; no
 * loader de página usa o roxo da marca.
 *
 * Roda também com `prefers-reduced-motion`: é um traço pequeno, sem
 * deslocamento, e é o único sinal de que algo está carregando (ver a
 * exceção em styles.scss).
 */
@Component({
  selector: 'app-spinner',
  standalone: true,
  template: `
    <span
      class="spinner"
      [class.spinner--sm]="size === 'sm'"
      [class.spinner--md]="size === 'md'"
      [class.spinner--lg]="size === 'lg'"
      [class.spinner--brand]="brand"
      role="status"
      [attr.aria-label]="label"
    >
      <svg viewBox="0 0 32 32" aria-hidden="true">
        <path
          class="spinner-z"
          d="M9 10.5h14L9 21.5h14"
          fill="none"
          stroke="currentColor"
          stroke-width="3.6"
          stroke-linecap="round"
          stroke-linejoin="round"
          pathLength="100"
        />
      </svg>
      @if (label && showLabel) {
        <span class="spinner-label">{{ label }}</span>
      }
    </span>
  `,
  styles: [`
    :host { display: inline-flex; line-height: 0; vertical-align: middle; }

    .spinner {
      display: inline-flex;
      align-items: center;
      gap: 10px;
      color: inherit;
    }

    svg { display: block; flex-shrink: 0; overflow: visible; }

    .spinner--sm svg { width: 16px; height: 16px; }
    .spinner--md svg { width: 28px; height: 28px; }
    .spinner--lg svg { width: 48px; height: 48px; }

    .spinner--brand { color: var(--primary-500); }

    /* Ciclo de 2.4s: escreve o Z (0–42%), segura (42–55%), apaga em
       sentido inverso, da ponta de volta ao início (55–95%), e respira
       um instante vazio (95–100%) antes de recomeçar. */
    .spinner-z {
      stroke-dasharray: 100;
      stroke-dashoffset: 100;
      animation: spinner-draw 2.4s ease-in-out infinite;
    }

    .spinner-label {
      font-size: 0.875rem;
      color: var(--text-secondary);
      line-height: 1.2;
    }

    @keyframes spinner-draw {
      0%   { stroke-dashoffset: 100; }
      42%  { stroke-dashoffset: 0; }
      55%  { stroke-dashoffset: 0; }
      95%  { stroke-dashoffset: 100; }
      100% { stroke-dashoffset: 100; }
    }

  `]
})
export class SpinnerComponent {
  /** sm = dentro de botão; md = trecho de tela; lg = página inteira. */
  @Input() size: SpinnerSize = 'md';
  /** Usa o roxo da marca em vez de herdar a cor do texto (loader de página). */
  @Input() brand = false;
  /** Texto lido por leitor de tela e, com showLabel, exibido ao lado. */
  @Input() label = 'Carregando';
  @Input() showLabel = false;
}
