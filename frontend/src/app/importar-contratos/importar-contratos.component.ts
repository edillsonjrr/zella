import { plural } from '../../../../shared/historico';
import { CurrencyPipe, DatePipe } from '@angular/common';
import { Component, inject, signal } from '@angular/core';
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
import { DataService } from '../shared/data.service';
import { lerContratoPdf, paraCsvImportacao, LeituraPdf } from '../shared/pdf-contrato';

// Linha da prévia: o que a pessoa vê antes de confirmar. O texto vem do CSV
// como está; quem valida é o backend (validarImportacaoContratos), e o erro
// dele é casado com a linha pelo número.
interface LinhaImportacao {
  linha: number;
  contrato: string;
  fornecedor: string;
  vigenciaInicio: string;
  vigenciaFim: string;
  item: string;
  quantidade: string;
  status: 'valido' | 'invalido';
  erro?: string;
}

const CABECALHO_MODELO = 'contrato;fornecedor;vigencia_inicio;vigencia_fim;item;quantidade;unidade;preco_unitario';

@Component({
  selector: 'app-importar-contratos',
  imports: [
    CurrencyPipe,
    DatePipe,
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
  readonly plural = plural;

  private readonly feedback = inject(UiFeedbackService);
  private readonly dataService = inject(DataService);

  arquivoNome: string | null = null;
  csv = '';
  /** De onde vieram as linhas: planilha ou contrato em PDF. */
  origem: 'csv' | 'pdf' = 'csv';
  lendoPdf = false;
  leitura: LeituraPdf | null = null;
  /**
   * Cabecalho editavel. O PDF preenche o que conseguiu ler; o que ficou em
   * branco (ou saiu errado) a pessoa corrige aqui antes de importar, e o CSV
   * e refeito a partir disso.
   */
  cab = { numero: '', fornecedor: '', vigenciaInicio: '', vigenciaFim: '' };
  /**
   * Prorrogação de contrato que já existe no Zella. Nesse caso importar
   * duplicaria: o certo e registrar um aditivo de vigencia, que e o que o
   * próprio documento diz ("renovação do saldo integral dos quantitativos").
   */
  contratoExistenteId: string | null = null;
  aditivando = false;
  aditivoNumero: number | null = null;
  importando = false;
  previewVisible = false;
  importacaoConcluida = false;
  resultado: { contratosCriados: number; itensCriados: number } | null = null;

  colunasPreview: string[] = ['linha', 'contrato', 'fornecedor', 'vigencia', 'item', 'quantidade', 'status'];

  linhas: LinhaImportacao[] = [];
  // Problemas que não são de uma linha específica: contrato já cadastrado,
  // arquivo vazio, falha da chamada.
  errosGerais: string[] = [];
  // Fornecedores que não casaram com nenhuma empresa contratada: importa
  // mesmo assim, mas o gestor precisa ligar depois.
  fornecedoresSemCadastro: string[] = [];
  erroImportacao = signal('');

  get validas(): number {
    return this.linhas.filter(l => l.status === 'valido').length;
  }

  get invalidas(): number {
    return this.linhas.filter(l => l.status === 'invalido').length;
  }

  get podeConfirmar(): boolean {
    return this.previewVisible && !this.importando && this.linhas.length > 0 && this.invalidas === 0 && this.errosGerais.length === 0;
  }

  async onArquivoSelecionado(event: Event): Promise<void> {
    const input = event.target as HTMLInputElement;
    const arquivo = input.files?.[0];
    if (!arquivo) return;

    this.arquivoNome = arquivo.name;
    this.importacaoConcluida = false;
    this.resultado = null;
    this.erroImportacao.set('');
    this.leitura = null;
    this.contratoExistenteId = null;
    this.aditivoNumero = null;
    // Permite escolher o mesmo arquivo de novo depois de corrigi-lo.
    input.value = '';

    const ehPdf = /\.pdf$/i.test(arquivo.name) || arquivo.type === 'application/pdf';
    if (ehPdf) {
      this.origem = 'pdf';
      this.lendoPdf = true;
      this.previewVisible = false;
      try {
        this.leitura = await lerContratoPdf(arquivo);
        const c = this.leitura.cabecalho;
        this.cab = {
          numero: c.numero,
          fornecedor: c.fornecedor,
          vigenciaInicio: c.vigenciaInicio,
          vigenciaFim: c.vigenciaFim
        };
        this.csv = paraCsvImportacao(this.leitura, { ...c, ...this.cab });
      } catch (e) {
        this.errosGerais = [e instanceof Error ? e.message : 'Não foi possível ler o PDF.'];
        this.previewVisible = true;
        this.lendoPdf = false;
        return;
      } finally {
        this.lendoPdf = false;
      }
    } else {
      this.origem = 'csv';
      this.csv = await arquivo.text();
    }

    await this.validar();
  }

  private async validar(): Promise<void> {
    this.importando = true;
    this.previewVisible = false;
    this.errosGerais = [];
    this.fornecedoresSemCadastro = [];

    this.linhas = this.montarPrevia(this.csv);

    try {
      const r = await this.dataService.validarImportacaoContratos(this.csv);
      const porLinha = new Map<number, string[]>();
      // O servidor escreve a frase para vir depois de "linha 3:"; sozinha,
      // ela começa com maiúscula.
      const frase = (m: string) => m.charAt(0).toUpperCase() + m.slice(1);
      for (const e of r.erros) {
        if (e.linha === 0) {
          this.errosGerais.push(frase(e.mensagem));
          continue;
        }
        porLinha.set(e.linha, [...(porLinha.get(e.linha) ?? []), frase(e.mensagem)]);
      }
      for (const l of this.linhas) {
        const erros = porLinha.get(l.linha);
        l.status = erros ? 'invalido' : 'valido';
        l.erro = erros?.join(' ');
      }
      // Erro de linha que não achou linha na prévia (não deveria acontecer,
      // mas não pode sumir).
      for (const [linha, msgs] of porLinha) {
        if (!this.linhas.some(l => l.linha === linha)) this.errosGerais.push(`Linha ${linha}: ${msgs.join(' ')}`);
      }
      if (r.contratosExistentes.length) {
        // Vindo de PDF de prorrogação, "já existe" não é erro: é o caso de
        // aditivo. A tela oferece o caminho certo em vez de barrar.
        const existente = this.dataService.contratos().find(c => r.contratosExistentes.includes(c.numero));
        this.contratoExistenteId = existente?.id ?? null;
        this.errosGerais.push(
          this.origem === 'pdf' && this.leitura?.cabecalho.ehProrrogacao && this.contratoExistenteId
            ? `O contrato ${r.contratosExistentes.join(', ')} já existe. Como este documento é uma prorrogação, registre um aditivo de vigência em vez de importar de novo.`
            : `${r.contratosExistentes.length === 1 ? 'Este contrato já está cadastrado' : 'Estes contratos já estão cadastrados'}: ${r.contratosExistentes.join(', ')}. Tire da planilha ou use outro número; para mudar um contrato que já existe, use um aditivo.`
        );
        // Marca as linhas do contrato repetido, pra pessoa achar na prévia.
        for (const l of this.linhas) {
          if (r.contratosExistentes.includes(l.contrato)) {
            l.status = 'invalido';
            l.erro = [l.erro, 'contrato já cadastrado.'].filter(Boolean).join(' ');
          }
        }
      }
      this.fornecedoresSemCadastro = r.fornecedoresSemCadastro;
      if (!this.linhas.length && !this.errosGerais.length) {
        this.errosGerais.push('Nenhuma linha de dados encontrada na planilha.');
      }
      this.feedback.announce(`Planilha lida. ${this.validas} linhas válidas e ${this.invalidas} com erro.`);
    } catch (e) {
      this.errosGerais.push(e instanceof Error ? e.message : 'Não foi possível validar a planilha.');
    } finally {
      this.importando = false;
      this.previewVisible = true;
    }
  }

  /** Refaz o CSV com o cabecalho corrigido a mao e valida de novo. */
  async aplicarCabecalho(): Promise<void> {
    if (!this.leitura) return;
    this.csv = paraCsvImportacao(this.leitura, { ...this.leitura.cabecalho, ...this.cab });
    await this.validar();
  }

  /** Total do que foi lido, para conferir contra o valor impresso no PDF. */
  get somaLida(): number {
    return this.leitura?.somaCalculada ?? 0;
  }

  get ehProrrogacaoDeExistente(): boolean {
    return this.origem === 'pdf' && !!this.leitura?.cabecalho.ehProrrogacao && !!this.contratoExistenteId;
  }

  /**
   * Prorrogacao so estende a vigencia: o documento mantem quantidades e
   * precos ("renovacao do saldo integral/remanescente"). Por isso o aditivo
   * vai sem itens -- no backend, item que nao aparece fica como esta.
   */
  async registrarAditivo(): Promise<void> {
    if (!this.contratoExistenteId || !this.cab.vigenciaFim) return;
    this.aditivando = true;
    this.erroImportacao.set('');
    try {
      this.aditivoNumero = await this.dataService.aditivarContrato({
        contratoId: this.contratoExistenteId,
        motivo: `Prorrogação de vigência importada de ${this.arquivoNome ?? 'PDF'}`,
        novaVigenciaFim: this.cab.vigenciaFim
      });
      this.previewVisible = false;
      this.importacaoConcluida = true;
    } catch (e) {
      this.erroImportacao.set(e instanceof Error ? e.message : 'Não foi possível registrar o aditivo.');
    } finally {
      this.aditivando = false;
    }
  }

  // Só quebra o texto em colunas pra mostrar; nenhuma regra aqui, pra não
  // divergir do backend.
  private montarPrevia(csv: string): LinhaImportacao[] {
    const registros = csv.replace(/^﻿/, '').split(/\r?\n/).map(l => l.trim()).filter(Boolean);
    if (!registros.length) return [];
    const temCabecalho = registros[0].toLowerCase().startsWith('contrato');
    const dados = temCabecalho ? registros.slice(1) : registros;
    return dados.map((linha, i) => {
      const [contrato = '', fornecedor = '', vigenciaInicio = '', vigenciaFim = '', item = '', quantidade = ''] =
        linha.split(';').map(c => c.trim());
      return { linha: i + (temCabecalho ? 2 : 1), contrato, fornecedor, vigenciaInicio, vigenciaFim, item, quantidade, status: 'valido' };
    });
  }

  baixarModelo(): void {
    const csv = `${CABECALHO_MODELO}\nCTR-2026-004;Segurança Patrimonial;01/04/2026;31/03/2027;Manutenção de câmeras;24;un;180,00\nCTR-2026-004;Segurança Patrimonial;01/04/2026;31/03/2027;Troca de DVR;2;un;950,00`;
    const blob = new Blob([`﻿${csv}`], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'modelo_importacao_contratos.csv';
    a.click();
    URL.revokeObjectURL(url);
  }

  async confirmarImportacao(): Promise<void> {
    if (!this.podeConfirmar) return;
    this.importando = true;
    this.erroImportacao.set('');
    try {
      this.resultado = await this.dataService.importarContratos(this.csv);
      this.importacaoConcluida = true;
      this.previewVisible = false;
    } catch (e) {
      this.erroImportacao.set(e instanceof Error ? e.message : 'Não foi possível importar.');
    } finally {
      this.importando = false;
    }
  }
}
