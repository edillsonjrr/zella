import { Component, computed, inject, signal } from '@angular/core';
import { MatCardModule } from '@angular/material/card';
import { MatTableModule } from '@angular/material/table';
import { MatButtonModule } from '@angular/material/button';
import { MatTabsModule } from '@angular/material/tabs';
import { MatDialog, MatDialogModule } from '@angular/material/dialog';
import { IconComponent } from '../shared/icon/icon.component';
import { FlowButtonComponent } from '../shared/flow-button/flow-button.component';
import { DataService } from '../shared/data.service';
import { QrcodeDetalheComponent } from '../qrcode-detalhe/qrcode-detalhe.component';
import type { Unidade, Bloco, Sala, Equipamento, QrAlvo } from '../shared/models';

@Component({
  selector: 'app-qrcodes',
  imports: [MatCardModule, MatTableModule, MatButtonModule, MatTabsModule, MatDialogModule, IconComponent, FlowButtonComponent],
  templateUrl: './qrcodes.component.html',
  styleUrl: './qrcodes.component.scss'
})
export class QrcodesComponent {
  private dataService = inject(DataService);
  private dialog = inject(MatDialog);

  tabSelecionada = signal(0);

  colunasUnidades: string[] = ['sigla', 'nome', 'acoes'];
  colunasBlocos: string[] = ['nome', 'unidade', 'acoes'];
  colunasSalas: string[] = ['nome', 'localizacao', 'acoes'];
  colunasEquipamentos: string[] = ['nome', 'localizacao', 'acoes'];

  unidades = this.dataService.unidades;
  blocos = this.dataService.blocos;
  salas = this.dataService.salas;
  equipamentos = this.dataService.equipamentos;

  localizacaoSala = computed(() => {
    const mapa = new Map<string, string>();
    for (const sala of this.salas()) {
      const unidade = this.dataService.getUnidadeById(sala.unidadeId);
      const bloco = sala.blocoId ? this.dataService.getBlocoById(sala.blocoId) : undefined;
      mapa.set(sala.id, [unidade?.sigla, bloco?.nome].filter(Boolean).join(' · '));
    }
    return mapa;
  });

  localizacaoEquipamento = computed(() => {
    const mapa = new Map<string, string>();
    for (const equipamento of this.equipamentos()) {
      const unidade = this.dataService.getUnidadeById(equipamento.unidadeId);
      const sala = this.dataService.getSalaById(equipamento.salaId);
      mapa.set(equipamento.id, [unidade?.sigla, sala?.nome].filter(Boolean).join(' · '));
    }
    return mapa;
  });

  nomeUnidade(unidadeId: string): string {
    return this.dataService.getUnidadeById(unidadeId)?.sigla ?? '—';
  }

  gerarQrCodeUnidade(unidade: Unidade): void {
    this.abrirDialog({ tipo: 'unidade', id: unidade.id, titulo: unidade.nome, subtitulo: unidade.sigla });
  }

  gerarQrCodeBloco(bloco: Bloco): void {
    const unidade = this.dataService.getUnidadeById(bloco.unidadeId);
    this.abrirDialog({
      tipo: 'bloco',
      id: bloco.id,
      titulo: bloco.nome,
      subtitulo: [unidade?.sigla, bloco.nome].filter(Boolean).join(' · ')
    });
  }

  gerarQrCodeSala(sala: Sala): void {
    const unidade = this.dataService.getUnidadeById(sala.unidadeId);
    this.abrirDialog({
      tipo: 'sala',
      id: sala.id,
      titulo: sala.nome,
      subtitulo: [unidade?.sigla, sala.nome].filter(Boolean).join(' · ')
    });
  }

  gerarQrCodeEquipamento(equipamento: Equipamento): void {
    const unidade = this.dataService.getUnidadeById(equipamento.unidadeId);
    this.abrirDialog({
      tipo: 'equipamento',
      id: equipamento.id,
      titulo: equipamento.nome,
      subtitulo: [unidade?.sigla, equipamento.nome].filter(Boolean).join(' · ')
    });
  }

  private abrirDialog(alvo: QrAlvo): void {
    this.dialog.open(QrcodeDetalheComponent, {
      panelClass: 'qrcode-dialog',
      data: alvo,
      position: { right: '0', top: '0' },
      height: '100vh',
      width: '380px',
      maxWidth: '100vw'
    });
  }
}
