import { Component, computed, signal } from '@angular/core';

interface ItemSaldo { nome: string; un: string; contratado: number; consumido: number; reservado: number; }

// O mostrador varre 240°: de -120° (vazio) a +120° (todo o contratado usado).
const VARREDURA = 240;
const INICIO = -120;

/**
 * Saldo do item de contrato como um manômetro de painel: o ponteiro é o que já
 * foi consumido, o ponteiro fantasma âmbar é o consumido mais o reservado em
 * orçamentos aprovados, e o contador de tambor mostra o que ainda está livre.
 */
@Component({
  selector: 'app-manometro',
  standalone: true,
  templateUrl: './manometro.component.html',
  styleUrl: './manometro.component.scss'
})
export class ManometroComponent {
  readonly itens: ItemSaldo[] = [
    { nome: 'Pintura', un: 'm²', contratado: 1200, consumido: 610, reservado: 180 },
    { nome: 'Elétrica', un: 'h', contratado: 400, consumido: 322, reservado: 46 },
    { nome: 'Hidráulica', un: 'un', contratado: 150, consumido: 38, reservado: 12 }
  ];
  readonly marcas = Array.from({ length: 41 }, (_, i) => {
    const ang = INICIO + (VARREDURA * i) / 40;
    const rad = (ang * Math.PI) / 180;
    // rótulos na horizontal, fora do giro da marca, para lerem direito em qualquer ponto do arco
    return {
      ang,
      maior: i % 4 === 0,
      rotulo: i % 8 === 0 ? `${(i / 40) * 100}` : '',
      x: +(100 + 57 * Math.sin(rad)).toFixed(2),
      y: +(100 - 57 * Math.cos(rad) + 3).toFixed(2)
    };
  });
  // faixas do mostrador: verde até 70%, âmbar até 90%, vermelho no fim
  readonly faixas = [
    { de: 0, ate: 0.7, cor: '#3aa66a' },
    { de: 0.7, ate: 0.9, cor: '#e3922c' },
    { de: 0.9, ate: 1, cor: '#d9453b' }
  ].map(f => ({ ...f, d: this.arco(f.de, f.ate, 84) }));

  sel = signal(0);
  consumido = signal(this.itens[0].consumido);
  reservado = signal(this.itens[0].reservado);

  item = computed(() => this.itens[this.sel()]);
  pctConsumido = computed(() => Math.min(1, this.consumido() / this.item().contratado));
  pctComReserva = computed(() => Math.min(1, (this.consumido() + this.reservado()) / this.item().contratado));
  anguloPonteiro = computed(() => INICIO + VARREDURA * this.pctConsumido());
  anguloFantasma = computed(() => INICIO + VARREDURA * this.pctComReserva());
  disponivel = computed(() => Math.max(0, this.item().contratado - this.consumido() - this.reservado()));
  /** Cinco tambores do contador; cada um guarda o dígito que deve mostrar. */
  tambores = computed(() => String(this.disponivel()).padStart(5, '0').split('').map(Number));
  critico = computed(() => this.pctComReserva() > 0.9);

  escolher(i: number): void {
    this.sel.set(i);
    this.consumido.set(this.itens[i].consumido);
    this.reservado.set(this.itens[i].reservado);
  }

  aoConsumir(v: string): void {
    this.consumido.set(Math.min(+v, this.item().contratado - this.reservado()));
  }

  aoReservar(v: string): void {
    this.reservado.set(Math.min(+v, this.item().contratado - this.consumido()));
  }

  private arco(de: number, ate: number, r: number): string {
    const p = (f: number) => {
      const a = ((INICIO + VARREDURA * f - 90) * Math.PI) / 180;
      return `${(100 + r * Math.cos(a)).toFixed(2)} ${(100 + r * Math.sin(a)).toFixed(2)}`;
    };
    const grande = (ate - de) * VARREDURA > 180 ? 1 : 0;
    return `M ${p(de)} A ${r} ${r} 0 ${grande} 1 ${p(ate)}`;
  }
}
