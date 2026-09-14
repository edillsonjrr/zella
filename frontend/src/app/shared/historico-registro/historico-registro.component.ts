import { Component, Input, inject, signal } from '@angular/core';
import { IconComponent } from '../icon/icon.component';
import { LogService } from '../log.service';
import type { LogEntrada } from '../models';

/**
 * Histórico de auditoria de um registro, para usar dentro dos painéis de
 * detalhe.
 *
 * Carrega sob demanda, na primeira vez que é aberto: a maioria das visitas a
 * um painel não abre o histórico, e não faz sentido pagar a consulta em
 * todas elas.
 */
@Component({
  selector: 'app-historico-registro',
  standalone: true,
  imports: [IconComponent],
  templateUrl: './historico-registro.component.html',
  styleUrl: './historico-registro.component.scss'
})
export class HistoricoRegistroComponent {
  private log = inject(LogService);

  /** Id do registro. Em alvos com filhos (contrato), traz os filhos junto. */
  @Input({ required: true }) alvoPaiId = '';
  @Input() titulo = 'Histórico';

  eventos = signal<LogEntrada[]>([]);
  aberto = signal(false);
  carregando = signal(false);

  async alternar(): Promise<void> {
    const abrindo = !this.aberto();
    this.aberto.set(abrindo);

    if (abrindo && !this.eventos().length) {
      this.carregando.set(true);
      this.eventos.set(await this.log.historicoDe(this.alvoPaiId));
      this.carregando.set(false);
    }
  }

  formatarDataHora(iso: string): string {
    const data = new Date(iso);
    return `${data.toLocaleDateString('pt-BR')} às ${data.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}`;
  }
}
