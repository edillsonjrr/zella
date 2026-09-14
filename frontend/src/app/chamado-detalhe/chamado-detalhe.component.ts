import { Component, computed, inject, signal } from '@angular/core';
import { getDownloadURL, ref } from 'firebase/storage';
import { storage } from '../shared/firebase';
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
import { HistoricoRegistroComponent } from '../shared/historico-registro/historico-registro.component';
import { AuthService } from '../shared/auth.service';
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
  private auth = inject(AuthService);

  chamado: Chamado = inject(MAT_DIALOG_DATA);

  unidadeNome = this.dataService.getUnidadeById(this.chamado.unidadeId)?.nome ?? '-';
  gestores = computed(() => this.dataService.usuarios().filter(u => u.perfil === 'gestor'));
  responsavelId = this.chamado.responsavelId ?? '';
  fotoUrl = signal<string | null>(null);
  erroAcao = signal('');

  constructor() {
    if (this.chamado.fotoPath) {
      getDownloadURL(ref(storage, this.chamado.fotoPath))
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
    const motivo = prompt(`Cancelar o chamado ${this.chamado.numero}? Informe o motivo (opcional):`);
    if (motivo === null) return;
    try {
      await this.dataService.cancelarChamado(this.chamado.id, motivo);
      this.fechar();
    } catch (e) {
      this.erroAcao.set((e as Error).message);
    }
  }

  async reabrirChamado(): Promise<void> {
    const motivo = prompt(`Reabrir o chamado ${this.chamado.numero}? Informe o motivo (opcional):`);
    if (motivo === null) return;
    try {
      await this.dataService.reabrirChamado(this.chamado.id, motivo);
      this.fechar();
    } catch (e) {
      this.erroAcao.set((e as Error).message);
    }
  }

  podeConverterEmOs(): boolean {
    return (this.auth.isGestor() || this.auth.isGestorContratado()) &&
      this.chamado.situacao !== 'Convertido' && this.chamado.situacao !== 'Cancelado' && !this.chamado.ordemServicoId;
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

  async encerrarChamado(): Promise<void> {
    try {
      await this.dataService.encerrarChamado(this.chamado.id);
      this.fechar();
    } catch (e) {
      this.erroAcao.set((e as Error).message);
    }
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

  badgeClass(situacao: string): string {
    switch (situacao) {
      case 'Aberto': return 'badge--aberta';
      case 'Em atendimento': return 'badge--vistoria';
      case 'Convertido': return 'badge--aprovada';
      case 'Cancelado': return 'badge--rejeitada';
      default: return '';
    }
  }

  statusIcon(situacao: string): string {
    switch (situacao) {
      case 'Aberto': return 'radio_button_unchecked';
      case 'Em atendimento': return 'engineering';
      case 'Convertido': return 'check_circle';
      case 'Cancelado': return 'cancel';
      default: return 'help';
    }
  }
}
