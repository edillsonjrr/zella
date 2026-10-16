import { Component, Input } from '@angular/core';

export type SpinnerSize = 'sm' | 'md' | 'lg';

/**
 * Indicador de carregamento da marca: o "Z" da logo, sem fundo, que se
 * escreve do início ao fim; quando o traço chega ao fim, o nó âmbar (o
 * equipamento localizado) aparece. Depois tudo se apaga em sentido inverso
 * e recomeça.
 *
 * O traço usa stroke-dasharray/dashoffset com pathLength="100": o offset vai
 * de 100 (nada desenhado) a 0 (Z completo), segura um instante e volta a
 * 100, recolhendo o traço da ponta para o início. O nó só existe enquanto
 * o Z está completo. Tudo em CSS, sem timer.
 *
 * O traço herda a cor do texto, então dentro de um botão fica na cor do
 * botão; no loader de página usa o teal da marca. O nó usa sempre o
 * âmbar da marca.
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
      <svg viewBox="0 0 100 100" aria-hidden="true">
        <path
          class="spinner-z"
          d="M26 27 H74 L26 73 H66"
          fill="none"
          stroke="currentColor"
          stroke-width="12"
          stroke-linecap="round"
          stroke-linejoin="round"
          pathLength="100"
        />
        <rect class="spinner-no" x="66" y="64" width="18" height="18" rx="5" />
      </svg>
      @if (label && showLabel) {
        <span class="spinner-label">{{ label }}</span>
      }
    </span>
  `,
  styles: [`
    :host { display: inline-flex; line-height: 0; vertical-align: middle; } /* its-ok: contêiner do SVG do spinner, sem texto */

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

    /* Ciclo de 2.6s: escreve o Z (0-40%), o nó aparece (40-46%), segura
       (46-58%), o nó some e o traço se apaga em sentido inverso, da ponta
       de volta ao início (58-94%), e respira um instante vazio antes de
       recomeçar. Propriedades longas de animação de propósito: var()
       dentro do atalho "animation" quebra o parser. */
    .spinner-z {
      stroke-dasharray: 100;
      stroke-dashoffset: 100;
      animation-name: spinner-draw;
      animation-duration: 2.6s;
      animation-timing-function: ease-in-out;
      animation-iteration-count: infinite;
    }

    .spinner-no {
      fill: var(--warning-500);
      transform-origin: 75px 73px;
      transform: scale(0);
      animation-name: spinner-no;
      animation-duration: 2.6s;
      animation-timing-function: cubic-bezier(0.16, 1, 0.3, 1);
      animation-iteration-count: infinite;
    }

    .spinner-label {
      font-size: 0.875rem;
      color: var(--text-secondary);
      line-height: 1.2;
    }

    @keyframes spinner-draw {
      0%   { stroke-dashoffset: 100; }
      40%  { stroke-dashoffset: 0; }
      58%  { stroke-dashoffset: 0; }
      94%  { stroke-dashoffset: 100; }
      100% { stroke-dashoffset: 100; }
    }

    @keyframes spinner-no {
      0%, 40%   { transform: scale(0); }
      46%, 56%  { transform: scale(1); }
      60%, 100% { transform: scale(0); }
    }
  `]
})
export class SpinnerComponent {
  /** sm = dentro de botão; md = trecho de tela; lg = página inteira. */
  @Input() size: SpinnerSize = 'md';
  /** Usa o teal da marca em vez de herdar a cor do texto (loader de página). */
  @Input() brand = false;
  /** Texto lido por leitor de tela e, com showLabel, exibido ao lado. */
  @Input() label = 'Carregando';
  @Input() showLabel = false;
}
