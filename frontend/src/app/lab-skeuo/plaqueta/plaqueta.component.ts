import { Component, OnInit, input, signal } from '@angular/core';
import { rotuloPatrimonio } from '../../shared/rotulos';

/**
 * Plaqueta de patrimônio: o QR Code como ele vai existir de verdade, uma placa
 * de alumínio escovado rebitada no equipamento. O brilho do metal segue o
 * ponteiro, que é o que faz a placa parecer placa e não imagem.
 */
@Component({
  selector: 'app-plaqueta',
  standalone: true,
  templateUrl: './plaqueta.component.html',
  styleUrl: './plaqueta.component.scss'
})
export class PlaquetaComponent implements OnInit {
  titulo = input('Split 12.000 BTUs');
  local = input('Bloco B · Sala 204');
  // Código gravado no cadastro; a placa mostra "Patrimônio nº ...".
  codigo = input('PAT-00482');
  codigoTexto = () => rotuloPatrimonio(this.codigo());

  qr = signal<string | null>(null);
  brilhoX = signal(30);
  brilhoY = signal(20);
  incX = signal(0);
  incY = signal(0);

  async ngOnInit(): Promise<void> {
    // Mesmo ajuste da tela do QR Code: a lib é CommonJS e em produção só expõe `default`.
    const mod = await import('qrcode');
    const QRCode = ((mod as unknown as { default?: typeof mod }).default ?? mod) as typeof mod;
    this.qr.set(await QRCode.toDataURL(`https://zella.app/q/${this.codigo()}`, {
      width: 320, margin: 1, errorCorrectionLevel: 'M', color: { dark: '#1b2427', light: '#00000000' }
    }));
  }

  mover(e: PointerEvent): void {
    const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
    const x = (e.clientX - r.left) / r.width;
    const y = (e.clientY - r.top) / r.height;
    this.brilhoX.set(Math.round(x * 100));
    this.brilhoY.set(Math.round(y * 100));
    this.incX.set(+((0.5 - y) * 8).toFixed(2));
    this.incY.set(+((x - 0.5) * 10).toFixed(2));
  }

  soltar(): void {
    this.incX.set(0);
    this.incY.set(0);
    this.brilhoX.set(30);
    this.brilhoY.set(20);
  }
}
