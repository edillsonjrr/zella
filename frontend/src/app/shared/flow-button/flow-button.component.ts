import {
  AfterViewInit,
  Component,
  ElementRef,
  Input,
  OnDestroy,
  ViewChild,
  signal
} from '@angular/core';

// Adaptado de "Flow Button" (spell.sh/docs/flow-button) para Angular: o
// original mede o botão em um useEffect + useRef; aqui um ResizeObserver
// mantém o contorno correto mesmo se o texto do botão mudar depois de
// renderizado. A animação (stroke-dashoffset) só roda no :hover e já é
// desligada por prefers-reduced-motion (regra global em styles.scss).
export type FlowButtonSize = 'sm' | 'default' | 'lg';
export type FlowButtonVariant = 'primary' | 'secondary';

const RADIUS_POR_TAMANHO: Record<FlowButtonSize, number> = {
  sm: 16,
  default: 18,
  lg: 20
};

@Component({
  selector: 'app-flow-button',
  standalone: true,
  templateUrl: './flow-button.component.html',
  styleUrl: './flow-button.component.scss'
})
export class FlowButtonComponent implements AfterViewInit, OnDestroy {
  @Input() size: FlowButtonSize = 'default';
  @Input() variant: FlowButtonVariant = 'primary';
  @Input() borderColor = 'var(--flow-button-border-color, var(--primary-400))';
  @Input() type: 'button' | 'submit' = 'button';
  @Input() disabled = false;

  @ViewChild('botao') private botaoRef!: ElementRef<HTMLButtonElement>;

  largura = signal(0);
  altura = signal(0);
  private resizeObserver?: ResizeObserver;

  get raio(): number {
    return RADIUS_POR_TAMANHO[this.size];
  }

  get caminhoSvg(): string {
    const w = this.largura();
    const h = this.altura();
    const r = this.raio;
    if (!w || !h) return '';
    return `M${r},0.5 H${w - r} A${r},${r} 0 0 1 ${w - 0.5},${r} V${h - r} A${r},${r} 0 0 1 ${w - r},${h - 0.5} H${r} A${r},${r} 0 0 1 0.5,${h - r} V${r} A${r},${r} 0 0 1 ${r},0.5 Z`;
  }

  ngAfterViewInit(): void {
    const el = this.botaoRef.nativeElement;
    this.medir();
    this.resizeObserver = new ResizeObserver(() => this.medir());
    this.resizeObserver.observe(el);
  }

  ngOnDestroy(): void {
    this.resizeObserver?.disconnect();
  }

  private medir(): void {
    const el = this.botaoRef?.nativeElement;
    if (!el) return;
    this.largura.set(el.offsetWidth);
    this.altura.set(el.offsetHeight);
  }
}
