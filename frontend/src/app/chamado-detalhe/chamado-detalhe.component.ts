import { Component, computed, inject, signal } from '@angular/core';
import { urlDoArquivo } from '../shared/arquivos';
import { IconComponent } from '../shared/icon/icon.component';
import { FlowButtonComponent } from '../shared/flow-button/flow-button.component';
import { NgClass, DatePipe } from '@angular/common';
import { Router } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { MatCardModule } from '@angular/material/card';
import { MatButtonModule } from '@angular/material/button';
import { MatDividerModule } from '@angular/material/divider';
import { MatSelectModule } from '@angular/material/select';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MAT_DIALOG_DATA, MatDialogRef } from '@angular/material/dialog';
import { DataService } from '../shared/data.service';
import { DialogoService } from '../shared/dialogo/dialogo.service';
import { HistoricoRegistroComponent } from '../shared/historico-registro/historico-registro.component';
import { AuthService } from '../shared/auth.service';
import { EXPLICACAO_FIM, classeDoSelo, situacaoDoChamado } from '../shared/situacao-servico';
import { prazoDoChamado } from '../shared/chamado-prazo';
import { rotuloPatrimonio, rotuloUrgencia } from '../shared/rotulos';
import { FluxoAcoesService } from '../shared/fluxo-acoes.service';
import type { Chamado } from '../shared/models';

@Component({
  selector: 'app-chamado-detalhe',
  imports: [
    NgClass,
    DatePipe,
    FormsModule,
    MatCardModule,
    MatButtonModule,
    IconComponent,
    FlowButtonComponent,
    MatDividerModule,
    MatSelectModule,
    MatFormFieldModule,
    HistoricoRegistroComponent
  ],
  templateUrl: './chamado-detalhe.component.html',
  styleUrl: './chamado-detalhe.component.scss'
})
export class ChamadoDetalheComponent {
  private router = inject(Router);
  private dialogRef = inject(MatDialogRef<ChamadoDetalheComponent>);
  dataService = inject(DataService);
  private dialogo = inject(DialogoService);
  private auth = inject(AuthService);
  private fluxo = inject(FluxoAcoesService);

  chamado: Chamado = inject(MAT_DIALOG_DATA);

  // Situação no vocabulário único do chamado e da OS, lida ao vivo: as ações
  // daqui mudam o chamado com o painel aberto.
  private chamadoAtual = computed(() => this.dataService.getChamadoById(this.chamado.id) ?? this.chamado);
  situacao = computed(() => {
    const s = situacaoDoChamado(this.dataService, this.chamadoAtual(), this.auth.perfil);
    return { ...s, classe: classeDoSelo(s.chave) };
  });
  readonly explicacaoFim = EXPLICACAO_FIM;

  // A OS que nasceu deste chamado: a numeração da OS é separada da do chamado.
  osNumero = computed(() => {
    const id = this.chamadoAtual().ordemServicoId;
    return id ? this.dataService.getOSById(id)?.numero : undefined;
  });
  unidadeNome = this.dataService.getUnidadeById(this.chamado.unidadeId)?.nome ?? '-';
  prazo = prazoDoChamado(this.chamado);
  urgencia = rotuloUrgencia(this.chamado.urgencia);
  // Onde fica: o que a pessoa escreveu ou, sem isso, a sala do equipamento
  // escolhido no cadastro.
  onde = (() => {
    if (this.chamado.local) return this.chamado.local;
    const e = this.chamado.equipamentoId ? this.dataService.getEquipamentoById(this.chamado.equipamentoId) : undefined;
    if (!e) return '';
    return [e.blocoId ? this.dataService.getBlocoById(e.blocoId)?.nome : undefined, this.dataService.getSalaById(e.salaId)?.nome]
      .filter(Boolean)
      .join(', ');
  })();
  // Patrimônio do equipamento do cadastro: antes a tela dizia só "Número de
  // série: Não informado", com o patrimônio nº 0021 no cadastro.
  patrimonio = rotuloPatrimonio(
    this.chamado.equipamentoId ? this.dataService.getEquipamentoById(this.chamado.equipamentoId)?.patrimonio : undefined
  );
  gestores = computed(() => this.dataService.usuarios().filter(u => u.perfil === 'gestor'));
  responsavelId = this.chamado.responsavelId ?? '';
  fotoUrl = signal<string | null>(null);
  erroAcao = signal('');

  constructor() {
    if (this.chamado.fotoPath) {
      urlDoArquivo(this.chamado.fotoPath)
        .then(url => this.fotoUrl.set(url))
        .catch(() => this.fotoUrl.set(null));
    }
  }

  podeCancelar(): boolean {
    return (this.auth.isGestor() || this.auth.isGestorContratado()) &&
      !['Executado', 'Encerrado', 'Cancelado'].includes(this.chamado.status);
  }

  podeReabrir(): boolean {
    return this.auth.isGestor() && ['Encerrado', 'Cancelado'].includes(this.chamado.status);
  }

  async cancelarChamado(): Promise<void> {
    const motivo = await this.dialogo.perguntar(`Cancelar o chamado ${this.chamado.numero}?`, 'Motivo', {
      mensagem: 'Se houver orçamento aprovado, o saldo separado volta para o contrato.',
      confirmar: 'Cancelar chamado',
      perigo: true,
      opcional: true
    });
    if (motivo === null) return;
    try {
      await this.dataService.cancelarChamado(this.chamado.id, motivo);
      this.fechar();
    } catch (e) {
      this.erroAcao.set((e as Error).message);
    }
  }

  async reabrirChamado(): Promise<void> {
    const motivo = await this.dialogo.perguntar(`Reabrir o chamado ${this.chamado.numero}?`, 'Motivo', {
      mensagem: 'O chamado volta a "Aberto" e uma nova OS poderá ser criada.',
      confirmar: 'Reabrir',
      opcional: true
    });
    if (motivo === null) return;
    try {
      await this.dataService.reabrirChamado(this.chamado.id, motivo);
      this.fechar();
    } catch (e) {
      this.erroAcao.set((e as Error).message);
    }
  }

  // Só o gestor transforma chamado em OS (a contratada recebe a OS pronta).
  podeConverterEmOs(): boolean {
    return this.auth.isGestor() &&
      !['Executado', 'Encerrado', 'Cancelado'].includes(this.chamado.status) && !this.chamado.ordemServicoId;
  }

  podeAtribuirResponsavel(): boolean {
    return this.auth.isGestor();
  }

  // Só depois de executado: antes disso a OS aprovada ainda tem saldo
  // reservado, e encerrar deixaria essa reserva presa. Quem não vai executar
  // cancela (que devolve o saldo).
  podeEncerrar(): boolean {
    return this.auth.isGestor() && this.chamado.status === 'Executado';
  }

  atribuirResponsavel(): void {
    this.dataService.atribuirResponsavelChamado(this.chamado.id, this.responsavelId || undefined);
  }

  // Resumo (OS, técnico, observação, itens, custo) e "Confirmar
  // encerramento" na janela do fluxo; o erro aparece lá dentro.
  async encerrarChamado(): Promise<void> {
    this.erroAcao.set('');
    const atual = this.dataService.getChamadoById(this.chamado.id) ?? this.chamado;
    if (await this.fluxo.encerrarChamado(atual)) this.fechar();
  }

  converterEmOs(): void {
    this.dialogRef.close();
    this.router.navigate(['/ordens-servico/nova'], {
      queryParams: {
        chamado: this.chamado.numero,
        chamadoId: this.chamado.id,
        equipamento: this.chamado.equipamento,
        serie: this.chamado.numeroSerie
      }
    });
  }

  fechar(): void {
    this.dialogRef.close();
  }
}
