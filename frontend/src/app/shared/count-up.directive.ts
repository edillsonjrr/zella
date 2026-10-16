import { Directive, ElementRef, Input, NgZone, OnChanges, OnDestroy, inject } from '@angular/core';

/**
 * Número que conta até o valor novo (padrão "number ticker" do Details Vault /
 * anime.js), partindo do último valor exibido. Sem biblioteca: rAF + ease-out.
 * Respeita prefers-reduced-motion (a não ser que o app force data-motion="full").
 *
 * Rodada 2 (15/10/2026): ao abrir a tela o número já vem no valor final (antes
 * contava do zero e mostrava valores intermediários que não batiam com a
 * lista); só uma mudança depois (trocar o período) anima, em no máximo
 * 350 ms. O leitor de tela lê só o valor final: o número que corre fica
 * escondido dele, e o final vai num texto só para leitores.
 *
 * Uso: <strong [appCountUp]="card.raw" [countFormat]="card.format"></strong>
 */
@Directive({ selector: '[appCountUp]', standalone: true })
export class CountUpDirective implements OnChanges, OnDestroy {
  @Input('appCountUp') value = 0;
  @Input() countFormat: (value: number) => string = (v) => String(Math.round(v));
  @Input() countDuration = 350;

  private readonly el = inject(ElementRef<HTMLElement>).nativeElement as HTMLElement;
  private readonly zone = inject(NgZone);
  private shown: number | null = null;
  private target: number | null = null;
  private frame = 0;

  ngOnChanges(): void {
    const to = Number.isFinite(this.value) ? this.value : 0;
    if (to === this.target) {
      return;
    }
    this.target = to;
    cancelAnimationFrame(this.frame);
    const from = this.shown;
    this.anunciar(to);

    if (from === null || from === to || this.reducedMotion()) {
      this.render(to);
      return;
    }

    const start = performance.now();
    this.zone.runOutsideAngular(() => {
      const tick = (now: number) => {
        const t = Math.min(1, (now - start) / Math.min(this.countDuration, 400));
        const eased = 1 - Math.pow(1 - t, 3);
        this.render(t === 1 ? to : from + (to - from) * eased);
        if (t < 1) {
          this.frame = requestAnimationFrame(tick);
        }
      };
      this.frame = requestAnimationFrame(tick);
    });
  }

  ngOnDestroy(): void {
    cancelAnimationFrame(this.frame);
  }

  // Duas partes: o número visível (escondido do leitor de tela) e o valor
  // final só para o leitor, que não ouve a contagem.
  private visivel?: HTMLElement;
  private paraLeitor?: HTMLElement;

  private partes(): void {
    if (this.visivel) return;
    this.el.textContent = '';
    this.visivel = document.createElement('span');
    this.visivel.setAttribute('aria-hidden', 'true');
    this.paraLeitor = document.createElement('span');
    this.paraLeitor.className = 'sr-only';
    this.el.append(this.visivel, this.paraLeitor);
  }

  private anunciar(value: number): void {
    this.partes();
    this.paraLeitor!.textContent = this.countFormat(value);
  }

  private render(value: number): void {
    this.partes();
    this.shown = value;
    this.visivel!.textContent = this.countFormat(value);
  }

  private reducedMotion(): boolean {
    return (
      window.matchMedia('(prefers-reduced-motion: reduce)').matches &&
      document.documentElement.getAttribute('data-motion') !== 'full'
    );
  }
}
