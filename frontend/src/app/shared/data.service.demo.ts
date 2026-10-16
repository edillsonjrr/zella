import { plural, rotuloOS } from '../../../../shared/historico';
import { Injectable, Signal, computed, inject, signal } from '@angular/core';
import type { AditivoContrato, Unidade, Bloco, Sala, Equipamento, Contrato, ItemContrato, Chamado, OrdemServico, Orcamento, OrcamentoPedidoItem, ItemForaContratoPedido, Usuario, LogEntrada, PlanoManutencao, EmpresaContratada, Notificacao, OperacaoPreventiva, PreferenciasUsuario, UrgenciaChamado, QrAlvoTipo } from './models';
import { UiFeedbackService } from './ui-feedback.service';
import { banco } from '../demo/banco';
import * as fluxo from '../demo/fluxo';
import { reduzirFotoDemo } from '../demo/imagem';
import type { Ator, DadosDemo } from '../demo/tipos';

/**
 * DataService da demonstração (configuração `demo` do angular.json troca
 * data.service.ts por este arquivo). Mesma interface pública, sem Firebase:
 * os dados vêm do banco em memória (demo/banco.ts), as ações de fluxo rodam
 * as regras das Cloud Functions refeitas em demo/fluxo.ts, e cada perfil
 * enxerga só o que as Security Rules deixariam (mesmos filtros de
 * `iniciar` no serviço de verdade).
 */

// Pausa curta nas ações de fluxo: o botão mostra "Enviando..." como faria
// com a rede, em vez de piscar.
function espera(ms = 300): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

@Injectable({
  providedIn: 'root'
})
export class DataService {
  private readonly feedback = inject(UiFeedbackService);

  // Sessão aberta por `iniciar` (o AuthService chama no login).
  private readonly sessao = signal<Usuario | null>(null);
  private usuarioAtualId = '';
  // Perfil da sessão: decide o que dá para ler (ex.: só a gestão lê o log).
  perfilSessao = '';

  // Os dados da empresa enquanto há sessão. Recalcula a cada gravação no banco.
  private readonly fonte = computed<DadosDemo | null>(() => {
    banco.revisao();
    return this.sessao() ? banco.ler() : null;
  });

  private daContratada(s: Usuario): boolean {
    return s.perfil === 'gestor_contratado' || s.perfil === 'tecnico';
  }

  readonly unidades: Signal<Unidade[]> = computed(() => this.fonte()?.unidades ?? []);
  readonly blocos: Signal<Bloco[]> = computed(() => this.fonte()?.blocos ?? []);
  readonly salas: Signal<Sala[]> = computed(() => this.fonte()?.salas ?? []);
  readonly equipamentos: Signal<Equipamento[]> = computed(() => this.fonte()?.equipamentos ?? []);
  readonly empresasContratadas: Signal<EmpresaContratada[]> = computed(() => this.fonte()?.empresasContratadas ?? []);

  // Cadastro completo (com e-mail) só para o gestor; os demais leem o
  // espelho público, sem e-mail.
  readonly usuarios: Signal<Usuario[]> = computed(() => {
    const d = this.fonte();
    const s = this.sessao();
    if (!d || !s) return [];
    if (s.perfil === 'gestor') return d.usuarios;
    return d.usuarios.map(({ email: _email, ...publico }) => publico as Usuario);
  });

  readonly chamados: Signal<Chamado[]> = computed(() => {
    const d = this.fonte();
    const s = this.sessao();
    if (!d || !s) return [];
    if (s.perfil === 'cliente') return d.chamados.filter(c => c.unidadeId === s.unidadeId);
    // A contratada só vê os chamados que viraram OS num contrato dela, o
    // mesmo recorte da regra do Firestore (campo copiado pela criação da OS).
    if (this.daContratada(s)) return d.chamados.filter(c => !!c.empresaContratadaId && c.empresaContratadaId === s.empresaContratadaId);
    return d.chamados;
  });

  readonly ordensServico: Signal<OrdemServico[]> = computed(() => {
    const d = this.fonte();
    const s = this.sessao();
    if (!d || !s) return [];
    if (s.perfil === 'cliente') return d.ordensServico.filter(o => o.unidadeId === s.unidadeId);
    if (this.daContratada(s)) return d.ordensServico.filter(o => o.empresaContratadaId === s.empresaContratadaId);
    return d.ordensServico;
  });

  readonly orcamentos: Signal<Orcamento[]> = computed(() => {
    const d = this.fonte();
    const s = this.sessao();
    if (!d || !s) return [];
    if (s.perfil === 'gestor') return d.orcamentos;
    if (this.daContratada(s)) return d.orcamentos.filter(o => o.empresaContratadaId === s.empresaContratadaId);
    return [];
  });

  readonly contratos = computed<Contrato[]>(() => {
    const d = this.fonte();
    const s = this.sessao();
    if (!d || !s) return [];
    if (s.perfil === 'gestor') return d.contratos;
    if (this.daContratada(s)) return d.contratos.filter(c => c.empresaContratadaId === s.empresaContratadaId);
    return [];
  });

  readonly planosManutencao: Signal<PlanoManutencao[]> = computed(() =>
    this.sessao()?.perfil === 'gestor' ? (this.fonte()?.planosManutencao ?? []) : []
  );

  // As endereçadas a mim e as do meu perfil (a contratada só vê as da
  // própria contratada), as mais recentes primeiro, até 50 de cada.
  readonly notificacoes = computed<Notificacao[]>(() => {
    const d = this.fonte();
    const s = this.sessao();
    if (!d || !s) return [];
    const recentes = (lista: Notificacao[]) => [...lista].sort((a, b) => b.data.localeCompare(a.data)).slice(0, 50);
    const pessoais = recentes(d.notificacoes.filter(n => n.paraUsuarioId === s.id));
    const doPerfil = recentes(
      d.notificacoes.filter(n => n.paraPerfil === s.perfil && (!this.daContratada(s) || n.empresaContratadaId === s.empresaContratadaId))
    );
    const vistos = new Set<string>();
    return [...pessoais, ...doPerfil].filter(n => !vistos.has(n.id) && vistos.add(n.id));
  });

  // Só a gestão lê o log; as mais recentes ficam em memória, como no real.
  readonly logs: Signal<LogEntrada[]> = computed(() => {
    const d = this.fonte();
    if (!d || this.sessao()?.perfil !== 'gestor') return [];
    return [...d.logs].sort((a, b) => b.data.localeCompare(a.data)).slice(0, 500);
  });

  // `undefined` sem sessão; `null` quando a pessoa não tem preferências.
  readonly preferencias: Signal<PreferenciasUsuario | null | undefined> = computed(() => {
    const d = this.fonte();
    const s = this.sessao();
    if (!d || !s) return undefined;
    return d.preferencias[s.id] ?? null;
  });

  // Monitor da preventiva. Sem agendamento na demonstração: só as execuções
  // feitas pelo botão "Abrir chamados vencendo".
  readonly operacaoPreventiva: Signal<OperacaoPreventiva | null> = computed(() =>
    this.sessao()?.perfil === 'gestor' ? (this.fonte()?.operacaoPreventiva ?? null) : null
  );

  iniciar(sessao: Usuario): void {
    this.sessao.set(sessao);
    this.usuarioAtualId = sessao.id;
    this.perfilSessao = sessao.perfil;
  }

  /** Fecha a sessão: nada de dados de uma sessão vazando pra próxima. */
  parar(): void {
    this.sessao.set(null);
    this.usuarioAtualId = '';
    this.perfilSessao = '';
  }

  // Quem faz a ação: a pessoa da sessão ou, sem sessão, o visitante que
  // escaneou o QR Code.
  private ator(): Ator {
    const s = this.sessao();
    if (!s) return { usuarioId: '', uid: 'visitante-qr', nome: 'Visitante', email: '', perfil: 'convidado' };
    return {
      usuarioId: s.id,
      uid: s.id,
      nome: s.nome,
      email: s.email,
      perfil: s.perfil,
      unidadeId: s.unidadeId,
      empresaContratadaId: s.empresaContratadaId
    };
  }

  // Log das escritas diretas do app (cadastros), como o LogService faz.
  private logar(d: DadosDemo, registro: fluxo.RegistroLog): void {
    fluxo.registrarLog(d, this.ator(), registro, 'app');
  }

  async marcarBoasVindasVistas(): Promise<void> {
    const id = this.usuarioAtualId;
    if (!id) return;
    banco.alterar(d => {
      d.preferencias[id] = { ...(d.preferencias[id] ?? {}), boasVindasEm: new Date().toISOString() };
    });
  }

  async lerAditivos(contratoId: string): Promise<AditivoContrato[]> {
    return banco.ler().aditivos.filter(a => a.contratoId === contratoId);
  }

  // ---------- Leituras auxiliares ----------

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

  getOrcamentoByOS(osId: string): Orcamento | undefined {
    const os = this.getOSById(osId);
    if (os?.orcamentoId) {
      const atual = this.getOrcamentoById(os.orcamentoId);
      if (atual) return atual;
    }
    const daOS = this.orcamentos().filter(o => o.osId === osId);
    return daOS.find(o => o.situacao === 'Pendente') ?? daOS.find(o => o.situacao === 'Aprovado') ?? daOS[0];
  }

  // ---------- Cadastros (no real, escrita direta no Firestore) ----------

  salvarUnidade(dados: Omit<Unidade, 'id'> & { id?: string }): void {
    const id = dados.id ?? fluxo.novoId();
    const edicao = !!dados.id;
    banco.alterar(d => {
      const unidade: Unidade = { id, nome: dados.nome, sigla: dados.sigla };
      substituir(d.unidades, unidade);
      this.logar(d, {
        alvo: 'unidade', operacao: edicao ? 'editar' : 'criar', descricao: `${edicao ? 'Editou' : 'Criou'} a unidade ${dados.nome}`,
        alvoId: id, alvoRotulo: dados.nome, detalhes: { nome: dados.nome, sigla: dados.sigla }
      });
    });
  }

  async excluirUnidade(id: string): Promise<void> {
    banco.alterar(d => {
      const unidade = d.unidades.find(u => u.id === id);
      const blocos = d.blocos.filter(b => b.unidadeId === id).length;
      const salas = d.salas.filter(s => s.unidadeId === id).length;
      const equipamentos = d.equipamentos.filter(e => e.unidadeId === id).length;
      d.unidades = d.unidades.filter(u => u.id !== id);
      d.blocos = d.blocos.filter(b => b.unidadeId !== id);
      d.salas = d.salas.filter(s => s.unidadeId !== id);
      d.equipamentos = d.equipamentos.filter(e => e.unidadeId !== id);
      this.logar(d, {
        alvo: 'unidade', operacao: 'excluir', descricao: `Excluiu a unidade ${unidade?.nome ?? id}`, alvoId: id, alvoRotulo: unidade?.nome ?? id,
        detalhes: { blocosRemovidos: blocos, salasRemovidas: salas, equipamentosRemovidos: equipamentos }
      });
    });
  }

  salvarBloco(dados: Omit<Bloco, 'id'> & { id?: string }): Promise<string> {
    const id = dados.id ?? fluxo.novoId();
    const edicao = !!dados.id;
    banco.alterar(d => {
      substituir(d.blocos, { id, unidadeId: dados.unidadeId, nome: dados.nome });
      this.logar(d, {
        alvo: 'bloco', operacao: edicao ? 'editar' : 'criar', descricao: `${edicao ? 'Editou' : 'Criou'} o bloco ${dados.nome}`,
        alvoId: id, alvoRotulo: dados.nome, detalhes: { unidade: d.unidades.find(u => u.id === dados.unidadeId)?.nome ?? dados.unidadeId }
      });
    });
    return Promise.resolve(id);
  }

  async excluirBloco(id: string): Promise<void> {
    banco.alterar(d => {
      const bloco = d.blocos.find(b => b.id === id);
      d.blocos = d.blocos.filter(b => b.id !== id);
      // Salas e equipamentos do bloco viram soltos na unidade em vez de sumir.
      for (const s of d.salas) if (s.blocoId === id) delete s.blocoId;
      for (const e of d.equipamentos) if (e.blocoId === id) delete e.blocoId;
      this.logar(d, { alvo: 'bloco', operacao: 'excluir', descricao: `Excluiu o bloco ${bloco?.nome ?? id}`, alvoId: id, alvoRotulo: bloco?.nome ?? id });
    });
  }

  salvarSala(dados: Omit<Sala, 'id'> & { id?: string }): Promise<string> {
    const id = dados.id ?? fluxo.novoId();
    const edicao = !!dados.id;
    banco.alterar(d => {
      const sala: Sala = { id, unidadeId: dados.unidadeId, nome: dados.nome };
      if (dados.blocoId) sala.blocoId = dados.blocoId;
      substituir(d.salas, sala);
      this.logar(d, {
        alvo: 'sala', operacao: edicao ? 'editar' : 'criar', descricao: `${edicao ? 'Editou' : 'Criou'} a sala ${dados.nome}`,
        alvoId: id, alvoRotulo: dados.nome, detalhes: { unidade: d.unidades.find(u => u.id === dados.unidadeId)?.nome ?? dados.unidadeId }
      });
    });
    return Promise.resolve(id);
  }

  async excluirSala(id: string): Promise<void> {
    banco.alterar(d => {
      const sala = d.salas.find(s => s.id === id);
      const equipamentos = d.equipamentos.filter(e => e.salaId === id).length;
      d.salas = d.salas.filter(s => s.id !== id);
      d.equipamentos = d.equipamentos.filter(e => e.salaId !== id);
      this.logar(d, {
        alvo: 'sala', operacao: 'excluir', descricao: `Excluiu a sala ${sala?.nome ?? id}`, alvoId: id, alvoRotulo: sala?.nome ?? id,
        detalhes: { equipamentosRemovidos: equipamentos }
      });
    });
  }

  salvarEquipamento(dados: Omit<Equipamento, 'id'> & { id?: string }): Promise<string> {
    const id = dados.id ?? fluxo.novoId();
    const edicao = !!dados.id;
    banco.alterar(d => {
      const anterior = d.equipamentos.find(e => e.id === id);
      const equipamento: Equipamento = { id, unidadeId: dados.unidadeId, salaId: dados.salaId, nome: dados.nome };
      if (dados.blocoId) equipamento.blocoId = dados.blocoId;
      if (dados.patrimonio) equipamento.patrimonio = dados.patrimonio;
      // Formulário sem fabricante e modelo (o da sala) não apaga o que a
      // planilha trouxe; quem manda o campo decide.
      const fabricante = ('fabricante' in dados ? dados.fabricante : anterior?.fabricante)?.trim();
      const modelo = ('modelo' in dados ? dados.modelo : anterior?.modelo)?.trim();
      if (fabricante) equipamento.fabricante = fabricante;
      if (modelo) equipamento.modelo = modelo;
      substituir(d.equipamentos, equipamento);
      this.logar(d, {
        alvo: 'equipamento', operacao: edicao ? 'editar' : 'criar', descricao: `${edicao ? 'Editou' : 'Criou'} o equipamento ${dados.nome}`,
        alvoId: id, alvoRotulo: dados.nome,
        detalhes: { sala: d.salas.find(s => s.id === dados.salaId)?.nome ?? dados.salaId, patrimonio: dados.patrimonio ?? null }
      });
    });
    return Promise.resolve(id);
  }

  excluirEquipamento(id: string): void {
    banco.alterar(d => {
      const equipamento = d.equipamentos.find(e => e.id === id);
      d.equipamentos = d.equipamentos.filter(e => e.id !== id);
      this.logar(d, {
        alvo: 'equipamento', operacao: 'excluir', descricao: `Excluiu o equipamento ${equipamento?.nome ?? id}`,
        alvoId: id, alvoRotulo: equipamento?.nome ?? id
      });
    });
  }

  // Sem gestor ninguém mais entra na tela de usuários.
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
    const id = dados.id ?? fluxo.novoId();
    banco.alterar(d => {
      const empresa: EmpresaContratada = { id, nome: dados.nome };
      if (dados.cnpj) empresa.cnpj = dados.cnpj;
      if (dados.contato) empresa.contato = dados.contato;
      substituir(d.empresasContratadas, empresa);
      this.logar(d, {
        alvo: 'empresaContratada', operacao: dados.id ? 'editar' : 'criar',
        descricao: `${dados.id ? 'Editou' : 'Cadastrou'} a empresa contratada ${dados.nome}`, alvoId: id, alvoRotulo: dados.nome
      });
    });
  }

  excluirEmpresaContratada(id: string): void {
    const empresa = this.getEmpresaContratadaById(id);
    const emUso = this.usuarios().some(u => u.empresaContratadaId === id) || this.contratos().some(c => c.empresaContratadaId === id);
    if (emUso) {
      throw new Error(`${empresa?.nome ?? 'Esta empresa'} tem usuários ou contratos vinculados e não pode ser excluída.`);
    }
    banco.alterar(d => {
      d.empresasContratadas = d.empresasContratadas.filter(e => e.id !== id);
      this.logar(d, {
        alvo: 'empresaContratada', operacao: 'excluir', descricao: `Excluiu a empresa contratada ${empresa?.nome ?? id}`,
        alvoId: id, alvoRotulo: empresa?.nome ?? id
      });
    });
  }

  salvarUsuario(dados: Omit<Usuario, 'id'> & { id?: string }): void {
    if (dados.id && dados.perfil !== 'gestor' && this.getUsuarioById(dados.id)?.perfil === 'gestor') {
      this.garantirOutroGestor(dados.id);
    }
    const id = dados.id ?? fluxo.novoId();
    const anterior = dados.id ? this.getUsuarioById(dados.id) : undefined;
    banco.alterar(d => {
      const usuario: Usuario = { id, nome: dados.nome, email: dados.email, perfil: dados.perfil };
      if (dados.unidadeId) usuario.unidadeId = dados.unidadeId;
      if (dados.empresaContratadaId) usuario.empresaContratadaId = dados.empresaContratadaId;
      substituir(d.usuarios, usuario);
      // Cadastro novo já entra com o "O que você faz aqui" visto, como os do exemplo.
      if (!dados.id) d.preferencias[id] = { boasVindasEm: new Date().toISOString() };
      this.logar(d, {
        alvo: 'usuario', operacao: dados.id ? 'editar' : 'criar', descricao: `${dados.id ? 'Editou' : 'Criou'} o usuário ${dados.nome}`,
        alvoId: id, alvoRotulo: dados.nome,
        detalhes: anterior && anterior.perfil !== dados.perfil
          ? { perfilAnterior: anterior.perfil, perfilNovo: dados.perfil, email: dados.email }
          : { perfil: dados.perfil, email: dados.email }
      });
    });
    // No real, o cadastro novo ganha a conta de acesso no servidor.
    if (!dados.id) {
      this.feedback.sucesso(`${fluxo.AVISO_DEMO} ${dados.nome} entra no cadastro, mas a conta de acesso não é criada. Para entrar, use as pessoas de exemplo.`);
    }
  }

  excluirUsuario(id: string): void {
    const usuario = this.getUsuarioById(id);
    if (usuario?.perfil === 'gestor') this.garantirOutroGestor(id);
    banco.alterar(d => {
      d.usuarios = d.usuarios.filter(u => u.id !== id);
      this.logar(d, {
        alvo: 'usuario', operacao: 'excluir', descricao: `Excluiu o usuário ${usuario?.nome ?? id}`, alvoId: id, alvoRotulo: usuario?.nome ?? id,
        detalhes: { email: usuario?.email ?? null, perfil: usuario?.perfil ?? null }
      });
    });
  }

  getPlanoById(id: string): PlanoManutencao | undefined {
    return this.planosManutencao().find(p => p.id === id);
  }

  getPlanosPorEquipamento(equipamentoId: string): PlanoManutencao[] {
    return this.planosManutencao().filter(p => p.equipamentoId === equipamentoId);
  }

  salvarPlanoManutencao(dados: Omit<PlanoManutencao, 'id'> & { id?: string }): void {
    const id = dados.id ?? fluxo.novoId();
    banco.alterar(d => {
      const plano: PlanoManutencao = {
        id,
        nome: dados.nome,
        equipamentoId: dados.equipamentoId,
        periodicidadeDias: dados.periodicidadeDias,
        proximaExecucao: dados.proximaExecucao,
        antecedenciaDias: dados.antecedenciaDias,
        ativo: dados.ativo
      };
      if (dados.ultimaExecucao) plano.ultimaExecucao = dados.ultimaExecucao;
      if (dados.contratoId) plano.contratoId = dados.contratoId;
      if (dados.itemContratoId) plano.itemContratoId = dados.itemContratoId;
      if (dados.quantidadePrevista) plano.quantidadePrevista = dados.quantidadePrevista;
      substituir(d.planosManutencao, plano);
      const equipamento = d.equipamentos.find(e => e.id === dados.equipamentoId);
      this.logar(d, {
        alvo: 'planoManutencao', operacao: dados.id ? 'editar' : 'criar',
        descricao: `${dados.id ? 'Editou' : 'Criou'} o plano preventivo "${dados.nome}" (${equipamento?.nome ?? dados.equipamentoId})`,
        alvoId: id, alvoRotulo: dados.nome,
        detalhes: { equipamento: equipamento?.nome ?? dados.equipamentoId, periodicidadeDias: dados.periodicidadeDias, proximaExecucao: dados.proximaExecucao, ativo: dados.ativo }
      });
    });
  }

  excluirPlanoManutencao(id: string): void {
    banco.alterar(d => {
      const plano = d.planosManutencao.find(p => p.id === id);
      d.planosManutencao = d.planosManutencao.filter(p => p.id !== id);
      this.logar(d, {
        alvo: 'planoManutencao', operacao: 'excluir', descricao: `Excluiu o plano preventivo "${plano?.nome ?? id}"`,
        alvoId: id, alvoRotulo: plano?.nome ?? id
      });
    });
  }

  /** "Abrir chamados vencendo": a mesma regra do agendamento das 6h. */
  async rodarPreventivaAgora(): Promise<{ gerados: number; duplicados: number; ignorados: number }> {
    await espera();
    const r = banco.alterar(d => fluxo.rodarPreventiva(d, this.ator()));
    this.feedback.announce(`Preventiva: ${plural(r.gerados, 'chamado aberto', 'chamados abertos')}.`);
    return r;
  }

  async criarContrato(cabecalho: Omit<Contrato, 'id' | 'itens'>, itens: ItemContrato[]): Promise<void> {
    await espera();
    const id = fluxo.novoId();
    banco.alterar(d => {
      d.contratos.push({
        id,
        ...cabecalho,
        itens: itens.map(item => ({
          id: fluxo.novoId(),
          empresaId: 'demo',
          nome: item.nome,
          unidadeMedida: item.unidadeMedida,
          quantidadeContratada: item.quantidadeContratada,
          quantidadeDisponivel: item.quantidadeContratada,
          quantidadeReservada: 0,
          quantidadeConsumida: 0,
          precoUnitario: item.precoUnitario
        }))
      });
      this.logar(d, {
        alvo: 'contrato', operacao: 'criar', descricao: `Criou o contrato ${cabecalho.numero} (${cabecalho.fornecedor})`,
        alvoId: id, alvoRotulo: cabecalho.numero, detalhes: { fornecedor: cabecalho.fornecedor, itens: itens.length }
      });
    });
    this.feedback.announce(`Contrato ${cabecalho.numero} criado com sucesso.`);
  }

  /**
   * Cria ou edita um item do contrato. Na edição só nome, unidade e preço
   * mudam: quantidade e saldo só por aditivo e pelas ações de OS.
   */
  async salvarItemContrato(contrato: Contrato, dados: Omit<ItemContrato, 'id'> & { id?: string }): Promise<void> {
    const existente = dados.id ? contrato.itens.find(i => i.id === dados.id) : undefined;
    banco.alterar(d => {
      const alvo = d.contratos.find(c => c.id === contrato.id);
      if (!alvo) throw new Error('Contrato não encontrado.');
      if (existente) {
        const item = alvo.itens.find(i => i.id === existente.id);
        if (!item) throw new Error('Item não encontrado.');
        item.nome = dados.nome;
        item.unidadeMedida = dados.unidadeMedida;
        item.precoUnitario = dados.precoUnitario;
        this.logar(d, {
          alvo: 'itemContrato', operacao: 'editar', descricao: `Editou o item "${dados.nome}" do contrato ${contrato.numero}`,
          alvoId: existente.id, alvoRotulo: dados.nome, alvoPaiId: contrato.id,
          detalhes: {
            contrato: contrato.numero,
            ...diferencas(
              { nome: existente.nome, unidadeMedida: existente.unidadeMedida, precoUnitario: existente.precoUnitario },
              { nome: dados.nome, unidadeMedida: dados.unidadeMedida, precoUnitario: dados.precoUnitario }
            )
          }
        });
        return;
      }
      const id = fluxo.novoId();
      alvo.itens.push({
        id,
        empresaId: 'demo',
        nome: dados.nome,
        unidadeMedida: dados.unidadeMedida,
        quantidadeContratada: dados.quantidadeContratada,
        quantidadeDisponivel: dados.quantidadeContratada,
        quantidadeReservada: 0,
        quantidadeConsumida: 0,
        precoUnitario: dados.precoUnitario
      });
      this.logar(d, {
        alvo: 'itemContrato', operacao: 'criar', descricao: `Adicionou o item "${dados.nome}" ao contrato ${contrato.numero}`,
        alvoId: id, alvoRotulo: dados.nome, alvoPaiId: contrato.id,
        detalhes: { contrato: contrato.numero, quantidade: dados.quantidadeContratada, precoUnitario: dados.precoUnitario }
      });
    });
  }

  async excluirItemContrato(contrato: Contrato, item: ItemContrato): Promise<void> {
    if (item.quantidadeReservada > 0 || item.quantidadeConsumida > 0) {
      throw new Error(`"${item.nome}" não pode ser excluído: tem ${item.quantidadeReservada} separado e ${item.quantidadeConsumida} usado.`);
    }
    banco.alterar(d => {
      const alvo = d.contratos.find(c => c.id === contrato.id);
      if (alvo) alvo.itens = alvo.itens.filter(i => i.id !== item.id);
      this.logar(d, {
        alvo: 'itemContrato', operacao: 'excluir', descricao: `Removeu o item "${item.nome}" do contrato ${contrato.numero}`,
        alvoId: item.id, alvoRotulo: item.nome, alvoPaiId: contrato.id,
        detalhes: { contrato: contrato.numero, quantidade: item.quantidadeContratada }
      });
    });
  }

  // ---------- Ações de fluxo (no real, Cloud Functions) ----------

  async adicionarChamado(dados: {
    titulo: string;
    equipamento: string;
    numeroSerie?: string;
    descricao: string;
    unidadeId: string;
    solicitanteNome: string;
    possuiFoto: boolean;
    foto?: string;
    local?: string;
    urgencia?: UrgenciaChamado;
    equipamentoId?: string;
  }): Promise<{ id: string; numero: string }> {
    const foto = dados.foto ? await reduzirFotoDemo(dados.foto) : '';
    await espera();
    return banco.alterar(d => fluxo.criarChamado(d, this.ator(), { ...dados, foto: foto || undefined }));
  }

  /**
   * Resolve o token do QR Code. Na demonstração o token é o próprio alvo
   * ("equipamento.e1"), sem o link de 3 minutos da function.
   */
  async validarQrToken(token: string): Promise<{ unidadeId: string; unidadeNome: string | null; tipo: QrAlvoTipo; nome?: string }> {
    await espera(200);
    const alvo = fluxo.resolverQrToken(banco.ler(), token);
    return { unidadeId: alvo.unidadeId, unidadeNome: alvo.unidadeNome, tipo: alvo.tipo, nome: alvo.nome };
  }

  /** Chamado aberto pelo formulário do QR Code: a unidade sai do token. */
  async criarChamadoPeloQr(dados: {
    titulo: string;
    equipamento: string;
    numeroSerie?: string;
    descricao: string;
    solicitanteNome: string;
    possuiFoto: boolean;
    foto?: string;
    qrToken: string;
    local?: string;
    urgencia?: UrgenciaChamado;
  }): Promise<{ id: string; numero: string }> {
    const foto = dados.foto ? await reduzirFotoDemo(dados.foto) : '';
    await espera();
    return banco.alterar(d => {
      const alvo = fluxo.resolverQrToken(d, dados.qrToken);
      const { qrToken: _token, ...resto } = dados;
      return fluxo.criarChamado(d, this.ator(), { ...resto, foto: foto || undefined }, alvo);
    });
  }

  async cancelarChamado(chamadoId: string, motivo?: string): Promise<void> {
    await espera();
    banco.alterar(d => fluxo.cancelarChamado(d, this.ator(), chamadoId, motivo));
    const numero = this.getChamadoById(chamadoId)?.numero;
    this.feedback.sucesso(numero ? `Chamado ${numero} cancelado.` : 'Chamado cancelado.');
  }

  async reabrirChamado(chamadoId: string, motivo?: string): Promise<void> {
    await espera();
    banco.alterar(d => fluxo.reabrirChamado(d, this.ator(), chamadoId, motivo));
    this.feedback.announce('Chamado reaberto.');
  }

  async adicionarOS(dados: { chamadoId: string; contratoId: string; tecnicoId?: string }): Promise<void> {
    await espera();
    const res = banco.alterar(d => fluxo.criarOS(d, this.ator(), dados));
    this.feedback.sucesso(`${rotuloOS(res.numero)} criada e enviada para a empresa contratada.`);
  }

  async criarOrcamento(osId: string, itens: OrcamentoPedidoItem[], itensForaContrato: ItemForaContratoPedido[] = []): Promise<void> {
    await espera();
    banco.alterar(d => fluxo.criarOrcamento(d, this.ator(), osId, itens, itensForaContrato));
    const numero = this.getOSById(osId)?.numero;
    this.feedback.sucesso(`Orçamento${numero ? ` da ${numero}` : ''} enviado. A gestão foi avisada para aprovar.`);
  }

  // A importação por planilha valida e grava no servidor: na demonstração
  // ela não roda, e a tela mostra o aviso no lugar dos erros da planilha.
  async validarImportacaoContratos(_csv: string): Promise<{
    totalLinhas: number;
    contratos: number;
    erros: { linha: number; mensagem: string }[];
    contratosExistentes: string[];
    fornecedoresSemCadastro: string[];
    valido: boolean;
  }> {
    await espera(200);
    throw new Error(`${fluxo.AVISO_DEMO} A importação de contratos por planilha usa o servidor. Para ver um contrato novo, use "Criar" na tela de Contratos.`);
  }

  async importarContratos(_csv: string): Promise<{ contratosCriados: number; itensCriados: number }> {
    await espera(200);
    throw new Error(`${fluxo.AVISO_DEMO} A importação de contratos por planilha usa o servidor. Para ver um contrato novo, use "Criar" na tela de Contratos.`);
  }

  async aditivarContrato(dados: {
    contratoId: string;
    motivo: string;
    novaVigenciaFim?: string;
    itens?: { itemContratoId: string; novaQuantidadeContratada: number }[];
  }): Promise<number> {
    await espera();
    const numero = banco.alterar(d => fluxo.aditivarContrato(d, this.ator(), dados));
    this.feedback.announce(`Aditivo nº ${numero} registrado.`);
    return numero;
  }

  async aprovarOrcamento(
    orcamentoId: string,
    ajustes?: { itemContratoId: string; quantidade: number }[],
    observacao?: string,
    foraContrato?: { id: string; aprovado: boolean }[]
  ): Promise<void> {
    await espera();
    banco.alterar(d => fluxo.aprovarOrcamento(d, this.ator(), orcamentoId, ajustes, observacao, foraContrato));
    this.feedback.sucesso(
      ajustes?.length
        ? 'Orçamento aprovado com ajustes. O saldo ficou separado no contrato e a empresa contratada foi avisada.'
        : 'Orçamento aprovado. O saldo ficou separado no contrato e a empresa contratada foi avisada.'
    );
  }

  async rejeitarOrcamento(orcamentoId: string): Promise<void> {
    await espera();
    banco.alterar(d => fluxo.rejeitarOrcamento(d, this.ator(), orcamentoId));
    this.feedback.sucesso('Orçamento recusado. A empresa contratada foi avisada para enviar outro.');
  }

  async executarOS(
    osId: string,
    itens?: { itemContratoId: string; quantidadeExecutada: number }[],
    observacao?: string,
    fotos?: string[],
    foraContrato?: { id: string; quantidadeExecutada: number }[]
  ): Promise<void> {
    if ((fotos?.length ?? 0) > 3) throw new Error('Envie no máximo 3 fotos.');
    const reduzidas = (await Promise.all((fotos ?? []).map(f => reduzirFotoDemo(f)))).filter(Boolean);
    await espera();
    banco.alterar(d => fluxo.executarOS(d, this.ator(), osId, itens, observacao, reduzidas, foraContrato));
    const numero = this.getOSById(osId)?.numero;
    this.feedback.sucesso(`Serviço registrado${numero ? ` na ${numero}` : ''}. A gestão foi avisada para conferir e encerrar.`);
  }

  async encerrarChamado(chamadoId: string): Promise<void> {
    await espera();
    banco.alterar(d => fluxo.encerrarChamado(d, this.ator(), chamadoId));
    const numero = this.getChamadoById(chamadoId)?.numero;
    this.feedback.sucesso(numero ? `Chamado ${numero} encerrado.` : 'Chamado encerrado.');
  }

  async atribuirTecnicoOS(osId: string, tecnicoId: string | null): Promise<void> {
    await espera(200);
    banco.alterar(d => fluxo.atribuirTecnicoOS(d, this.ator(), osId, tecnicoId));
    this.feedback.announce(tecnicoId ? 'Técnico designado.' : 'Técnico removido da OS.');
  }

  async encerrarContrato(contratoId: string, motivo: string): Promise<{ disponivelZerado: number; osCanceladas: string[] }> {
    await espera();
    const r = banco.alterar(d => fluxo.encerrarContrato(d, this.ator(), contratoId, motivo));
    this.feedback.announce('Contrato encerrado.');
    return r;
  }

  async marcarNotificacaoLida(notificacaoId: string): Promise<void> {
    const meuId = this.usuarioAtualId;
    if (!meuId) return;
    banco.alterar(d => {
      const n = d.notificacoes.find(x => x.id === notificacaoId);
      if (n && !n.lidaPor.includes(meuId)) n.lidaPor.push(meuId);
    });
  }

  async atribuirResponsavelChamado(chamadoId: string, gestorId: string | undefined): Promise<void> {
    await espera(200);
    banco.alterar(d => fluxo.atribuirResponsavelChamado(d, this.ator(), chamadoId, gestorId ?? null));
  }
}

// Grava por id: troca o registro existente ou acrescenta no fim.
function substituir<T extends { id: string }>(lista: T[], registro: T): void {
  const i = lista.findIndex(x => x.id === registro.id);
  if (i >= 0) lista[i] = registro;
  else lista.push(registro);
}

// Só o que realmente mudou entra no log.
function diferencas(antes: Record<string, unknown>, depois: Record<string, unknown>): Record<string, unknown> {
  const mudancas: Record<string, unknown> = {};
  for (const chave of Object.keys(depois)) {
    if (antes[chave] !== depois[chave]) mudancas[chave] = { de: antes[chave], para: depois[chave] };
  }
  return mudancas;
}
