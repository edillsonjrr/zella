import { Injectable, Injector, inject } from '@angular/core';
import { DataService } from './data.service';
import { banco } from '../demo/banco';
import { registrarLog } from '../demo/fluxo';
import type { AlvoLog, LogEntrada, OperacaoLog } from './models';

interface RegistroLog {
  alvo: AlvoLog;
  operacao: OperacaoLog;
  descricao: string;
  alvoId: string;
  alvoRotulo: string;
  alvoPaiId?: string;
  detalhes?: Record<string, unknown>;
}

/**
 * LogService da demonstração (trocado pela configuração `demo`). O log mora
 * no banco em memória junto com o resto; as ações de fluxo já gravam o
 * delas em demo/fluxo.ts, como as functions gravam na mesma transação.
 */
@Injectable({ providedIn: 'root' })
export class LogService {
  // Mesmo motivo do serviço de verdade: o DataService depende deste, então
  // a leitura dele é sob demanda.
  private injector = inject(Injector);

  async registrar(registro: RegistroLog): Promise<void> {
    const usuarioId = banco.sessao;
    const usuario = banco.ler().usuarios.find(u => u.id === usuarioId);
    if (!usuario) return;
    try {
      banco.alterar(d => registrarLog(d, { uid: usuario.id, nome: usuario.nome, email: usuario.email }, registro, 'app'));
    } catch {
      // Silencioso de propósito: um log que falha não derruba a ação.
    }
  }

  /** Histórico de um ou mais registros (só a gestão lê o log). */
  async historicoDe(ids: string | string[]): Promise<LogEntrada[]> {
    const lista = new Set((Array.isArray(ids) ? ids : [ids]).filter(Boolean));
    if (!lista.size || this.injector.get(DataService).perfilSessao !== 'gestor') return [];
    return banco
      .ler()
      .logs.filter(l => lista.has(l.alvoPaiId) || lista.has(l.alvoId))
      .sort((a, b) => b.data.localeCompare(a.data));
  }
}
