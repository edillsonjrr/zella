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
import type { Sala, Equipamento } from '../shared/models';

@Component({
  selector: 'app-sala-detalhe',
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
  templateUrl: './sala-detalhe.component.html',
  styleUrl: './sala-detalhe.component.scss'
})
export class SalaDetalheComponent {
  private dataService = inject(DataService);
  private dialogo = inject(DialogoService);
  private feedback = inject(UiFeedbackService);
  private dialog = inject(MatDialog);
  private dialogRef = inject(MatDialogRef<SalaDetalheComponent>);

  colunasEquipamentos = ['nome', 'acoes'];

  sala = inject<Sala>(MAT_DIALOG_DATA);
  unidade = this.dataService.getUnidadeById(this.sala.unidadeId);
  bloco = this.sala.blocoId ? this.dataService.getBlocoById(this.sala.blocoId) : undefined;
  equipamentos = () => this.dataService.getEquipamentosBySala(this.sala.id);

  editandoEquipamentoId = signal<string | null>(null);
  nomeEquipamento = '';
  patrimonioEquipamento = '';

  novoEquipamento(): void {
    this.editandoEquipamentoId.set('novo');
    this.nomeEquipamento = '';
    this.patrimonioEquipamento = '';
  }

  editarEquipamento(equipamento: Equipamento): void {
    this.editandoEquipamentoId.set(equipamento.id);
    this.nomeEquipamento = equipamento.nome;
    this.patrimonioEquipamento = equipamento.patrimonio ?? '';
  }

  cancelarEquipamento(): void {
    this.editandoEquipamentoId.set(null);
  }

  salvarEquipamento(): void {
    if (!this.nomeEquipamento.trim()) return;

    const id = this.editandoEquipamentoId();
    this.dataService.salvarEquipamento({
      id: id !== 'novo' ? id! : undefined,
      unidadeId: this.sala.unidadeId,
      blocoId: this.sala.blocoId,
      salaId: this.sala.id,
      nome: this.nomeEquipamento.trim(),
      patrimonio: this.patrimonioEquipamento.trim() || undefined
    });
    this.cancelarEquipamento();
  }

  async excluirEquipamento(equipamento: Equipamento): Promise<void> {
    if (!(await this.dialogo.excluir(`Excluir o equipamento ${equipamento.nome}?`, 'Os QR Codes impressos deste equipamento deixam de funcionar.'))) return;
    try {
      await this.dataService.excluirEquipamento(equipamento.id);
    } catch (e) {
      this.feedback.announce(e instanceof Error ? e.message : 'Não foi possível excluir o equipamento.', 'assertive');
    }
  }

  gerarQrCodeEquipamento(equipamento: Equipamento): void {
    this.dialog.open(QrcodeDetalheComponent, {
      panelClass: 'qrcode-dialog',
      data: {
        tipo: 'equipamento',
        id: equipamento.id,
        titulo: equipamento.nome,
        subtitulo: `${this.unidade?.sigla ?? ''} · ${equipamento.nome}`
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
