import { Injectable, Injector, inject } from '@angular/core';
import { doc, getDocs, limit, orderBy, query, setDoc, where } from 'firebase/firestore';
import { auth } from './firebase';
import { DataService } from './data.service';
import type { AlvoLog, LogEntrada, OperacaoLog } from './models';

interface RegistroLog {
  alvo: AlvoLog;
  operacao: OperacaoLog;
  descricao: string;
  alvoId: string;
  alvoRotulo: string;
  // Só para alvos que pertencem a outro registro (item → contrato). Sem
  // isso, cai no próprio alvoId.
  alvoPaiId?: string;
  detalhes?: Record<string, unknown>;
}

@Injectable({ providedIn: 'root' })
export class LogService {
  // O DataService é quem chama este serviço, então injetá-lo direto fecharia
  // um ciclo na construção. Resolver sob demanda pelo Injector quebra o ciclo
  // sem precisar de um segundo listener da coleção de usuários só pra achar
  // o nome de quem fez a ação.
  private injector = inject(Injector);

  /**
   * Registra uma ação feita direto pelo app (cadastros simples, que escrevem
   * no Firestore sem passar por Cloud Function). As ações de fluxo — chamado,
   * OS, orçamento — são logadas pelo backend, dentro da mesma transação da
   * ação, e chegam aqui com origem 'backend'.
   *
   * Não propaga erro: um log que falha não pode derrubar a operação que o
   * usuário acabou de fazer com sucesso.
   */
  async registrar(registro: RegistroLog): Promise<void> {
    const usuario = auth.currentUser;
    if (!usuario) return;

    const ref = doc(this.injector.get(DataService).col('logs'));
    const entrada: LogEntrada = {
      id: ref.id,
      acao: `${registro.alvo}.${registro.operacao}`,
      alvo: registro.alvo,
      operacao: registro.operacao,
      descricao: registro.descricao,
      data: new Date().toISOString(),
      usuarioUid: usuario.uid,
      usuarioNome: this.nomeDoUsuario(usuario.email),
      usuarioEmail: usuario.email ?? '',
      alvoId: registro.alvoId,
      alvoRotulo: registro.alvoRotulo,
      alvoPaiId: registro.alvoPaiId ?? registro.alvoId,
      origem: 'app'
    };

    if (registro.detalhes) {
      entrada.detalhes = registro.detalhes;
    }

    try {
      await setDoc(ref, entrada);
    } catch {
      // Silencioso de propósito: ver comentário acima.
    }
  }

  /**
   * Histórico de um registro específico, para os painéis de detalhe.
   *
   * É uma consulta pontual em vez de filtrar a lista da tela de logs porque
   * aquela é limitada às entradas mais recentes — um contrato antigo ficaria
   * sem histórico se dependesse dela.
   */
  async historicoDe(id: string): Promise<LogEntrada[]> {
    // São duas consultas porque cada entrada tem UM pai só. "Criou a OS X a
    // partir do chamado Y" aponta pro chamado (é lá que faz sentido ler), e
    // por alvoPaiId a própria OS não veria a própria criação. Buscar também
    // por alvoId fecha essa lacuna, nos dois sentidos.
    const logs = this.injector.get(DataService).col('logs');
    const porPai = query(logs, where('alvoPaiId', '==', id), orderBy('data', 'desc'), limit(50));
    const porAlvo = query(logs, where('alvoId', '==', id), orderBy('data', 'desc'), limit(50));

    try {
      const [paiSnap, alvoSnap] = await Promise.all([getDocs(porPai), getDocs(porAlvo)]);

      // As duas consultas se sobrepõem (a maioria das entradas tem
      // alvoPaiId == alvoId), então o Map desduplica por id.
      const porId = new Map<string, LogEntrada>();
      for (const doc of [...paiSnap.docs, ...alvoSnap.docs]) {
        const entrada = doc.data() as LogEntrada;
        porId.set(entrada.id, entrada);
      }

      return [...porId.values()].sort((a, b) => b.data.localeCompare(a.data));
    } catch {
      return [];
    }
  }

  // O log guarda o e-mail do Firebase Auth como identidade; o nome vem do
  // cadastro de usuários quando existe, senão fica o próprio e-mail.
  private nomeDoUsuario(email: string | null): string {
    if (!email) return 'Desconhecido';
    const usuarios = this.injector.get(DataService).usuarios();
    return usuarios.find(u => u.email === email)?.nome ?? email;
  }
}
