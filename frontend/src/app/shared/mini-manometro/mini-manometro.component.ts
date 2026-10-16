import { Component, computed, input } from '@angular/core';

// O mostrador varre 240°: de -120° (nada usado) a +120° (todo o contratado).
const VARREDURA = 240;
const INICIO = -120;
let sequencia = 0;

/**
 * Saldo de um item como um manômetro de painel, em miniatura: o ponteiro
 * vermelho é o usado e o âmbar, mais fino, soma o separado em orçamentos aprovados.
 * As faixas do mostrador (verde até 70%, âmbar até 90%, vermelho depois)
 * seguem o mesmo corte de alerta do resto do painel.
 */
@Component({
  selector: 'app-mini-manometro',
  standalone: true,
  templateUrl: './mini-manometro.component.html',
  styleUrl: './mini-manometro.component.scss',
  host: { '[style.--tamanho]': "tamanho() + 'px'" }
})
export class MiniManometroComponent {
  consumido = input.required<number>();
  reservado = input(0);
  contratado = input.required<number>();
  tamanho = input(36);

  /** Os gradientes do SVG são globais na página: cada instância precisa do seu. */
  readonly uid = `mm${++sequencia}`;

  readonly faixas = [
    { de: 0, ate: 0.7, cor: '#3aa66a' },
    { de: 0.7, ate: 0.9, cor: '#e3922c' },
    { de: 0.9, ate: 1, cor: '#d9453b' }
  ].map(f => ({ ...f, d: arco(f.de, f.ate, 36) }));
  readonly marcas = Array.from({ length: 6 }, (_, i) => INICIO + (VARREDURA * i) / 5);

  private fracao = (v: number) => (this.contratado() > 0 ? Math.min(1, Math.max(0, v / this.contratado())) : 0);
  anguloConsumo = computed(() => INICIO + VARREDURA * this.fracao(this.consumido()));
  anguloReserva = computed(() => INICIO + VARREDURA * this.fracao(this.consumido() + this.reservado()));
  descricao = computed(() => {
    const pct = (v: number) => Math.round(this.fracao(v) * 100);
    return `${pct(this.consumido())}% usado, ${pct(this.consumido() + this.reservado())}% com o separado`;
  });
}

function arco(de: number, ate: number, r: number): string {
  const p = (f: number) => {
    const a = ((INICIO + VARREDURA * f - 90) * Math.PI) / 180;
    return `${(50 + r * Math.cos(a)).toFixed(2)} ${(50 + r * Math.sin(a)).toFixed(2)}`;
  };
  const grande = (ate - de) * VARREDURA > 180 ? 1 : 0;
  return `M ${p(de)} A ${r} ${r} 0 ${grande} 1 ${p(ate)}`;
}
