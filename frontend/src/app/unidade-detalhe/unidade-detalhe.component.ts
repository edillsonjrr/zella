import { Component, Inject, inject, signal } from '@angular/core';
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
import { QrcodeDetalheComponent } from '../qrcode-detalhe/qrcode-detalhe.component';
import { BlocoDetalheComponent } from '../bloco-detalhe/bloco-detalhe.component';
import { SalaDetalheComponent } from '../sala-detalhe/sala-detalhe.component';
import type { Unidade, Bloco, Sala } from '../shared/models';

@Component({
  selector: 'app-unidade-detalhe',
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
  templateUrl: './unidade-detalhe.component.html',
  styleUrl: './unidade-detalhe.component.scss'
})
export class UnidadeDetalheComponent {
  private dataService = inject(DataService);
  private dialog = inject(MatDialog);
  private dialogRef = inject(MatDialogRef<UnidadeDetalheComponent>);

  colunasBlocos = ['nome', 'acoes'];
  colunasSalas = ['nome', 'acoes'];

  blocos = () => this.dataService.getBlocosByUnidade(this.unidade.id);
  salas = () => this.dataService.getSalasByUnidade(this.unidade.id);

  editandoBlocoId = signal<string | null>(null);
  nomeBloco = '';

  editandoSalaId = signal<string | null>(null);
  nomeSala = '';

  constructor(@Inject(MAT_DIALOG_DATA) public unidade: Unidade) {}

  novoBloco(): void {
    this.editandoBlocoId.set('novo');
    this.nomeBloco = '';
  }

  editarBloco(bloco: Bloco): void {
    this.editandoBlocoId.set(bloco.id);
    this.nomeBloco = bloco.nome;
  }

  cancelarBloco(): void {
    this.editandoBlocoId.set(null);
  }

  salvarBloco(): void {
    if (!this.nomeBloco.trim()) return;

    const id = this.editandoBlocoId();
    this.dataService.salvarBloco({
      id: id !== 'novo' ? id! : undefined,
      unidadeId: this.unidade.id,
      nome: this.nomeBloco.trim()
    });
    this.cancelarBloco();
  }

  excluirBloco(bloco: Bloco): void {
    if (confirm(`Excluir o bloco ${bloco.nome}? As salas ficam soltas na unidade.`)) {
      this.dataService.excluirBloco(bloco.id);
    }
  }

  gerenciarSalasDoBloco(bloco: Bloco): void {
    this.dialog.open(BlocoDetalheComponent, {
      panelClass: 'bloco-detalhe-dialog',
      data: bloco,
      position: { right: '0', top: '0' },
      height: '100vh',
      width: '360px',
      maxWidth: '100vw'
    });
  }

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
      unidadeId: this.unidade.id,
      nome: this.nomeSala.trim()
    });
    this.cancelarSala();
  }

  excluirSala(sala: Sala): void {
    if (confirm(`Excluir a sala ${sala.nome}? Os equipamentos dela também serão removidos.`)) {
      this.dataService.excluirSala(sala.id);
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

  gerarQrCodeBloco(bloco: Bloco): void {
    this.abrirQrCode({
      tipo: 'bloco',
      id: bloco.id,
      titulo: bloco.nome,
      subtitulo: `${this.unidade.sigla} · ${bloco.nome}`
    });
  }

  gerarQrCodeSala(sala: Sala): void {
    this.abrirQrCode({
      tipo: 'sala',
      id: sala.id,
      titulo: sala.nome,
      subtitulo: `${this.unidade.sigla} · ${sala.nome}`
    });
  }

  private abrirQrCode(alvo: { tipo: 'bloco' | 'sala'; id: string; titulo: string; subtitulo: string }): void {
    this.dialog.open(QrcodeDetalheComponent, {
      panelClass: 'qrcode-dialog',
      data: alvo,
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
