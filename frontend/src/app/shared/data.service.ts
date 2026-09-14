import { Injectable, Signal, WritableSignal, computed, inject, signal } from '@angular/core';

import { httpsCallable } from 'firebase/functions';
import {
  collection,
  collectionGroup,
  deleteDoc,
  doc,
  where,
  type CollectionReference,
  type DocumentReference,
  limit,
  onSnapshot,
  orderBy,
  query,
  setDoc,
  updateDoc,
  arrayUnion,
  writeBatch,
  type Unsubscribe
} from 'firebase/firestore';
import { db, functions } from './firebase';
import type { Unidade, Bloco, Sala, Equipamento, Contrato, ItemContrato, Chamado, OrdemServico, Orcamento, OrcamentoPedidoItem, Usuario, LogEntrada, PlanoManutencao, EmpresaContratada, Notificacao, OperacaoPreventiva } from './models';
import { UiFeedbackService } from './ui-feedback.service';
import { LogService } from './log.service';


// Um listener que falha (regra negou, rede caiu) é encerrado pelo SDK e não
// avisa de novo. Registrar no console é o que sobra pra diagnosticar; a tela
// fica com a lista vazia em vez de quebrar.
function erroDeLeitura(caminho: string): (erro: Error) => void {
  return erro => console.warn(`Leitura de "${caminho}" encerrada:`, erro.message);
}

@Injectable({
  providedIn: 'root'
})
export class DataService {
  private readonly feedback = inject(UiFeedbackService);
  private readonly log = inject(LogService);

  // Dados vêm do Firestore em tempo real (onSnapshot). Os listeners não
  // abrem na criação do serviço: as Security Rules leem o perfil do token, e
  // ele só existe depois que o AuthService carregou o cadastro. É o
  // AuthService que chama `iniciar` (login) e `parar` (logout).
  private readonly unidadesSig = signal<Unidade[]>([]);
  private readonly blocosSig = signal<Bloco[]>([]);
  private readonly salasSig = signal<Sala[]>([]);
  private readonly equipamentosSig = signal<Equipamento[]>([]);
  private readonly chamadosSig = signal<Chamado[]>([]);
  private readonly ordensServicoSig = signal<OrdemServico[]>([]);
  private readonly orcamentosSig = signal<Orcamento[]>([]);
  private readonly usuariosSig = signal<Usuario[]>([]);
  private readonly planosManutencaoSig = signal<PlanoManutencao[]>([]);
  private readonly empresasContratadasSig = signal<EmpresaContratada[]>([]);
  // Notificações vêm de duas consultas (pra mim / pro meu perfil), unidas aqui.
  private readonly notificacoesPessoais = signal<Notificacao[]>([]);
  private readonly notificacoesPerfil = signal<Notificacao[]>([]);
  readonly operacaoPreventiva = signal<OperacaoPreventiva | null>(null);

  readonly unidades: Signal<Unidade[]> = this.unidadesSig.asReadonly();
  readonly blocos: Signal<Bloco[]> = this.blocosSig.asReadonly();
  readonly salas: Signal<Sala[]> = this.salasSig.asReadonly();
  readonly equipamentos: Signal<Equipamento[]> = this.equipamentosSig.asReadonly();
  readonly chamados: Signal<Chamado[]> = this.chamadosSig.asReadonly();
  readonly ordensServico: Signal<OrdemServico[]> = this.ordensServicoSig.asReadonly();
  readonly orcamentos: Signal<Orcamento[]> = this.orcamentosSig.asReadonly();
  readonly usuarios: Signal<Usuario[]> = this.usuariosSig.asReadonly();
  readonly planosManutencao: Signal<PlanoManutencao[]> = this.planosManutencaoSig.asReadonly();
  readonly empresasContratadas: Signal<EmpresaContratada[]> = this.empresasContratadasSig.asReadonly();
  readonly notificacoes = computed<Notificacao[]>(() => {
    const vistos = new Set<string>();
    return [...this.notificacoesPessoais(), ...this.notificacoesPerfil()].filter(n => !vistos.has(n.id) && vistos.add(n.id));
  });

  // O log cresce sem teto, então — diferente das outras coleções — só as
  // entradas mais recentes ficam em memória. O histórico completo de um
  // registro vem de consulta pontual (LogService.historicoDe).
  logs = signal<LogEntrada[]>([]);

  // Contrato guarda cabeçalho em contratos/{id} e itens numa subcoleção
  // contratos/{id}/itens/{itemId} (assim as Security Rules travam
  // reservado/consumido/disponível só pras Cloud Functions escreverem) —
  // por isso precisa de dois listeners combinados num computed.
  private contratosCabecalho = signal<Omit<Contrato, 'itens'>[]>([]);
  private itensPorContrato = signal<Map<string, ItemContrato[]>>(new Map());

  contratos = computed<Contrato[]>(() =>
    this.contratosCabecalho().map(c => ({ ...c, itens: this.itensPorContrato().get(c.id) ?? [] }))
  );

  private encerrarListeners: Unsubscribe[] = [];

  // Empresa da sessão. Todo caminho do Firestore nasce daqui: as coleções de
  // negócio vivem em empresasClientes/{empresaId}/..., e é assim que um
  // cliente não enxerga o outro (as rules conferem o mesmo id no token).
  private empresaId = '';
  // Id do cadastro (usuarios/{id}) da sessão; é o que vai em lidaPor.
  private usuarioAtualId = '';

  col(nome: string): CollectionReference {
    return collection(db, 'empresasClientes', this.empresaId, nome);
  }

  docRef(nome: string, id: string): DocumentReference {
    return doc(db, 'empresasClientes', this.empresaId, nome, id);
  }

  private itensDe(contratoId: string): CollectionReference {
    return collection(db, 'empresasClientes', this.empresaId, 'contratos', contratoId, 'itens');
  }

  /**
   * Abre os listeners que a sessão tem permissão de ler, espelhando
   * firestore.rules. Um listener aberto pra quem a regra nega morre com
   * permission-denied e não volta mais, então o serviço nem tenta. E onde a
   * regra filtra por campo (unidade do cliente, empresa da contratada), a
   * consulta leva o mesmo `where` — sem ele a leitura é negada inteira.
   */
  iniciar(sessao: Usuario): void {
    this.parar();
    this.empresaId = sessao.empresaId ?? '';
    this.usuarioAtualId = sessao.id;
    const perfil = sessao.perfil;
    const gestor = perfil === 'gestor';
    const cliente = perfil === 'cliente';
    const daContratada = perfil === 'gestor_contratado' || perfil === 'tecnico';

    const ligar = (encerrar: Unsubscribe) => this.encerrarListeners.push(encerrar);
    const ouvir = <T>(nome: string, alvo: WritableSignal<T[]>, consulta?: ReturnType<typeof query>) =>
      ligar(onSnapshot(consulta ?? this.col(nome), snap => alvo.set(snap.docs.map(d => d.data() as T)), erroDeLeitura(nome)));

    ouvir('unidades', this.unidadesSig);
    ouvir('blocos', this.blocosSig);
    ouvir('salas', this.salasSig);
    ouvir('equipamentos', this.equipamentosSig);
    // Cadastro completo (com e-mail) só pro gestor; os demais leem o espelho
    // público, sem e-mail. Se o gestor perceber cadastro sem cópia pública
    // (dados anteriores ao espelho), pede ao backend pra reconstruir.
    if (gestor) {
      let totalCadastros = -1;
      let totalPublicos = -1;
      let reconstruiu = false;
      const conferirEspelho = () => {
        if (reconstruiu || totalCadastros < 0 || totalPublicos < 0 || totalCadastros <= totalPublicos) return;
        reconstruiu = true;
        httpsCallable(functions, 'reconstruirUsuariosPublicos')().catch(erroDeLeitura('usuariosPublicos'));
      };
      ligar(onSnapshot(this.col('usuarios'), snap => {
        this.usuariosSig.set(snap.docs.map(d => d.data() as Usuario));
        totalCadastros = snap.size;
        conferirEspelho();
      }, erroDeLeitura('usuarios')));
      ligar(onSnapshot(this.col('usuariosPublicos'), snap => {
        totalPublicos = snap.size;
        conferirEspelho();
      }, erroDeLeitura('usuariosPublicos')));
    } else {
      ouvir('usuariosPublicos', this.usuariosSig);
    }
    ouvir('empresasContratadas', this.empresasContratadasSig);

    ouvir('chamados', this.chamadosSig,
      cliente ? query(this.col('chamados'), where('unidadeId', '==', sessao.unidadeId ?? '')) : undefined);

    ouvir('ordensServico', this.ordensServicoSig,
      cliente ? query(this.col('ordensServico'), where('unidadeId', '==', sessao.unidadeId ?? ''))
      : daContratada ? query(this.col('ordensServico'), where('empresaContratadaId', '==', sessao.empresaContratadaId ?? ''))
      : undefined);

    if (gestor) ouvir('planosManutencao', this.planosManutencaoSig);

    // Notificações: as endereçadas a mim e as do meu perfil (a contratada
    // só vê as da própria contratada). As rules exigem exatamente estes
    // filtros; sem eles a consulta é negada inteira.
    if (sessao.id) {
      ouvir('notificacoes', this.notificacoesPessoais,
        query(this.col('notificacoes'), where('paraUsuarioId', '==', sessao.id), orderBy('data', 'desc'), limit(50)));
    }
    if (['cliente', 'gestor', 'gestor_contratado', 'tecnico'].includes(perfil)) {
      const filtros = [where('paraPerfil', '==', perfil)];
      if (daContratada) filtros.push(where('empresaContratadaId', '==', sessao.empresaContratadaId ?? ''));
      ouvir('notificacoes', this.notificacoesPerfil,
        query(this.col('notificacoes'), ...filtros, orderBy('data', 'desc'), limit(50)));
    }

    if (gestor) {
      ligar(onSnapshot(this.docRef('operacao', 'preventiva'), snap => {
        this.operacaoPreventiva.set(snap.exists() ? (snap.data() as OperacaoPreventiva) : null);
      }, erroDeLeitura('operacao/preventiva')));
    }

    // Gestor contratado e técnico leem contratos, itens e orçamentos da
    // própria contratada: o técnico precisa deles pra montar o orçamento.
    if (gestor || daContratada) {
      ouvir('orcamentos', this.orcamentosSig,
        daContratada ? query(this.col('orcamentos'), where('empresaContratadaId', '==', sessao.empresaContratadaId ?? '')) : undefined);

      ligar(onSnapshot(
        daContratada ? query(this.col('contratos'), where('empresaContratadaId', '==', sessao.empresaContratadaId ?? '')) : this.col('contratos'),
        snap => {
          this.contratosCabecalho.set(snap.docs.map(d => d.data() as Omit<Contrato, 'itens'>));
          // A contratada lê os itens contrato a contrato (a regra confere o
          // dono pelo cabeçalho); o gestor usa uma consulta só, abaixo.
          if (daContratada) this.ouvirItensPorContrato(snap.docs.map(d => d.id));
        },
        erroDeLeitura('contratos')
      ));

      if (gestor) {
        ligar(onSnapshot(query(collectionGroup(db, 'itens'), where('empresaId', '==', this.empresaId)), snap => {
          const mapa = new Map<string, ItemContrato[]>();
          for (const itemDoc of snap.docs) {
            const contratoId = itemDoc.ref.parent.parent?.id;
            if (!contratoId) continue;
            const lista = mapa.get(contratoId) ?? [];
            lista.push(itemDoc.data() as ItemContrato);
            mapa.set(contratoId, lista);
          }
          this.itensPorContrato.set(mapa);
        }, erroDeLeitura('itens')));
      }
    }

    if (gestor) {
      ligar(onSnapshot(query(this.col('logs'), orderBy('data', 'desc'), limit(500)), snap => {
        this.logs.set(snap.docs.map(d => d.data() as LogEntrada));
      }, erroDeLeitura('logs')));
    }
  }

  // Um listener por contrato, aberto e fechado conforme a lista de contratos
  // da contratada muda.
  private itensListeners = new Map<string, Unsubscribe>();

  private ouvirItensPorContrato(contratoIds: string[]): void {
    for (const [id, encerrar] of this.itensListeners) {
      if (!contratoIds.includes(id)) {
        encerrar();
        this.itensListeners.delete(id);
        this.itensPorContrato.update(m => { const c = new Map(m); c.delete(id); return c; });
      }
    }
    for (const id of contratoIds) {
      if (this.itensListeners.has(id)) continue;
      this.itensListeners.set(id, onSnapshot(this.itensDe(id), snap => {
        this.itensPorContrato.update(m => new Map(m).set(id, snap.docs.map(d => d.data() as ItemContrato)));
      }, erroDeLeitura(`contratos/${id}/itens`)));
    }
  }

  /** Fecha os listeners e esvazia tudo: nada de dados de uma sessão vazando pra próxima. */
  parar(): void {
    for (const encerrar of this.encerrarListeners) encerrar();
    this.encerrarListeners = [];
    for (const encerrar of this.itensListeners.values()) encerrar();
    this.itensListeners.clear();
    this.empresaId = '';

    for (const sig of [
      this.unidadesSig, this.blocosSig, this.salasSig, this.equipamentosSig, this.chamadosSig,
      this.ordensServicoSig, this.orcamentosSig, this.usuariosSig, this.planosManutencaoSig, this.empresasContratadasSig,
      this.logs, this.contratosCabecalho, this.notificacoesPessoais, this.notificacoesPerfil
    ]) {
      (sig as WritableSignal<unknown[]>).set([]);
    }
    this.itensPorContrato.set(new Map());
  }

  // ---------- Leituras auxiliares (iguais ao mock: .find()/.filter()) ----------

  getUnidadeById(id: string): Unidade | undefined {
    return this.unidades().find(u => u.id === id);
  }

  getBlocoById(id: string): Bloco | undefined {
    return this.blocos().find(b => b.id === id);
  }

  getBlocosByUnidade(unidadeId: string): Bloco[] {
    return this.blocos().filter(b => b.unidadeId === unidadeId);
  }

  getSalaById(id: string): Sala | undefined {
    return this.salas().find(s => s.id === id);
  }

  getSalasByUnidade(unidadeId: string): Sala[] {
    return this.salas().filter(s => s.unidadeId === unidadeId && !s.blocoId);
  }

  getSalasByBloco(blocoId: string): Sala[] {
    return this.salas().filter(s => s.blocoId === blocoId);
  }

  getEquipamentoById(id: string): Equipamento | undefined {
    return this.equipamentos().find(e => e.id === id);
  }

  getEquipamentosBySala(salaId: string): Equipamento[] {
    return this.equipamentos().filter(e => e.salaId === salaId);
  }

  getUsuarioById(id: string): Usuario | undefined {
    return this.usuarios().find(u => u.id === id);
  }

  getContratoById(id: string): Contrato | undefined {
    return this.contratos().find(c => c.id === id);
  }

  getChamadoById(id: string): Chamado | undefined {
    return this.chamados().find(c => c.id === id);
  }

  getOSById(id: string): OrdemServico | undefined {
    return this.ordensServico().find(o => o.id === id);
  }

  getOrcamentoById(id: string): Orcamento | undefined {
    return this.orcamentos().find(o => o.id === id);
  }

  // Uma OS pode acumular orçamentos (rejeitado, substituído, novo). O que
  // vale é o que a OS aponta em `orcamentoId`; a busca por `osId` fica só
  // como reserva pra OS antiga que não tem o campo.
  getOrcamentoByOS(osId: string): Orcamento | undefined {
    const os = this.getOSById(osId);
    if (os?.orcamentoId) {
      const atual = this.getOrcamentoById(os.orcamentoId);
      if (atual) return atual;
    }
    const daOS = this.orcamentos().filter(o => o.osId === osId);
    return daOS.find(o => o.situacao === 'Pendente') ?? daOS.find(o => o.situacao === 'Aprovado') ?? daOS[0];
  }

  // ---------- CRUD simples: escrita direta no Firestore (rules permitem) ----------

  salvarUnidade(dados: Omit<Unidade, 'id'> & { id?: string }): void {
    const ref = dados.id ? this.docRef('unidades', dados.id) : doc(this.col('unidades'));
    const edicao = !!dados.id;
    setDoc(ref, { id: ref.id, nome: dados.nome, sigla: dados.sigla });
    this.log.registrar({
      alvo: 'unidade',
      operacao: edicao ? 'editar' : 'criar',
      descricao: `${edicao ? 'Editou' : 'Criou'} a unidade ${dados.nome}`,
      alvoId: ref.id,
      alvoRotulo: dados.nome,
      detalhes: { nome: dados.nome, sigla: dados.sigla }
    });
  }

  async excluirUnidade(id: string): Promise<void> {
    const unidade = this.getUnidadeById(id);
    const batch = writeBatch(db);
    batch.delete(this.docRef('unidades', id));
    const blocos = this.blocos().filter(b => b.unidadeId === id);
    const salas = this.salas().filter(s => s.unidadeId === id);
    const equipamentos = this.equipamentos().filter(e => e.unidadeId === id);
    blocos.forEach(b => batch.delete(this.docRef('blocos', b.id)));
    salas.forEach(s => batch.delete(this.docRef('salas', s.id)));
    equipamentos.forEach(e => batch.delete(this.docRef('equipamentos', e.id)));
    await batch.commit();
    this.log.registrar({
      alvo: 'unidade',
      operacao: 'excluir',
      descricao: `Excluiu a unidade ${unidade?.nome ?? id}`,
      alvoId: id,
      alvoRotulo: unidade?.nome ?? id,
      // A exclusão arrasta a estrutura junto; sem isso o log não explicaria
      // por que blocos e salas sumiram.
      detalhes: { blocosRemovidos: blocos.length, salasRemovidas: salas.length, equipamentosRemovidos: equipamentos.length }
    });
  }

  salvarBloco(dados: Omit<Bloco, 'id'> & { id?: string }): void {
    const ref = dados.id ? this.docRef('blocos', dados.id) : doc(this.col('blocos'));
    const edicao = !!dados.id;
    setDoc(ref, { id: ref.id, unidadeId: dados.unidadeId, nome: dados.nome });
    this.log.registrar({
      alvo: 'bloco',
      operacao: edicao ? 'editar' : 'criar',
      descricao: `${edicao ? 'Editou' : 'Criou'} o bloco ${dados.nome}`,
      alvoId: ref.id,
      alvoRotulo: dados.nome,
      detalhes: { unidade: this.getUnidadeById(dados.unidadeId)?.nome ?? dados.unidadeId }
    });
  }

  async excluirBloco(id: string): Promise<void> {
    const bloco = this.getBlocoById(id);
    const batch = writeBatch(db);
    batch.delete(this.docRef('blocos', id));
    // Salas do bloco viram salas soltas da unidade em vez de sumir junto —
    // e os equipamentos delas seguem o mesmo raciocínio (igual ao mock).
    this.salas().filter(s => s.blocoId === id).forEach(s => batch.update(this.docRef('salas', s.id), { blocoId: null }));
    this.equipamentos().filter(e => e.blocoId === id).forEach(e => batch.update(this.docRef('equipamentos', e.id), { blocoId: null }));
    await batch.commit();
    this.log.registrar({
      alvo: 'bloco',
      operacao: 'excluir',
      descricao: `Excluiu o bloco ${bloco?.nome ?? id}`,
      alvoId: id,
      alvoRotulo: bloco?.nome ?? id
    });
  }

  salvarSala(dados: Omit<Sala, 'id'> & { id?: string }): void {
    const ref = dados.id ? this.docRef('salas', dados.id) : doc(this.col('salas'));
    const corpo: Sala = { id: ref.id, unidadeId: dados.unidadeId, nome: dados.nome };
    if (dados.blocoId) corpo.blocoId = dados.blocoId;
    setDoc(ref, corpo);
    const edicao = !!dados.id;
    this.log.registrar({
      alvo: 'sala',
      operacao: edicao ? 'editar' : 'criar',
      descricao: `${edicao ? 'Editou' : 'Criou'} a sala ${dados.nome}`,
      alvoId: ref.id,
      alvoRotulo: dados.nome,
      detalhes: { unidade: this.getUnidadeById(dados.unidadeId)?.nome ?? dados.unidadeId }
    });
  }

  async excluirSala(id: string): Promise<void> {
    const sala = this.getSalaById(id);
    const batch = writeBatch(db);
    batch.delete(this.docRef('salas', id));
    const equipamentos = this.equipamentos().filter(e => e.salaId === id);
    equipamentos.forEach(e => batch.delete(this.docRef('equipamentos', e.id)));
    await batch.commit();
    this.log.registrar({
      alvo: 'sala',
      operacao: 'excluir',
      descricao: `Excluiu a sala ${sala?.nome ?? id}`,
      alvoId: id,
      alvoRotulo: sala?.nome ?? id,
      detalhes: { equipamentosRemovidos: equipamentos.length }
    });
  }

  salvarEquipamento(dados: Omit<Equipamento, 'id'> & { id?: string }): void {
    const ref = dados.id ? this.docRef('equipamentos', dados.id) : doc(this.col('equipamentos'));
    const corpo: Equipamento = { id: ref.id, unidadeId: dados.unidadeId, salaId: dados.salaId, nome: dados.nome };
    if (dados.blocoId) corpo.blocoId = dados.blocoId;
    if (dados.patrimonio) corpo.patrimonio = dados.patrimonio;
    setDoc(ref, corpo);
    const edicao = !!dados.id;
    this.log.registrar({
      alvo: 'equipamento',
      operacao: edicao ? 'editar' : 'criar',
      descricao: `${edicao ? 'Editou' : 'Criou'} o equipamento ${dados.nome}`,
      alvoId: ref.id,
      alvoRotulo: dados.nome,
      detalhes: { sala: this.getSalaById(dados.salaId)?.nome ?? dados.salaId, patrimonio: dados.patrimonio ?? null }
    });
  }

  excluirEquipamento(id: string): void {
    const equipamento = this.getEquipamentoById(id);
    deleteDoc(this.docRef('equipamentos', id));
    this.log.registrar({
      alvo: 'equipamento',
      operacao: 'excluir',
      descricao: `Excluiu o equipamento ${equipamento?.nome ?? id}`,
      alvoId: id,
      alvoRotulo: equipamento?.nome ?? id
    });
  }

  // Sem gestor ninguém mais entra na tela de usuários — a empresa ficaria
  // trancada por fora. Vale pra rebaixar e pra excluir.
  private garantirOutroGestor(usuarioId: string): void {
    const outros = this.usuarios().filter(u => u.perfil === 'gestor' && u.id !== usuarioId);
    if (outros.length === 0) {
      throw new Error('Este é o único gestor da empresa. Cadastre outro gestor antes de alterar ou excluir este.');
    }
  }

  getEmpresaContratadaById(id: string | undefined): EmpresaContratada | undefined {
    return id ? this.empresasContratadas().find(e => e.id === id) : undefined;
  }

  salvarEmpresaContratada(dados: Omit<EmpresaContratada, 'id'> & { id?: string }): void {
    const ref = dados.id ? this.docRef('empresasContratadas', dados.id) : doc(this.col('empresasContratadas'));
    const corpo: EmpresaContratada = { id: ref.id, nome: dados.nome };
    if (dados.cnpj) corpo.cnpj = dados.cnpj;
    if (dados.contato) corpo.contato = dados.contato;
    setDoc(ref, corpo);
    this.log.registrar({
      alvo: 'empresaContratada',
      operacao: dados.id ? 'editar' : 'criar',
      descricao: `${dados.id ? 'Editou' : 'Cadastrou'} a empresa contratada ${dados.nome}`,
      alvoId: ref.id,
      alvoRotulo: dados.nome
    });
  }

  excluirEmpresaContratada(id: string): void {
    const empresa = this.getEmpresaContratadaById(id);
    const emUso = this.usuarios().some(u => u.empresaContratadaId === id) || this.contratos().some(c => c.empresaContratadaId === id);
    if (emUso) {
      throw new Error(`${empresa?.nome ?? 'Esta empresa'} tem usuários ou contratos vinculados e não pode ser excluída.`);
    }
    deleteDoc(this.docRef('empresasContratadas', id));
    this.log.registrar({
      alvo: 'empresaContratada',
      operacao: 'excluir',
      descricao: `Excluiu a empresa contratada ${empresa?.nome ?? id}`,
      alvoId: id,
      alvoRotulo: empresa?.nome ?? id
    });
  }

  salvarUsuario(dados: Omit<Usuario, 'id'> & { id?: string }): void {
    if (dados.id && dados.perfil !== 'gestor' && this.getUsuarioById(dados.id)?.perfil === 'gestor') {
      this.garantirOutroGestor(dados.id);
    }
    const ref = dados.id ? this.docRef('usuarios', dados.id) : doc(this.col('usuarios'));
    const corpo: Usuario = { id: ref.id, nome: dados.nome, email: dados.email, perfil: dados.perfil };
    if (dados.unidadeId) corpo.unidadeId = dados.unidadeId;
    if (dados.empresaContratadaId) corpo.empresaContratadaId = dados.empresaContratadaId;
    setDoc(ref, corpo);
    const anterior = dados.id ? this.getUsuarioById(dados.id) : undefined;
    this.log.registrar({
      alvo: 'usuario',
      operacao: dados.id ? 'editar' : 'criar',
      descricao: `${dados.id ? 'Editou' : 'Criou'} o usuário ${dados.nome}`,
      alvoId: ref.id,
      alvoRotulo: dados.nome,
      // Mudança de perfil é a alteração sensível deste cadastro, então o
      // antes/depois fica explícito.
      detalhes: anterior && anterior.perfil !== dados.perfil
        ? { perfilAnterior: anterior.perfil, perfilNovo: dados.perfil, email: dados.email }
        : { perfil: dados.perfil, email: dados.email }
    });
  }

  excluirUsuario(id: string): void {
    const usuario = this.getUsuarioById(id);
    if (usuario?.perfil === 'gestor') this.garantirOutroGestor(id);
    deleteDoc(this.docRef('usuarios', id));
    this.log.registrar({
      alvo: 'usuario',
      operacao: 'excluir',
      descricao: `Excluiu o usuário ${usuario?.nome ?? id}`,
      alvoId: id,
      alvoRotulo: usuario?.nome ?? id,
      detalhes: { email: usuario?.email ?? null, perfil: usuario?.perfil ?? null }
    });
  }

  getPlanoById(id: string): PlanoManutencao | undefined {
    return this.planosManutencao().find(p => p.id === id);
  }

  getPlanosPorEquipamento(equipamentoId: string): PlanoManutencao[] {
    return this.planosManutencao().filter(p => p.equipamentoId === equipamentoId);
  }

  salvarPlanoManutencao(dados: Omit<PlanoManutencao, 'id'> & { id?: string }): void {
    const ref = dados.id ? this.docRef('planosManutencao', dados.id) : doc(this.col('planosManutencao'));
    const corpo: PlanoManutencao = {
      id: ref.id,
      nome: dados.nome,
      equipamentoId: dados.equipamentoId,
      periodicidadeDias: dados.periodicidadeDias,
      proximaExecucao: dados.proximaExecucao,
      antecedenciaDias: dados.antecedenciaDias,
      ativo: dados.ativo
    };
    if (dados.ultimaExecucao) corpo.ultimaExecucao = dados.ultimaExecucao;
    if (dados.contratoId) corpo.contratoId = dados.contratoId;
    if (dados.itemContratoId) corpo.itemContratoId = dados.itemContratoId;
    if (dados.quantidadePrevista) corpo.quantidadePrevista = dados.quantidadePrevista;

    setDoc(ref, corpo);

    const equipamento = this.getEquipamentoById(dados.equipamentoId);
    this.log.registrar({
      alvo: 'planoManutencao',
      operacao: dados.id ? 'editar' : 'criar',
      descricao: `${dados.id ? 'Editou' : 'Criou'} o plano preventivo "${dados.nome}" (${equipamento?.nome ?? dados.equipamentoId})`,
      alvoId: ref.id,
      alvoRotulo: dados.nome,
      detalhes: {
        equipamento: equipamento?.nome ?? dados.equipamentoId,
        periodicidadeDias: dados.periodicidadeDias,
        proximaExecucao: dados.proximaExecucao,
        ativo: dados.ativo
      }
    });
  }

  excluirPlanoManutencao(id: string): void {
    const plano = this.getPlanoById(id);
    deleteDoc(this.docRef('planosManutencao', id));
    this.log.registrar({
      alvo: 'planoManutencao',
      operacao: 'excluir',
      descricao: `Excluiu o plano preventivo "${plano?.nome ?? id}"`,
      alvoId: id,
      alvoRotulo: plano?.nome ?? id
    });
  }

  /**
   * Dispara a geração de chamados preventivos na hora, em vez de esperar a
   * execução diária. A função é a mesma do agendamento, então rodar aqui não
   * duplica nada: o chamado tem id determinístico por plano e data.
   */
  async rodarPreventivaAgora(): Promise<{ gerados: number; duplicados: number; ignorados: number }> {
    const rodar = httpsCallable<void, { gerados: number; duplicados: number; ignorados: number }>(functions, 'rodarPreventivaAgora');
    const res = await rodar();
    this.feedback.announce(`Preventiva: ${res.data.gerados} chamado(s) gerado(s).`);
    return res.data;
  }

  async criarContrato(cabecalho: Omit<Contrato, 'id' | 'itens'>, itens: ItemContrato[]): Promise<void> {
    const contratoRef = doc(this.col('contratos'));
    const batch = writeBatch(db);
    batch.set(contratoRef, { id: contratoRef.id, ...cabecalho });

    for (const item of itens) {
      const itemRef = doc(this.itensDe(contratoRef.id));
      batch.set(itemRef, {
        id: itemRef.id,
        empresaId: this.empresaId,
        nome: item.nome,
        unidadeMedida: item.unidadeMedida,
        quantidadeContratada: item.quantidadeContratada,
        quantidadeDisponivel: item.quantidadeContratada,
        quantidadeReservada: 0,
        quantidadeConsumida: 0,
        precoUnitario: item.precoUnitario
      });
    }

    await batch.commit();
    this.feedback.announce(`Contrato ${cabecalho.numero} criado com sucesso.`);
    this.log.registrar({
      alvo: 'contrato',
      operacao: 'criar',
      descricao: `Criou o contrato ${cabecalho.numero} (${cabecalho.fornecedor})`,
      alvoId: contratoRef.id,
      alvoRotulo: cabecalho.numero,
      detalhes: { fornecedor: cabecalho.fornecedor, itens: itens.length }
    });
  }

  /**
   * Cria ou edita um item do contrato.
   *
   * Na edição só nome, unidade e preço são livres. Quantidade contratada e
   * os três campos de saldo (reservada, consumida, disponível) são travados
   * pelas rules: o saldo muda nas Cloud Functions de OS, e a quantidade só
   * por aditivo (`aditivarContrato`). Por isso a quantidade que vier em
   * `dados` é ignorada quando o item já existe.
   */
  async salvarItemContrato(contrato: Contrato, dados: Omit<ItemContrato, 'id'> & { id?: string }): Promise<void> {
    const existente = dados.id ? contrato.itens.find(i => i.id === dados.id) : undefined;

    if (existente) {
      const campos = {
        nome: dados.nome,
        unidadeMedida: dados.unidadeMedida,
        precoUnitario: dados.precoUnitario
      };

      await updateDoc(doc(this.itensDe(contrato.id), existente.id), campos);

      this.log.registrar({
        alvo: 'itemContrato',
        operacao: 'editar',
        descricao: `Editou o item "${dados.nome}" do contrato ${contrato.numero}`,
        alvoId: existente.id,
        alvoRotulo: dados.nome,
        alvoPaiId: contrato.id,
        detalhes: {
          contrato: contrato.numero,
          ...this.diferencas(
            { nome: existente.nome, unidadeMedida: existente.unidadeMedida, precoUnitario: existente.precoUnitario },
            { nome: dados.nome, unidadeMedida: dados.unidadeMedida, precoUnitario: dados.precoUnitario }
          )
        }
      });
      return;
    }

    const ref = doc(this.itensDe(contrato.id));
    await setDoc(ref, {
      id: ref.id,
      empresaId: this.empresaId,
      nome: dados.nome,
      unidadeMedida: dados.unidadeMedida,
      quantidadeContratada: dados.quantidadeContratada,
      quantidadeDisponivel: dados.quantidadeContratada,
      quantidadeReservada: 0,
      quantidadeConsumida: 0,
      precoUnitario: dados.precoUnitario
    });

    this.log.registrar({
      alvo: 'itemContrato',
      operacao: 'criar',
      descricao: `Adicionou o item "${dados.nome}" ao contrato ${contrato.numero}`,
      alvoId: ref.id,
      alvoRotulo: dados.nome,
      alvoPaiId: contrato.id,
      detalhes: { contrato: contrato.numero, quantidade: dados.quantidadeContratada, precoUnitario: dados.precoUnitario }
    });
  }

  async excluirItemContrato(contrato: Contrato, item: ItemContrato): Promise<void> {
    // Apagar um item que já tem saldo comprometido deixaria OS e orçamentos
    // apontando pra um item inexistente.
    if (item.quantidadeReservada > 0 || item.quantidadeConsumida > 0) {
      throw new Error(
        `"${item.nome}" não pode ser excluído: há ${item.quantidadeReservada} reservada(s) e ${item.quantidadeConsumida} consumida(s).`
      );
    }

    await deleteDoc(doc(this.itensDe(contrato.id), item.id));
    this.log.registrar({
      alvo: 'itemContrato',
      operacao: 'excluir',
      descricao: `Removeu o item "${item.nome}" do contrato ${contrato.numero}`,
      alvoId: item.id,
      alvoRotulo: item.nome,
      alvoPaiId: contrato.id,
      detalhes: { contrato: contrato.numero, quantidade: item.quantidadeContratada }
    });
  }

  // Só o que realmente mudou entra no log — despejar o objeto inteiro faria
  // o histórico virar ruído.
  private diferencas(antes: Record<string, unknown>, depois: Record<string, unknown>): Record<string, unknown> {
    const mudancas: Record<string, unknown> = {};
    for (const chave of Object.keys(depois)) {
      if (antes[chave] !== depois[chave]) {
        mudancas[chave] = { de: antes[chave], para: depois[chave] };
      }
    }
    return mudancas;
  }

  // ---------- Ações de workflow: Cloud Functions (máquina de estado) ----------

  async adicionarChamado(dados: Omit<Chamado, 'id' | 'numero' | 'dataCriacao' | 'status'> & { foto?: string }): Promise<void> {
    const criarChamado = httpsCallable<typeof dados, { id: string; numero: string }>(functions, 'criarChamado');
    const res = await criarChamado(dados);
    this.feedback.announce(`Chamado ${res.data.numero} criado com sucesso.`);
  }

  async cancelarChamado(chamadoId: string, motivo?: string): Promise<void> {
    const cancelar = httpsCallable<{ chamadoId: string; motivo?: string }, { ok: true }>(functions, 'cancelarChamado');
    await cancelar({ chamadoId, motivo });
    this.feedback.announce('Chamado cancelado.');
  }

  async reabrirChamado(chamadoId: string, motivo?: string): Promise<void> {
    const reabrir = httpsCallable<{ chamadoId: string; motivo?: string }, { ok: true }>(functions, 'reabrirChamado');
    await reabrir({ chamadoId, motivo });
    this.feedback.announce('Chamado reaberto.');
  }

  async adicionarOS(dados: { chamadoId: string; contratoId: string; tecnicoId?: string }): Promise<void> {
    const criarOS = httpsCallable<typeof dados, { id: string; numero: string }>(functions, 'criarOS');
    const res = await criarOS(dados);
    this.feedback.announce(`Ordem de serviço ${res.data.numero} criada com sucesso.`);
  }

  async criarOrcamento(osId: string, itens: OrcamentoPedidoItem[]): Promise<void> {
    const criarOrcamento = httpsCallable<{ osId: string; itens: OrcamentoPedidoItem[] }, { id: string }>(functions, 'criarOrcamento');
    await criarOrcamento({ osId, itens });
    this.feedback.announce('Orçamento criado com sucesso.');
  }

  // Importação de contratos por CSV: valida no backend (formato, contrato
  // duplicado, fornecedor sem cadastro) e só depois grava.
  async validarImportacaoContratos(csv: string): Promise<{
    totalLinhas: number;
    contratos: number;
    erros: { linha: number; mensagem: string }[];
    contratosExistentes: string[];
    fornecedoresSemCadastro: string[];
    valido: boolean;
  }> {
    const validar = httpsCallable<{ csv: string }, Awaited<ReturnType<DataService['validarImportacaoContratos']>>>(functions, 'validarImportacaoContratos');
    return (await validar({ csv })).data;
  }

  async importarContratos(csv: string): Promise<{ contratosCriados: number; itensCriados: number }> {
    const importar = httpsCallable<{ csv: string }, { contratosCriados: number; itensCriados: number }>(functions, 'importarContratos');
    const res = await importar({ csv });
    this.feedback.announce(`${res.data.contratosCriados} contrato(s) importado(s).`);
    return res.data;
  }

  /**
   * Aditivo de contrato: muda quantidade contratada e/ou estende a vigência.
   * É Cloud Function porque as rules travam esses campos pro app — a função
   * confere o saldo, move o disponível junto e grava o aditivo com o log.
   */
  async aditivarContrato(dados: {
    contratoId: string;
    motivo: string;
    novaVigenciaFim?: string;
    itens?: { itemContratoId: string; novaQuantidadeContratada: number }[];
  }): Promise<number> {
    const aditivar = httpsCallable<typeof dados, { numero: number }>(functions, 'aditivarContrato');
    const res = await aditivar(dados);
    this.feedback.announce(`Aditivo nº ${res.data.numero} registrado.`);
    return res.data.numero;
  }

  async aprovarOrcamento(orcamentoId: string, ajustes?: { itemContratoId: string; quantidade: number }[], observacao?: string): Promise<void> {
    const aprovar = httpsCallable<{ orcamentoId: string; ajustes?: { itemContratoId: string; quantidade: number }[]; observacao?: string }, { ok: true }>(functions, 'aprovarOrcamento');
    await aprovar({ orcamentoId, ...(ajustes?.length ? { ajustes } : {}), ...(observacao ? { observacao } : {}) });
    this.feedback.announce(ajustes?.length ? 'Orçamento aprovado com ajustes.' : 'Orçamento aprovado.');
  }

  async rejeitarOrcamento(orcamentoId: string): Promise<void> {
    const rejeitar = httpsCallable<{ orcamentoId: string }, { ok: true }>(functions, 'rejeitarOrcamento');
    await rejeitar({ orcamentoId });
    this.feedback.announce('Orçamento rejeitado.');
  }

  async executarOS(osId: string, itens?: { itemContratoId: string; quantidadeExecutada: number }[], observacao?: string): Promise<void> {
    const executar = httpsCallable<{ osId: string; itens?: { itemContratoId: string; quantidadeExecutada: number }[]; observacao?: string }, { ok: true }>(functions, 'executarOS');
    await executar({ osId, ...(itens ? { itens } : {}), ...(observacao ? { observacao } : {}) });
    this.feedback.announce('Ordem de serviço marcada como executada.');
  }

  async encerrarChamado(chamadoId: string): Promise<void> {
    const encerrar = httpsCallable<{ chamadoId: string }, { ok: true }>(functions, 'encerrarChamado');
    await encerrar({ chamadoId });
    this.feedback.announce('Chamado encerrado.');
  }

  async atribuirTecnicoOS(osId: string, tecnicoId: string | null): Promise<void> {
    const atribuir = httpsCallable<{ osId: string; tecnicoId: string | null }, { ok: true }>(functions, 'atribuirTecnicoOS');
    await atribuir({ osId, tecnicoId });
    this.feedback.announce(tecnicoId ? 'Técnico designado.' : 'Técnico removido da OS.');
  }

  async encerrarContrato(contratoId: string, motivo: string): Promise<{ disponivelZerado: number; osCanceladas: string[] }> {
    const encerrar = httpsCallable<{ contratoId: string; motivo: string }, { disponivelZerado: number; osCanceladas: string[] }>(functions, 'encerrarContrato');
    const r = await encerrar({ contratoId, motivo });
    this.feedback.announce('Contrato encerrado.');
    return r.data;
  }

  // Marca como lida acrescentando o próprio id em `lidaPor` (única escrita
  // que as rules deixam em notificacoes).
  async marcarNotificacaoLida(notificacaoId: string): Promise<void> {
    const meuId = this.usuarioAtualId;
    if (!meuId) return;
    try {
      await updateDoc(this.docRef('notificacoes', notificacaoId), { lidaPor: arrayUnion(meuId) });
    } catch (e) {
      erroDeLeitura('notificacoes')(e as Error);
    }
  }

  async atribuirResponsavelChamado(chamadoId: string, gestorId: string | undefined): Promise<void> {
    const atribuir = httpsCallable<{ chamadoId: string; gestorId: string | null }, { ok: true }>(functions, 'atribuirResponsavelChamado');
    await atribuir({ chamadoId, gestorId: gestorId ?? null });
  }
}
