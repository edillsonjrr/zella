import { Component, inject, signal } from '@angular/core';
import { MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { IconComponent } from '../shared/icon/icon.component';
import { FlowButtonComponent } from '../shared/flow-button/flow-button.component';
import { SpinnerComponent } from '../shared/spinner/spinner.component';
import { DataService } from '../shared/data.service';
import { UiFeedbackService } from '../shared/ui-feedback.service';
import { baixarArquivo } from '../shared/pdf/documento-pdf';
import { conferirPlanilhaEquipamentos, modeloCsv, MAX_LINHAS, type ConferenciaImportacao } from '../shared/importar-equipamentos';
import { rotuloPatrimonio } from '../shared/rotulos';

/**
 * "Importar planilha" da tela Equipamentos (Z3.1).
 *
 *   1. baixa o modelo CSV;
 *   2. escolhe o arquivo preenchido;
 *   3. confere linha a linha (nada é gravado ainda);
 *   4. grava pelo mesmo caminho do cadastro manual.
 *
 * Com erro em qualquer linha, nada é gravado: corrigir na planilha e
 * escolher de novo evita equipamento em dobro numa segunda importação.
 * Fecha com o número de equipamentos gravados.
 */
@Component({
  selector: 'app-importar-equipamentos-dialog',
  imports: [MatDialogModule, IconComponent, FlowButtonComponent, SpinnerComponent],
  template: `
    <div class="imp">
      <div class="imp-cabecalho">
        <div class="imp-icone"><app-icon name="upload_file" aria-hidden="true"></app-icon></div>
        <div>
          <h2 class="imp-titulo">Importar equipamentos por planilha</h2>
          <p class="imp-sub">Baixe o modelo, preencha no Excel e salve como CSV. Nada é gravado antes da sua conferência.</p>
        </div>
      </div>

      <ol class="imp-passos">
        <li>
          <button type="button" class="imp-link" (click)="baixarModelo()">
            <app-icon name="download" aria-hidden="true"></app-icon> Baixar o modelo
          </button>
          <span class="imp-ajuda">Uma linha por equipamento. Colunas: unidade (o nome que aparece em Unidades), bloco (opcional), sala, nome, patrimônio, fabricante e modelo (opcionais). Bloco e sala que ainda não existem são criados.</span>
        </li>
        <li>
          <label class="imp-arquivo" [class.imp-arquivo--desligado]="gravando()">
            <input type="file" accept=".csv,text/csv,text/plain" class="sr-only" (change)="escolher($event)" [disabled]="gravando()" />
            <app-icon name="table_chart" aria-hidden="true"></app-icon>
            <span>{{ arquivo() ? 'Trocar o arquivo (' + arquivo() + ')' : 'Escolher o arquivo CSV' }}</span>
          </label>
        </li>
      </ol>

      @if (conferencia(); as c) {
        @if (c.erroGeral) {
          <p class="imp-erro" role="alert"><app-icon name="warning" aria-hidden="true"></app-icon> {{ c.erroGeral }}</p>
        } @else {
          <div class="imp-resumo" aria-live="polite">
            <span><strong>{{ c.linhas.length }}</strong> {{ c.linhas.length === 1 ? 'linha' : 'linhas' }}</span>
            <span class="imp-tag imp-tag--ok">{{ c.linhas.length - c.comErro }} {{ c.linhas.length - c.comErro === 1 ? 'pronta' : 'prontas' }}</span>
            @if (c.comAviso) { <span class="imp-tag imp-tag--aviso">{{ c.comAviso }} com aviso</span> }
            @if (c.comErro) { <span class="imp-tag imp-tag--erro">{{ c.comErro }} com erro</span> }
            @if (c.blocosNovos.length || c.salasNovas.length) {
              <span class="imp-novos">Serão criados {{ textoNovos(c) }}.</span>
            }
          </div>

          <div class="imp-tabela" role="region" aria-label="Conferência da planilha" tabindex="0">
            <table>
              <thead>
                <tr><th>Linha</th><th>Equipamento</th><th>Onde fica</th><th>Conferência</th></tr>
              </thead>
              <tbody>
                @for (l of c.linhas; track l.linha) {
                  <tr [class]="'imp-linha--' + l.situacao">
                    <td class="imp-num">{{ l.linha }}</td>
                    <td>
                      <strong>{{ l.nome || '(sem nome)' }}</strong>
                      @if (l.patrimonio) { <span class="imp-meta">{{ patrimonio(l.patrimonio) }}</span> }
                      @if (l.fabricante || l.modelo) { <span class="imp-meta">{{ juntar(l.fabricante, l.modelo) }}</span> }
                    </td>
                    <td>{{ juntar(l.unidadeNome || l.unidade, l.bloco, l.sala) }}</td>
                    <td>
                      @for (e of l.erros; track e) { <span class="imp-msg imp-msg--erro">{{ e }}</span> }
                      @for (a of l.avisos; track a) { <span class="imp-msg imp-msg--aviso">{{ a }}</span> }
                      @if (l.situacao === 'ok') { <span class="imp-msg imp-msg--ok">Pronta</span> }
                    </td>
                  </tr>
                }
              </tbody>
            </table>
          </div>

          @if (c.comErro) {
            <p class="imp-erro" role="alert">
              <app-icon name="warning" aria-hidden="true"></app-icon>
              {{ c.comErro === 1 ? 'Há 1 linha com erro' : 'Há ' + c.comErro + ' linhas com erro' }}. Corrija na planilha e escolha o arquivo de novo. Nada foi gravado.
            </p>
          }
        }
      }

      @if (erro()) {
        <p class="imp-erro" role="alert"><app-icon name="warning" aria-hidden="true"></app-icon> {{ erro() }}</p>
      }

      <div class="imp-acoes">
        <app-flow-button variant="secondary" type="button" [disabled]="gravando()" (click)="ref.close(0)">Voltar</app-flow-button>
        <app-flow-button type="button" [disabled]="!podeGravar || gravando()" (click)="gravar()">
          @if (gravando()) {
            <app-spinner size="sm" label="Gravando"></app-spinner> Gravando {{ progresso() }}…
          } @else {
            <app-icon class="btn-icon" name="save" aria-hidden="true"></app-icon> {{ rotuloGravar }}
          }
        </app-flow-button>
      </div>
    </div>
  `,
  styles: `
    .imp { padding: 20px 22px 18px; background: var(--bg-tertiary); color: var(--text-primary); border-radius: var(--card-radius); }
    .imp-cabecalho { display: flex; gap: 12px; align-items: flex-start; margin-bottom: 12px; }
    .imp-icone { width: 40px; height: 40px; border-radius: 12px; background: var(--primary-50); color: var(--primary-500); display: flex; align-items: center; justify-content: center; flex-shrink: 0; }
    .imp-titulo { margin: 0; font-size: 1rem; font-weight: 600; }
    .imp-sub { margin: 2px 0 0; font-size: 0.8rem; color: var(--text-secondary); }
    .imp-passos { margin: 0 0 12px; padding-left: 20px; display: flex; flex-direction: column; gap: 10px; font-size: 0.8125rem; }
    .imp-passos li { display: flex; flex-direction: column; gap: 4px; }
    .imp-link { align-self: flex-start; display: inline-flex; align-items: center; gap: 6px; padding: 0; border: 0; background: none; color: var(--primary-400); font: inherit; font-weight: 600; cursor: pointer; text-decoration: underline; }
    .imp-ajuda { color: var(--text-secondary); font-size: 0.75rem; }
    .imp-arquivo { align-self: flex-start; display: inline-flex; align-items: center; gap: 8px; min-height: 44px; padding: 8px 14px; border: 1px dashed var(--primary-500); border-radius: var(--button-radius); background: var(--primary-50); color: var(--primary-400); font-weight: 600; cursor: pointer; }
    .imp-arquivo:focus-within { outline: 2px solid var(--primary-500); outline-offset: 2px; }
    .imp-arquivo--desligado { opacity: 0.6; cursor: default; }
    .imp-resumo { display: flex; flex-wrap: wrap; align-items: center; gap: 8px; margin-bottom: 8px; font-size: 0.8125rem; }
    .imp-tag { padding: 2px 8px; border-radius: 999px; font-size: 0.75rem; font-weight: 600; }
    .imp-tag--ok { background: var(--success-50, var(--bg-elevated)); color: var(--success-500); }
    .imp-tag--aviso { background: var(--warning-50, var(--bg-elevated)); color: var(--warning-600, var(--warning-500)); }
    .imp-tag--erro { background: var(--danger-50, var(--bg-elevated)); color: var(--danger-500); }
    .imp-novos { color: var(--text-secondary); }
    .imp-tabela { max-height: 46vh; overflow: auto; border: 1px solid var(--border-default); border-radius: var(--button-radius); }
    .imp-tabela table { width: 100%; border-collapse: collapse; font-size: 0.78rem; }
    .imp-tabela th { position: sticky; top: 0; background: var(--bg-elevated); text-align: left; padding: 6px 8px; font-weight: 600; color: var(--text-secondary); }
    .imp-tabela td { padding: 6px 8px; border-top: 1px solid var(--border-default); vertical-align: top; overflow-wrap: anywhere; }
    .imp-num { color: var(--text-tertiary); font-variant-numeric: tabular-nums; }
    .imp-meta { display: block; color: var(--text-tertiary); font-size: 0.75rem; }
    .imp-msg { display: block; }
    .imp-msg--erro { color: var(--danger-500); font-weight: 600; }
    .imp-msg--aviso { color: var(--warning-600, var(--warning-500)); }
    .imp-msg--ok { color: var(--success-500); }
    .imp-linha--erro td { background: var(--danger-50, transparent); }
    .imp-erro { display: flex; gap: 8px; align-items: flex-start; margin: 10px 0 0; padding: 10px 12px; border-radius: var(--button-radius); background: var(--danger-50, var(--bg-elevated)); color: var(--danger-500); font-size: 0.8rem; }
    .imp-acoes { display: flex; justify-content: flex-end; gap: 8px; margin-top: 14px; }
    .sr-only { position: absolute; width: 1px; height: 1px; overflow: hidden; clip: rect(0 0 0 0); }
    @media (max-width: 480px) {
      .imp { padding: 16px; }
      .imp-acoes { flex-direction: column-reverse; }
      .imp-acoes app-flow-button { width: 100%; }
    }
  `
})
export class ImportarEquipamentosDialogComponent {
  readonly ref = inject(MatDialogRef<ImportarEquipamentosDialogComponent, number>);
  private readonly dataService = inject(DataService);
  private readonly feedback = inject(UiFeedbackService);

  arquivo = signal('');
  conferencia = signal<ConferenciaImportacao | null>(null);
  gravando = signal(false);
  progresso = signal('');
  erro = signal('');

  readonly patrimonio = rotuloPatrimonio;

  juntar(...partes: (string | undefined)[]): string {
    return partes.filter(Boolean).join(' · ');
  }

  get validas(): number {
    const c = this.conferencia();
    return c ? c.linhas.length - c.comErro : 0;
  }

  get podeGravar(): boolean {
    const c = this.conferencia();
    return !!c && !c.erroGeral && !c.comErro && c.linhas.length > 0;
  }

  get rotuloGravar(): string {
    const n = this.validas;
    if (!this.podeGravar) return 'Gravar equipamentos';
    return n === 1 ? 'Gravar 1 equipamento' : `Gravar ${n} equipamentos`;
  }

  textoNovos(c: ConferenciaImportacao): string {
    const partes: string[] = [];
    if (c.blocosNovos.length) partes.push(c.blocosNovos.length === 1 ? '1 bloco' : `${c.blocosNovos.length} blocos`);
    if (c.salasNovas.length) partes.push(c.salasNovas.length === 1 ? '1 sala' : `${c.salasNovas.length} salas`);
    return partes.join(' e ');
  }

  baixarModelo(): void {
    const unidade = this.dataService.unidades()[0]?.nome;
    baixarArquivo(new Blob([modeloCsv(unidade)], { type: 'text/csv;charset=utf-8' }), 'modelo-importacao-equipamentos.csv');
  }

  async escolher(evento: Event): Promise<void> {
    const input = evento.target as HTMLInputElement;
    const arquivo = input.files?.[0];
    input.value = '';
    if (!arquivo) return;
    this.erro.set('');
    if (arquivo.size > 5 * 1024 * 1024) {
      this.conferencia.set(null);
      this.erro.set(`O arquivo tem mais de 5 MB. Divida em arquivos de até ${MAX_LINHAS} linhas.`);
      return;
    }
    if (/\.(xlsx?|ods)$/i.test(arquivo.name)) {
      this.conferencia.set(null);
      this.erro.set('Este arquivo é do Excel, não CSV. No Excel, use "Salvar como" e escolha "CSV UTF-8 (separado por vírgulas)".');
      return;
    }
    this.arquivo.set(arquivo.name);
    try {
      const texto = await arquivo.text();
      const ds = this.dataService;
      this.conferencia.set(
        conferirPlanilhaEquipamentos(texto, {
          unidades: ds.unidades(),
          blocos: ds.blocos(),
          salas: ds.salas(),
          equipamentos: ds.equipamentos()
        })
      );
    } catch {
      this.conferencia.set(null);
      this.erro.set('Não foi possível ler o arquivo. Salve de novo como CSV e tente outra vez.');
    }
  }

  /**
   * Grava na ordem que as referências pedem: blocos novos, salas novas,
   * equipamentos. Tudo pelo DataService, como o cadastro manual: mesmas
   * regras do Firestore e um registro no histórico por item.
   */
  async gravar(): Promise<void> {
    const c = this.conferencia();
    if (!c || !this.podeGravar || this.gravando()) return;
    const ds = this.dataService;
    this.erro.set('');
    this.gravando.set(true);
    this.ref.disableClose = true;
    let gravados = 0;
    try {
      const idBloco = new Map<string, string>();
      for (const b of c.blocosNovos) {
        this.progresso.set(`os blocos`);
        idBloco.set(b.chave, await ds.salvarBloco({ unidadeId: b.unidadeId, nome: b.nome }));
      }
      const idSala = new Map<string, string>();
      for (const s of c.salasNovas) {
        this.progresso.set(`as salas`);
        const blocoId = s.blocoId ?? (s.chaveBlocoNovo ? idBloco.get(s.chaveBlocoNovo) : undefined);
        idSala.set(s.chave, await ds.salvarSala({ unidadeId: s.unidadeId, blocoId, nome: s.nome }));
      }

      const linhas = c.linhas.filter(l => l.situacao !== 'erro');
      const LOTE = 20;
      for (let i = 0; i < linhas.length; i += LOTE) {
        this.progresso.set(`${Math.min(i + LOTE, linhas.length)} de ${linhas.length}`);
        await Promise.all(
          linhas.slice(i, i + LOTE).map(async l => {
            const salaId = l.salaId ?? (l.chaveSalaNova ? idSala.get(l.chaveSalaNova) : undefined);
            const sala = salaId ? ds.getSalaById(salaId) : undefined;
            const blocoId = sala?.blocoId ?? l.blocoId ?? (l.chaveBlocoNovo ? idBloco.get(l.chaveBlocoNovo) : undefined);
            if (!salaId || !l.unidadeId) throw new Error(`Linha ${l.linha}: sala não encontrada.`);
            await ds.salvarEquipamento({
              unidadeId: l.unidadeId,
              blocoId,
              salaId,
              nome: l.nome,
              patrimonio: l.patrimonio || undefined,
              fabricante: l.fabricante || undefined,
              modelo: l.modelo || undefined
            });
            gravados++;
          })
        );
      }
      this.feedback.sucesso(gravados === 1 ? '1 equipamento importado.' : `${gravados} equipamentos importados.`);
      this.ref.close(gravados);
    } catch (e) {
      this.erro.set(
        `${gravados ? `${gravados} de ${this.validas} equipamentos foram gravados antes do erro. ` : ''}` +
        `${e instanceof Error && e.message.startsWith('Linha') ? e.message : 'Não foi possível gravar. Confira a internet e tente de novo.'}`
      );
    } finally {
      this.gravando.set(false);
      this.ref.disableClose = false;
    }
  }
}
