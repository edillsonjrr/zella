import { Component, signal } from '@angular/core';
import { CurrencyPipe } from '@angular/common';

type Via = 'gestor' | 'contratada' | 'arquivo';
type Carimbo = 'aprovado' | 'rejeitado' | null;

/**
 * A OS como o talão de vias carbonadas que o pessoal de manutenção conhece:
 * número de numeradora, campos pautados e o carimbo batido quando o gestor
 * decide o orçamento. As três vias mostram quem fica com qual cópia.
 */
@Component({
  selector: 'app-via-os',
  standalone: true,
  imports: [CurrencyPipe],
  templateUrl: './via-os.component.html',
  styleUrl: './via-os.component.scss'
})
export class ViaOsComponent {
  readonly vias: { id: Via; rotulo: string }[] = [
    { id: 'gestor', rotulo: '1ª via · Gestor' },
    { id: 'contratada', rotulo: '2ª via · Contratada' },
    { id: 'arquivo', rotulo: '3ª via · Arquivo' }
  ];
  readonly itens = [
    { nome: 'Recarga de gás R-410A', qtd: 1, un: 'un', preco: 380 },
    { nome: 'Limpeza de serpentina', qtd: 2, un: 'h', preco: 95 },
    { nome: 'Capacitor 35 µF', qtd: 1, un: 'un', preco: 64.5 }
  ];
  readonly total = this.itens.reduce((s, i) => s + i.qtd * i.preco, 0);

  via = signal<Via>('gestor');
  carimbo = signal<Carimbo>(null);
  // troca a chave para a animação do carimbo rodar de novo a cada batida
  batida = signal(0);

  carimbar(c: Exclude<Carimbo, null>): void {
    this.carimbo.set(c);
    this.batida.update(n => n + 1);
  }

  limpar(): void {
    this.carimbo.set(null);
  }
}
