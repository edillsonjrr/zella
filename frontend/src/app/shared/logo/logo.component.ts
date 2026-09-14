import { Component, Input } from '@angular/core';

/**
 * Logo do Zella — símbolo + wordmark.
 *
 * O símbolo é um "Z" desenhado como três blocos de um quadro kanban
 * (referência ao Trello): duas colunas e a diagonal que as liga. O
 * wordmark usa DM Sans, a alternativa aberta mais próxima da Charlie
 * Display, fonte proprietária do wordmark do Trello.
 */
@Component({
  selector: 'app-logo',
  standalone: true,
  template: `
    <span class="logo" [class.logo--mark-only]="!wordmark" [style.--logo-size.px]="size">
      @if (mark) {
      <svg
        class="logo-mark"
        viewBox="0 0 32 32"
        role="img"
        [attr.aria-label]="wordmark ? null : 'Zella'"
        [attr.aria-hidden]="wordmark ? 'true' : null"
      >
        <rect width="32" height="32" rx="8" class="logo-bg" />
        <!-- Z construído com blocos de quadro -->
        <path
          d="M9 10.5h14M9 21.5h14M22.5 10.5 9.5 21.5"
          fill="none"
          stroke="currentColor"
          stroke-width="3.6"
          stroke-linecap="round"
          stroke-linejoin="round"
        />
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
      gap: calc(var(--logo-size) * 0.3);
      color: var(--text-primary);
      user-select: none;
    }

    .logo-mark {
      width: var(--logo-size);
      height: var(--logo-size);
      flex-shrink: 0;
      color: #fff;
    }

    .logo-bg { fill: var(--primary-500); }

    .logo-word {
      font-family: var(--font-brand);
      font-weight: 700;
      font-size: calc(var(--logo-size) * 0.72);
      letter-spacing: -0.03em;
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
  /** Mostra o símbolo (o Z no quadrado). Desligue para só o wordmark. */
  @Input() mark = true;
}
