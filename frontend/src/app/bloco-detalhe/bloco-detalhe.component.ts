import { Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatDividerModule } from '@angular/material/divider';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatTableModule } from '@angular/material/table';
import { MatDialog, MAT_DIALOG_DATA, MatDialogRef } from '@angular/material/dialog';
import { IconComponent } from '../shared/icon/icon.component';
import { FlowButtonComponent } from '../shared/flow-button/flow-button.component';
import { DataService } from '../shared/data.service';
import { DialogoService } from '../shared/dialogo/dialogo.service';
import { UiFeedbackService } from '../shared/ui-feedback.service';
import { QrcodeDetalheComponent } from '../qrcode-detalhe/qrcode-detalhe.component';
import { SalaDetalheComponent } from '../sala-detalhe/sala-detalhe.component';
import type { Bloco, Sala } from '../shared/models';

@Component({
  selector: 'app-bloco-detalhe',
  imports: [
    FormsModule,
    MatButtonModule,
    MatDividerModule,
    MatFormFieldModule,
    MatInputModule,
    MatTableModule,
    IconComponent,
    FlowButtonComponent
  ],
  templateUrl: './bloco-detalhe.component.html',
  styleUrl: './bloco-detalhe.component.scss'
})
export class BlocoDetalheComponent {
  private dataService = inject(DataService);
  private dialogo = inject(DialogoService);
  private feedback = inject(UiFeedbackService);
  private dialog = inject(MatDialog);
  private dialogRef = inject(MatDialogRef<BlocoDetalheComponent>);

  colunasSalas = ['nome', 'acoes'];

  bloco = inject<Bloco>(MAT_DIALOG_DATA);
  unidade = this.dataService.getUnidadeById(this.bloco.unidadeId);
  salas = () => this.dataService.getSalasByBloco(this.bloco.id);

  editandoSalaId = signal<string | null>(null);
  nomeSala = '';

  novaSala(): void {
    this.editandoSalaId.set('novo');
    this.nomeSala = '';
  }

  editarSala(sala: Sala): void {
    this.editandoSalaId.set(sala.id);
    this.nomeSala = sala.nome;
  }

  cancelarSala(): void {
    this.editandoSalaId.set(null);
  }

  salvarSala(): void {
    if (!this.nomeSala.trim()) return;

    const id = this.editandoSalaId();
    this.dataService.salvarSala({
      id: id !== 'novo' ? id! : undefined,
      unidadeId: this.bloco.unidadeId,
      blocoId: this.bloco.id,
      nome: this.nomeSala.trim()
    });
    this.cancelarSala();
  }

  async excluirSala(sala: Sala): Promise<void> {
    if (!(await this.dialogo.excluir(`Excluir a sala ${sala.nome}?`, 'Os equipamentos dela também serão removidos.'))) return;
    try {
      await this.dataService.excluirSala(sala.id);
    } catch (e) {
      this.feedback.announce(e instanceof Error ? e.message : 'Não foi possível excluir a sala.', 'assertive');
    }
  }

  gerenciarEquipamentosDaSala(sala: Sala): void {
    this.dialog.open(SalaDetalheComponent, {
      panelClass: 'sala-detalhe-dialog',
      data: sala,
      position: { right: '0', top: '0' },
      height: '100vh',
      width: '360px',
      maxWidth: '100vw'
    });
  }

  gerarQrCodeSala(sala: Sala): void {
    this.dialog.open(QrcodeDetalheComponent, {
      panelClass: 'qrcode-dialog',
      data: {
        tipo: 'sala',
        id: sala.id,
        titulo: sala.nome,
        subtitulo: `${this.unidade?.sigla ?? ''} · ${sala.nome}`
      },
      position: { right: '0', top: '0' },
      height: '100vh',
      width: '380px',
      maxWidth: '100vw'
    });
  }

  fechar(): void {
    this.dialogRef.close();
  }
}
