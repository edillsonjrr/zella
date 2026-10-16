import { Component, Inject, OnInit, Optional, computed, inject, signal } from '@angular/core';
import { IconComponent } from '../shared/icon/icon.component';
import { FlowButtonComponent } from '../shared/flow-button/flow-button.component';
import { FormsModule, NgForm } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { MatCardModule } from '@angular/material/card';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { MatButtonModule } from '@angular/material/button';
import { MatDividerModule } from '@angular/material/divider';
import { MatDialogModule, MAT_DIALOG_DATA, MatDialogRef } from '@angular/material/dialog';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { DataService } from '../shared/data.service';
import type { Chamado } from '../shared/models';
import { contratoCobre, nomeNormalizado } from '../shared/cobertura-contrato';

@Component({
  selector: 'app-nova-os',
  imports: [
    FormsModule,
    MatCardModule,
    MatFormFieldModule,
    MatInputModule,
    MatSelectModule,
    MatButtonModule,
    IconComponent,
    FlowButtonComponent,
    MatDividerModule,
    MatDialogModule,
    MatCheckboxModule
  ],
  templateUrl: './nova-os.component.html',
  styleUrl: './nova-os.component.scss'
})
export class NovaOsComponent implements OnInit {
  private route = inject(ActivatedRoute);
  private router = inject(Router);
  private dataService = inject(DataService);

  chamadoOrigem = signal<Chamado | null>(null);
  ativo = '';
  numeroSerie = '';
  contratoId = signal('');
  tecnicoId = '';

  chamadoIdParam = signal<string | null>(null);
  chamadoSelecionadoId = '';

  // Contrato encerrado ou vencido não recebe OS (o backend recusa também).
  contratos = computed(() => {
    const hoje = new Date().toISOString().split('T')[0];
    return this.dataService.contratos().filter(c => c.status !== 'Encerrado' && (!c.vigenciaFim || c.vigenciaFim >= hoje));
  });
  // Só técnicos da contratada do contrato escolhido (Z0.4): a OS vai para
  // essa empresa, e o backend recusa técnico de outra. Sem contrato, nenhum.
  contratadaDoContrato = computed(() => this.dataService.getContratoById(this.contratoId())?.empresaContratadaId);
  nomeContratada = computed(() => {
    const contrato = this.dataService.getContratoById(this.contratoId());
    return this.dataService.getEmpresaContratadaById(contrato?.empresaContratadaId)?.nome ?? contrato?.fornecedor ?? '';
  });
  tecnicos = computed(() => {
    const contratada = this.contratadaDoContrato();
    if (!this.contratoId()) return [];
    return this.dataService.usuarios().filter(u => u.perfil === 'tecnico' && (!contratada || u.empresaContratadaId === contratada));
  });
  chamadosDisponiveis = computed(() => this.dataService.chamados().filter(c => !c.ordemServicoId));

  // Aviso (não bloqueio) quando o contrato escolhido não parece ter item para
  // este conserto: a gestora confirma e envia mesmo assim, porque há caso
  // legítimo, como "Outro (descrever)" (shared/cobertura-contrato.ts).
  contratoEscolhido = computed(() => this.dataService.getContratoById(this.contratoId()));
  semItemParaOConserto = computed(() => {
    const chamado = this.chamadoOrigem();
    const contrato = this.contratoEscolhido();
    if (!chamado || !contrato) return false;
    const nome = nomeNormalizado(chamado.equipamento);
    const jaAtendeu = this.dataService.ordensServico().some(os => {
      if (os.contratoId !== contrato.id || os.chamadoId === chamado.id) return false;
      const outro = this.dataService.getChamadoById(os.chamadoId);
      return !!outro && ((!!chamado.equipamentoId && outro.equipamentoId === chamado.equipamentoId) || (!!nome && nomeNormalizado(outro.equipamento) === nome));
    });
    return !contratoCobre(chamado.equipamento, contrato, { nomeContratada: this.nomeContratada(), jaAtendeuEsteEquipamento: jaAtendeu });
  });
  itensDoContrato = computed(() => (this.contratoEscolhido()?.itens ?? []).map(i => i.nome).join(', '));
  confirmouSemItem = signal(false);
  pediuConfirmacao = signal(false);

  constructor(
    @Optional() private dialogRef: MatDialogRef<NovaOsComponent>,
    @Optional() @Inject(MAT_DIALOG_DATA) public data: any
  ) {}

  get isDialog(): boolean {
    return !!this.dialogRef;
  }

  ngOnInit(): void {
    const params = this.data || {};
    this.chamadoIdParam.set(params.chamadoId || null);
    this.ativo = params.equipamento || '';
    this.numeroSerie = params.serie || '';

    this.route.queryParamMap.subscribe(queryParams => {
      if (!this.isDialog) {
        this.chamadoIdParam.set(queryParams.get('chamadoId') || null);
        this.ativo = queryParams.get('equipamento') || this.ativo;
        this.numeroSerie = queryParams.get('serie') || this.numeroSerie;
      }

      const id = this.chamadoIdParam();
      const chamado = id ? this.dataService.getChamadoById(id) : undefined;
      if (chamado) {
        this.chamadoOrigem.set(chamado);
        if (!this.ativo) this.ativo = chamado.equipamento;
        if (!this.numeroSerie) this.numeroSerie = chamado.numeroSerie ?? '';
      }
    });
  }

  // Trocou o contrato: o técnico escolhido pode não ser da nova contratada.
  trocarContrato(id: string): void {
    this.contratoId.set(id);
    this.confirmouSemItem.set(false);
    this.pediuConfirmacao.set(false);
    if (this.tecnicoId && !this.tecnicos().some(t => t.id === this.tecnicoId)) this.tecnicoId = '';
  }

  selecionarChamado(chamadoId: string): void {
    const chamado = this.dataService.getChamadoById(chamadoId);
    if (chamado) {
      this.chamadoOrigem.set(chamado);
      if (!this.ativo) this.ativo = chamado.equipamento;
      if (!this.numeroSerie) this.numeroSerie = chamado.numeroSerie ?? '';
    }
  }

  erro = signal('');
  enviando = signal(false);

  // Espera a resposta antes de fechar: se o backend recusar (contrato
  // vencido, técnico de outra contratada), o erro aparece aqui, e a OS não
  // some calada.
  async salvar(form: NgForm): Promise<void> {
    const chamado = this.chamadoOrigem();
    if (form.invalid || !chamado) {
      form.control.markAllAsTouched();
      document.querySelector<HTMLElement>('.modal-scrollable-body .ng-invalid')?.focus({ preventScroll: true });
      return;
    }
    // Sem item no contrato: só envia com a confirmação marcada.
    if (this.semItemParaOConserto() && !this.confirmouSemItem()) {
      this.pediuConfirmacao.set(true);
      document.querySelector<HTMLElement>('.nova-os-aviso input[type="checkbox"]')?.focus();
      return;
    }

    this.erro.set('');
    this.enviando.set(true);
    try {
      await this.dataService.adicionarOS({
        chamadoId: chamado.id,
        contratoId: this.contratoId(),
        tecnicoId: this.tecnicoId || undefined
      });
      this.fechar();
    } catch (e) {
      this.erro.set(e instanceof Error && e.message ? e.message : 'Não foi possível criar a OS. Tente de novo.');
    } finally {
      this.enviando.set(false);
    }
  }

  cancelar(): void {
    this.fechar();
  }

  private fechar(): void {
    if (this.dialogRef) {
      this.dialogRef.close();
    } else {
      this.router.navigate(['/ordens-servico']);
    }
  }
}
