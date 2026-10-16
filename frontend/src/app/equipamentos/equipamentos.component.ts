import { Component, computed, inject, signal } from '@angular/core';
import { FormsModule, NgForm } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { MatCardModule } from '@angular/material/card';
import { MatTableModule } from '@angular/material/table';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { MatMenuModule } from '@angular/material/menu';
import { MatTooltipModule } from '@angular/material/tooltip';
import { MatDialog } from '@angular/material/dialog';
import { IconComponent } from '../shared/icon/icon.component';
import { FlowButtonComponent } from '../shared/flow-button/flow-button.component';
import { abrirItemDaUrl } from '../shared/abrir-pela-url';
import { DataService } from '../shared/data.service';
import { DialogoService } from '../shared/dialogo/dialogo.service';
import { UiFeedbackService } from '../shared/ui-feedback.service';
import { QrcodeDetalheComponent } from '../qrcode-detalhe/qrcode-detalhe.component';
import { ImportarEquipamentosDialogComponent } from './importar-equipamentos-dialog.component';
import { EtiquetasDialogComponent } from './etiquetas-dialog.component';
import { AuthService } from '../shared/auth.service';
import { baixarArquivo } from '../shared/pdf/documento-pdf';
import { montarHistoricoEquipamento } from '../shared/relatorios';
import { dicaUnidade, nomeUnidade, rotuloPatrimonio } from '../shared/rotulos';
import type { Equipamento } from '../shared/models';

interface EquipamentoView {
  equipamento: Equipamento;
  unidade: string;
  unidadeDica: string;
  local: string;
  patrimonio: string;
  fabricanteModelo: string;
  planos: number;
}

/**
 * Cadastro de equipamentos, fora do esconderijo de Unidades > sala (Z2.4).
 * Lista com busca e filtro por unidade, e o mesmo formulário para criar e
 * editar. Grava pelo DataService.salvarEquipamento, o mesmo da sala, então
 * log e regras não mudam: só o gestor grava (firestore.rules).
 *
 * O equipamento pertence a uma sala (salaId é obrigatório no modelo): a
 * unidade sem sala manda cadastrar a sala antes, em Unidades.
 */
@Component({
  selector: 'app-equipamentos',
  imports: [
    FormsModule,
    RouterLink,
    MatCardModule,
    MatTableModule,
    MatButtonModule,
    MatFormFieldModule,
    MatInputModule,
    MatSelectModule,
    MatTooltipModule,
    MatMenuModule,
    IconComponent,
    FlowButtonComponent
  ],
  templateUrl: './equipamentos.component.html',
  styleUrl: './equipamentos.component.scss'
})
export class EquipamentosComponent {
  private readonly dataService = inject(DataService);
  private readonly dialogo = inject(DialogoService);
  private readonly feedback = inject(UiFeedbackService);
  private readonly dialog = inject(MatDialog);
  private readonly auth = inject(AuthService);

  readonly unidades = this.dataService.unidades;
  readonly colunas = ['nome', 'unidade', 'local', 'patrimonio', 'acoes'];

  // Filtros da lista
  busca = signal('');
  filtroUnidade = signal<string>('');

  // Formulário (criar ou editar)
  editandoId = signal<string | null>(null);
  nome = '';
  patrimonio = '';
  fabricante = '';
  modelo = '';
  unidadeId = signal('');
  // Equipamento cujo histórico em PDF está sendo gerado.
  gerandoHistorico = signal<string | null>(null);
  blocoId = signal('');
  salaId = '';
  erro = signal('');

  blocosDaUnidade = computed(() => (this.unidadeId() ? this.dataService.getBlocosByUnidade(this.unidadeId()) : []));

  // Salas da unidade, do bloco escolhido ou, sem bloco, todas (as soltas e as dos blocos).
  salasDisponiveis = computed(() => {
    const unidadeId = this.unidadeId();
    if (!unidadeId) return [];
    const blocoId = this.blocoId();
    const ds = this.dataService;
    return ds.salas()
      .filter(s => s.unidadeId === unidadeId && (!blocoId || s.blocoId === blocoId))
      .map(s => ({ sala: s, rotulo: s.blocoId && !blocoId ? `${ds.getBlocoById(s.blocoId)?.nome ?? ''} · ${s.nome}` : s.nome }))
      .sort((a, b) => a.rotulo.localeCompare(b.rotulo, 'pt-BR'));
  });

  equipamentos = computed<EquipamentoView[]>(() => {
    const ds = this.dataService;
    const planos = ds.planosManutencao();
    return ds.equipamentos()
      .map(e => {
        const unidade = ds.getUnidadeById(e.unidadeId);
        return {
          equipamento: e,
          unidade: nomeUnidade(unidade, 'Sem unidade'),
          unidadeDica: dicaUnidade(unidade),
          local: [e.blocoId ? ds.getBlocoById(e.blocoId)?.nome : undefined, ds.getSalaById(e.salaId)?.nome].filter(Boolean).join(' · ') || '—',
          patrimonio: rotuloPatrimonio(e.patrimonio),
          fabricanteModelo: [e.fabricante, e.modelo].filter(Boolean).join(' · '),
          planos: planos.filter(p => p.equipamentoId === e.id).length
        };
      })
      .sort((a, b) => a.unidade.localeCompare(b.unidade, 'pt-BR') || a.equipamento.nome.localeCompare(b.equipamento.nome, 'pt-BR'));
  });

  equipamentosFiltrados = computed(() => {
    const termo = normalizar(this.busca());
    const unidade = this.filtroUnidade();
    return this.equipamentos().filter(v => {
      if (unidade && v.equipamento.unidadeId !== unidade) return false;
      if (!termo) return true;
      return normalizar(`${v.equipamento.nome} ${v.local} ${v.patrimonio} ${v.equipamento.patrimonio ?? ''} ${v.unidade} ${v.fabricanteModelo}`).includes(termo);
    });
  });

  constructor() {
    // Busca global: ?equipamento=ID mostra a lista já filtrada por ele
    // (pelo patrimônio, que é único; sem patrimônio, pelo nome).
    abrirItemDaUrl('equipamento', id => this.dataService.getEquipamentoById(id), e => {
      this.filtroUnidade.set('');
      this.busca.set(e.patrimonio?.trim() || e.nome);
    });
  }

  get isEdicao(): boolean {
    return !!this.editandoId();
  }

  aoTrocarUnidade(id: string): void {
    this.unidadeId.set(id);
    this.blocoId.set('');
    this.salaId = '';
  }

  aoTrocarBloco(id: string): void {
    this.blocoId.set(id);
    const sala = this.dataService.getSalaById(this.salaId);
    if (sala && id && sala.blocoId !== id) this.salaId = '';
  }

  editar(v: EquipamentoView): void {
    const e = v.equipamento;
    this.editandoId.set(e.id);
    this.nome = e.nome;
    this.patrimonio = e.patrimonio ?? '';
    this.fabricante = e.fabricante ?? '';
    this.modelo = e.modelo ?? '';
    this.unidadeId.set(e.unidadeId);
    this.blocoId.set(e.blocoId ?? '');
    this.salaId = e.salaId;
    this.erro.set('');
    document.querySelector<HTMLElement>('.equipamento-form input')?.focus();
  }

  limpar(form?: NgForm): void {
    this.editandoId.set(null);
    this.nome = '';
    this.patrimonio = '';
    this.fabricante = '';
    this.modelo = '';
    this.salaId = '';
    this.blocoId.set('');
    // Mantém a unidade: quem cadastra vários costuma ficar na mesma.
    this.erro.set('');
    form?.resetForm({ unidadeId: this.unidadeId() });
  }

  salvar(form: NgForm): void {
    if (form.invalid || !this.nome.trim() || !this.salaId) {
      form.control.markAllAsTouched();
      return;
    }
    const sala = this.dataService.getSalaById(this.salaId);
    if (!sala || sala.unidadeId !== this.unidadeId()) {
      this.erro.set('Escolha a sala de novo: ela não é desta unidade.');
      return;
    }
    const edicao = this.isEdicao;
    const nome = this.nome.trim();
    this.dataService.salvarEquipamento({
      id: this.editandoId() ?? undefined,
      unidadeId: sala.unidadeId,
      // O bloco vem da sala: a sala é que sabe em qual bloco está.
      blocoId: sala.blocoId,
      salaId: sala.id,
      nome,
      patrimonio: this.patrimonio.trim() || undefined,
      // Vazio apaga: este formulário tem os campos.
      fabricante: this.fabricante.trim(),
      modelo: this.modelo.trim()
    });
    this.feedback.sucesso(edicao ? `Equipamento ${nome} atualizado.` : `Equipamento ${nome} cadastrado.`);
    this.limpar(form);
  }

  async excluir(v: EquipamentoView): Promise<void> {
    const e = v.equipamento;
    const aviso = v.planos
      ? `Os QR Codes impressos deste equipamento deixam de funcionar, e ${v.planos === 1 ? '1 plano preventivo fica' : `${v.planos} planos preventivos ficam`} sem equipamento.`
      : 'Os QR Codes impressos deste equipamento deixam de funcionar.';
    if (!(await this.dialogo.excluir(`Excluir o equipamento ${e.nome}?`, aviso))) return;
    this.dataService.excluirEquipamento(e.id);
    if (this.editandoId() === e.id) this.limpar();
    this.feedback.sucesso(`Equipamento ${e.nome} excluído.`);
  }

  /** Importar planilha (Z3.1). */
  abrirImportacao(): void {
    this.dialog.open(ImportarEquipamentosDialogComponent, {
      panelClass: 'usuario-form-dialog',
      width: '820px',
      maxWidth: '95vw',
      maxHeight: '92vh',
      autoFocus: false
    });
  }

  /** Etiquetas QR em lote (Z3.1), começando pela unidade filtrada na lista. */
  abrirEtiquetas(): void {
    this.dialog.open(EtiquetasDialogComponent, {
      panelClass: 'usuario-form-dialog',
      width: '560px',
      maxWidth: '95vw',
      maxHeight: '92vh',
      autoFocus: false,
      data: { unidadeId: this.filtroUnidade() }
    });
  }

  /** Histórico de manutenção do equipamento em PDF (Z3.2). */
  async baixarHistorico(v: EquipamentoView): Promise<void> {
    if (this.gerandoHistorico()) return;
    this.gerandoHistorico.set(v.equipamento.id);
    try {
      const historico = montarHistoricoEquipamento(this.dataService, v.equipamento);
      const { gerarHistoricoEquipamentoPdf } = await import('../shared/pdf/relatorios-pdf');
      const usuario = this.auth.usuarioLogado();
      const { blob, nome } = await gerarHistoricoEquipamentoPdf(historico, { empresa: usuario.empresaNome, pessoa: usuario.nome });
      baixarArquivo(blob, nome);
    } catch (e) {
      console.error('Falha ao gerar o histórico', e);
      this.feedback.erro('Não foi possível gerar o histórico. Tente de novo.');
    } finally {
      this.gerandoHistorico.set(null);
    }
  }

  abrirQrCode(v: EquipamentoView): void {
    const e = v.equipamento;
    this.dialog.open(QrcodeDetalheComponent, {
      panelClass: 'qrcode-dialog',
      data: { tipo: 'equipamento', id: e.id, titulo: e.nome, subtitulo: `${v.unidade} · ${e.nome}` },
      position: { right: '0', top: '0' },
      height: '100vh',
      width: '380px',
      maxWidth: '100vw'
    });
  }
}

function normalizar(texto: string): string {
  return texto.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();
}
