import { Component, computed, signal } from '@angular/core';

const MESES = ['JAN', 'FEV', 'MAR', 'ABR', 'MAI', 'JUN', 'JUL', 'AGO', 'SET', 'OUT', 'NOV', 'DEZ'];

/**
 * Plano de preventiva como a etiqueta de inspeção de papelão pendurada no
 * equipamento: cada execução fura o mês, a rubrica fica ao lado, e o mês que
 * passou sem furo ganha o carimbo de atrasada.
 */
@Component({
  selector: 'app-etiqueta-preventiva',
  standalone: true,
  templateUrl: './etiqueta-preventiva.component.html',
  styleUrl: './etiqueta-preventiva.component.scss'
})
export class EtiquetaPreventivaComponent {
  readonly meses = MESES;
  /** Mês corrente da demonstração: setembro (índice 8). */
  readonly mesAtual = 8;

  // julho ficou sem execução: é o que faz a etiqueta nascer atrasada
  furados = signal(new Set([0, 1, 2, 3, 4, 5, 7]));
  ultimoFuro = signal<number | null>(null);

  atrasados = computed(() => this.meses.map((_, i) => i).filter(i => i < this.mesAtual && !this.furados().has(i)));
  proximo = computed(() => {
    for (let i = this.mesAtual; i < 12; i++) if (!this.furados().has(i)) return MESES[i];
    return 'JAN/27';
  });

  alternar(i: number): void {
    if (i > this.mesAtual) return;
    const s = new Set(this.furados());
    if (s.has(i)) {
      s.delete(i);
      this.ultimoFuro.set(null);
    } else {
      s.add(i);
      this.ultimoFuro.set(i);
    }
    this.furados.set(s);
  }
}
