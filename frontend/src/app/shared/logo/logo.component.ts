import { Component, Input } from '@angular/core';

/**
 * Logo do Zella — símbolo + wordmark.
 *
 * O símbolo é um "Z" desenhado como percurso: o caminho que o técnico faz
 * pela unidade até chegar no equipamento certo. Os três cantos que o traço
 * toca ecoam os marcadores de um QR Code (o jeito real de abrir um
 * equipamento no Zella), e o quadrado âmbar no fim do traço é o
 * equipamento localizado — único ponto de cor, porque é o único ponto que
 * importa.
 *
 * O ladrilho usa a cor primária e o traço usa a cor de fundo do tema, então
 * a marca inverte sozinha: teal escuro com Z claro no tema claro, teal
 * claro com Z escuro no tema escuro. O wordmark usa a --font-brand
 * (Manrope 800).
 */
@Component({
  selector: 'app-logo',
  standalone: true,
  template: `
    <span class="logo" [class.logo--mark-only]="!wordmark" [style.--logo-size.px]="size">
      @if (mark) {
      <svg
        class="logo-mark"
        viewBox="0 0 100 100"
        role="img"
        [attr.aria-label]="wordmark ? null : 'Zella'"
        [attr.aria-hidden]="wordmark ? 'true' : null"
      >
        <rect width="100" height="100" rx="24" class="logo-bg" />
        <!-- Z como percurso: de cima para baixo, de uma ponta a outra -->
        <path
          class="logo-z"
          d="M26 27 H74 L26 73 H66"
          fill="none"
          stroke-width="12"
          stroke-linecap="round"
          stroke-linejoin="round"
        />
        <!-- Nó âmbar: o equipamento localizado -->
        <rect class="logo-no" x="66" y="64" width="18" height="18" rx="5" />
      </svg>
      }
      @if (wordmark) {
        <span class="logo-word">Zella</span>
      }
    </span>
  `,
  styles: [`
    :host { display: inline-flex; line-height: 0; }

    .logo {
      display: inline-flex;
      align-items: center;
      gap: calc(var(--logo-size) * 0.24);
      color: var(--text-primary);
      user-select: none;
    }

    .logo-mark {
      width: var(--logo-size);
      height: var(--logo-size);
      flex-shrink: 0;
    }

    .logo-bg { fill: var(--primary-500); }
    .logo-z { stroke: var(--bg-primary); }
    .logo-no { fill: var(--warning-500); }

    .logo-word {
      font-family: var(--font-brand);
      font-weight: 800;
      font-size: calc(var(--logo-size) * 0.7);
      letter-spacing: -0.035em;
      line-height: 1;
      color: inherit;
    }
  `]
})
export class LogoComponent {
  /** Tamanho do símbolo em px; o wordmark escala proporcionalmente. */
  @Input() size = 32;
  /** Mostra o nome "Zella" ao lado do símbolo. */
  @Input() wordmark = true;
  /** Mostra o símbolo (o Z no ladrilho). Desligue para só o wordmark. */
  @Input() mark = true;
}
