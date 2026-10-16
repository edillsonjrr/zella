import { Component, Input, computed, inject, signal } from '@angular/core';
import { IconComponent } from '../icon/icon.component';
import { LogService } from '../log.service';
import { DataService } from '../data.service';
import { dataBr, descreverDetalhes, idsDaLinhaDoTempo, limparTexto, montarLinhaDoTempo, type EventoLinhaDoTempo } from '../../../../../shared/historico';
import type { LogEntrada } from '../models';

/**
 * Histórico de um registro, para usar dentro dos painéis de detalhe.
 *
 * Dois modos:
 * - `chamadoId`: a linha do tempo do atendimento (Z0.2). Chamado e OS
 *   mostram a mesma, do pedido aberto ao encerramento. Os marcos saem dos
 *   próprios registros, que todo perfil que abre o painel já lê; para a
 *   gestão, que lê o log, cada marco ganha hora e autor.
 * - `alvoPaiId`: as entradas do log de um registro com filhos (contrato e
 *   itens), só para a gestão.
 *
 * O log é lido sob demanda, na primeira vez que o histórico é aberto: a
 * maioria das visitas a um painel não abre o histórico.
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
  private dataService = inject(DataService);

  /** Contrato (e itens): entradas do log. */
  @Input() alvoPaiId = '';
  /** Chamado: a linha do tempo do atendimento inteiro (chamado, OS, orçamentos). */
  @Input() set chamadoId(id: string | null | undefined) {
    this.chamadoIdSig.set(id ?? '');
  }
  @Input() titulo = 'Histórico';

  private chamadoIdSig = signal('');
  private logs = signal<LogEntrada[]>([]);
  aberto = signal(false);
  carregando = signal(false);

  readonly lerLog = this.dataService.perfilSessao === 'gestor';

  /* Linha do tempo (modo chamado) ------------------------------------------ */

  private registros = computed(() => {
    const chamado = this.dataService.getChamadoById(this.chamadoIdSig());
    if (!chamado) return null;
    const ordens = this.dataService.ordensServico()
      .filter(o => o.chamadoId === chamado.id)
      .sort((a, b) => a.dataCriacao.localeCompare(b.dataCriacao));
    const ids = new Set(ordens.map(o => o.id));
    const orcamentos = this.dataService.orcamentos().filter(o => ids.has(o.osId));
    return { chamado, ordens, orcamentos };
  });

  linhaDoTempo = computed<EventoLinhaDoTempo[]>(() => {
    const r = this.registros();
    if (!r) return [];
    return montarLinhaDoTempo({
      ...r,
      logs: this.logs(),
      nomeUsuario: id => this.dataService.getUsuarioById(id)?.nome,
      nomeContratada: id => this.dataService.getEmpresaContratadaById(id)?.nome
    });
  });

  /* Entradas do log (modo contrato) ----------------------------------------- */

  entradas = computed(() =>
    this.logs().map(l => ({
      id: l.id,
      descricao: limparTexto(l.descricao),
      detalhes: descreverDetalhes(l.detalhes, (campo, id) => this.nomeDoId(campo, id)),
      autor: l.usuarioUid === 'sistema' ? 'Automático' : l.usuarioNome,
      quando: dataBr(l.data)
    }))
  );

  get modoChamado(): boolean {
    return !!this.chamadoIdSig();
  }

  async alternar(): Promise<void> {
    const abrindo = !this.aberto();
    this.aberto.set(abrindo);
    if (!abrindo || !this.lerLog) return;

    // Relê a cada abertura: o fluxo pode ter andado com o painel aberto.
    const ids = this.modoChamado
      ? (() => {
          const r = this.registros();
          return r ? idsDaLinhaDoTempo(r) : [];
        })()
      : [this.alvoPaiId];
    if (!ids.length) return;
    this.carregando.set(!this.logs().length);
    this.logs.set(await this.log.historicoDe(ids));
    this.carregando.set(false);
  }

  private nomeDoId(campo: string, id: string): string | undefined {
    const ds = this.dataService;
    if (campo === 'unidadeId') return ds.getUnidadeById(id)?.nome;
    if (campo === 'contratoId') return ds.getContratoById(id)?.numero;
    if (campo.startsWith('os')) return ds.getOSById(id)?.numero;
    return ds.getUsuarioById(id)?.nome;
  }
}
