import { Component, inject } from '@angular/core';
import { IconComponent } from '../shared/icon/icon.component';
import { FlowButtonComponent } from '../shared/flow-button/flow-button.component';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { MatCardModule } from '@angular/material/card';
import { MatButtonModule } from '@angular/material/button';
import { MatTableModule } from '@angular/material/table';
import { MatDividerModule } from '@angular/material/divider';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { UiFeedbackService } from '../shared/ui-feedback.service';

interface LinhaImportacao {
  linha: number;
  contrato: string;
  fornecedor: string;
  vigenciaInicio: string;
  vigenciaFim: string;
  item: string;
  quantidade: number;
  status: 'valido' | 'invalido';
  erro?: string;
}

@Component({
  selector: 'app-importar-contratos',
  imports: [
    FormsModule,
    RouterLink,
    MatCardModule,
    MatButtonModule,
    IconComponent,
    FlowButtonComponent,
    MatTableModule,
    MatDividerModule,
    MatProgressBarModule
  ],
  templateUrl: './importar-contratos.component.html',
  styleUrl: './importar-contratos.component.scss'
})
export class ImportarContratosComponent {
  private readonly feedback = inject(UiFeedbackService);
  arquivoNome: string | null = null;
  importando = false;
  previewVisible = false;
  importacaoConcluida = false;

  colunasPreview: string[] = ['linha', 'contrato', 'fornecedor', 'vigencia', 'item', 'quantidade', 'status'];

  linhas: LinhaImportacao[] = [
    { linha: 2, contrato: 'CTR-2026-004', fornecedor: 'Segurança Patrimonial', vigenciaInicio: '01/04/2026', vigenciaFim: '31/03/2027', item: 'Manutenção de câmeras', quantidade: 24, status: 'valido' },
    { linha: 3, contrato: 'CTR-2026-004', fornecedor: 'Segurança Patrimonial', vigenciaInicio: '01/04/2026', vigenciaFim: '31/03/2027', item: 'Troca de DVR', quantidade: 2, status: 'valido' },
    { linha: 4, contrato: 'CTR-2026-005', fornecedor: 'Pintura Geral', vigenciaInicio: '', vigenciaFim: '30/06/2026', item: 'Pintura externa', quantidade: 0, status: 'invalido', erro: 'Vigência de início e quantidade são obrigatórios' }
  ];

  get validas(): number {
    return this.linhas.filter(l => l.status === 'valido').length;
  }

  get invalidas(): number {
    return this.linhas.filter(l => l.status === 'invalido').length;
  }

  onArquivoSelecionado(event: Event): void {
    const input = event.target as HTMLInputElement;
    if (input.files && input.files[0]) {
      this.arquivoNome = input.files[0].name;
      this.importacaoConcluida = false;
      this.simularLeitura();
    }
  }

  simularLeitura(): void {
    this.importando = true;
    this.previewVisible = false;
    setTimeout(() => {
      this.importando = false;
      this.previewVisible = true;
      this.feedback.announce(`Planilha lida. ${this.validas} linhas válidas e ${this.invalidas} linhas com erro.`);
    }, 1200);
  }

  baixarModelo(): void {
    const csv = 'contrato;fornecedor;vigencia_inicio;vigencia_fim;item;quantidade\nCTR-2026-004;Segurança Patrimonial;01/04/2026;31/03/2027;Manutenção de câmeras;24';
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'modelo_importacao_contratos.csv';
    a.click();
    URL.revokeObjectURL(url);
  }

  confirmarImportacao(): void {
    if (this.invalidas > 0) return;
    // TODO: integrar com API de importação
    this.importacaoConcluida = true;
    this.previewVisible = false;
    this.feedback.announce('Importação concluída com sucesso.');
  }
}
