import { Component, computed, inject, signal } from '@angular/core';
import { CurrencyPipe, DatePipe } from '@angular/common';
import { MAT_DIALOG_DATA, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { urlDoArquivo } from '../shared/arquivos';
import { IconComponent } from '../shared/icon/icon.component';
import { FlowButtonComponent } from '../shared/flow-button/flow-button.component';
import { SpinnerComponent } from '../shared/spinner/spinner.component';
import { DataService } from '../shared/data.service';
import { custoDoServico, linhasDoServico, type LinhaServico } from '../shared/servico-os';
import type { Chamado } from '../shared/models';

/**
 * Encerrar o chamado com o resumo à vista: OS, técnico, o que ele escreveu,
 * itens usados e custo. Antes encerrava às cegas, sem confirmação. A janela
 * faz o encerramento e só fecha quando deu certo; fecha com `true`.
 */
@Component({
  selector: 'app-encerrar-chamado-dialog',
  imports: [CurrencyPipe, DatePipe, MatDialogModule, IconComponent, FlowButtonComponent, SpinnerComponent],
  template: `
    <div class="enc">
      <div class="enc-cabecalho">
        <div class="enc-icone"><app-icon name="task_alt" aria-hidden="true"></app-icon></div>
        <div>
          <h2 class="enc-titulo">Encerrar o chamado {{ chamado.numero }}?</h2>
          <p class="enc-sub">Confira o serviço antes. Depois de encerrado, o pedido aparece como concluído para quem pediu.</p>
        </div>
      </div>

      <dl class="enc-dados">
        <div><dt>Equipamento</dt><dd>{{ chamado.equipamento }}</dd></div>
        <div><dt>Ordem de serviço</dt><dd>{{ os()?.numero ?? 'Sem OS' }}</dd></div>
        <div><dt>Técnico</dt><dd>{{ tecnico() }}</dd></div>
        @if (os()?.dataExecucao) {
          <div><dt>Feito em</dt><dd>{{ os()!.dataExecucao | date:'dd/MM/yyyy' }}</dd></div>
        }
        <div class="enc-dados--largo">
          <dt>Observação do técnico</dt>
          <dd>{{ os()?.observacaoExecucao || 'O técnico não escreveu observação.' }}</dd>
        </div>
      </dl>

      @if (linhas().length) {
        <div class="enc-itens">
          <span class="enc-itens-titulo">Itens usados</span>
          @for (l of linhas(); track $index) {
            <div class="enc-item" [class.enc-item--fora]="l.foraDoContrato">
              <span class="enc-item-nome">@if (l.foraDoContrato) {<span class="enc-selo">Fora do contrato</span> }{{ l.nome }}</span>
              <span class="enc-item-qtd">
                {{ l.usado }}@if (l.usado !== l.aprovado) {<span class="enc-item-de"> de {{ l.aprovado }} {{ l.aprovado === 1 ? 'aprovado' : 'aprovados' }}</span>}
              </span>
              <span class="enc-item-valor">{{ l.usado * l.precoUnitario | currency:'BRL' }}</span>
            </div>
          }
          @if (custo().foraContrato) {
            <div class="enc-total enc-total--parte">
              <span>Do contrato</span>
              <span>{{ custo().contrato | currency:'BRL' }}</span>
            </div>
            <div class="enc-total enc-total--parte">
              <span>Fora do contrato (à parte)</span>
              <span>{{ custo().foraContrato | currency:'BRL' }}</span>
            </div>
          }
          <div class="enc-total">
            <span>Custo do serviço</span>
            <strong>{{ custo().total | currency:'BRL' }}</strong>
          </div>
        </div>
      } @else {
        <p class="enc-vazio">Nenhum item do contrato foi registrado nesta OS.</p>
      }

      @if (fotos().length) {
        <div class="enc-fotos">
          <span class="enc-itens-titulo">Fotos do serviço</span>
          <div class="enc-fotos-lista">
            @for (url of fotos(); track url) {
              <a [href]="url" target="_blank" rel="noopener"><img [src]="url" alt="Foto do serviço" /></a>
            }
          </div>
        </div>
      }

      @if (erro()) {
        <p class="enc-erro" role="alert"><app-icon name="warning" aria-hidden="true"></app-icon> {{ erro() }}</p>
      }

      <div class="enc-acoes">
        <app-flow-button variant="secondary" type="button" [disabled]="enviando()" (click)="ref.close()">Voltar</app-flow-button>
        <app-flow-button type="button" [disabled]="enviando()" (click)="confirmar()">
          @if (enviando()) {
            <app-spinner size="sm" label="Encerrando"></app-spinner> Encerrando…
          } @else {
            <app-icon class="btn-icon" name="lock" aria-hidden="true"></app-icon> Confirmar encerramento
          }
        </app-flow-button>
      </div>
    </div>
  `,
  styles: `
    .enc { padding: 20px 22px 18px; background: var(--bg-tertiary); color: var(--text-primary); border-radius: var(--card-radius); }
    .enc-cabecalho { display: flex; gap: 12px; align-items: flex-start; margin-bottom: 14px; }
    .enc-icone { width: 40px; height: 40px; border-radius: 12px; background: var(--primary-50); color: var(--primary-500); display: flex; align-items: center; justify-content: center; flex-shrink: 0; }
    .enc-titulo { margin: 0; font-size: 1rem; font-weight: 600; }
    .enc-sub { margin: 2px 0 0; font-size: 0.8rem; color: var(--text-secondary); }
    .enc-dados { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 10px 16px; margin: 0 0 14px; }
    .enc-dados div { min-width: 0; }
    .enc-dados--largo { grid-column: 1 / -1; }
    dt { font-size: 0.75rem; font-weight: 600; text-transform: uppercase; letter-spacing: 0.4px; color: var(--text-tertiary); }
    dd { margin: 2px 0 0; font-size: 0.875rem; color: var(--text-secondary); overflow-wrap: anywhere; }
    .enc-itens, .enc-fotos { display: flex; flex-direction: column; gap: 6px; margin-bottom: 14px; }
    .enc-itens-titulo { font-size: 0.75rem; font-weight: 600; text-transform: uppercase; letter-spacing: 0.4px; color: var(--text-tertiary); }
    .enc-item { display: grid; grid-template-columns: minmax(0, 1fr) auto auto; gap: 12px; align-items: baseline; padding: 8px 12px; border: 1px solid var(--border-default); border-radius: var(--button-radius); font-size: 0.8125rem; }
    .enc-item-nome { color: var(--text-primary); font-weight: 600; overflow-wrap: anywhere; }
    .enc-item-qtd { font-variant-numeric: tabular-nums; white-space: nowrap; }
    .enc-item-de { color: var(--text-tertiary); }
    .enc-item-valor { font-variant-numeric: tabular-nums; white-space: nowrap; }
    .enc-total { display: flex; justify-content: space-between; align-items: center; padding: 10px 12px; border-radius: var(--button-radius); background: var(--bg-elevated); font-size: 0.875rem; }
    .enc-item--fora { border-style: dashed; border-color: var(--warning-500); background: var(--warning-50, transparent); }
    .enc-selo { display: inline-block; margin-right: 4px; padding: 0 6px; border-radius: 999px; background: var(--warning-500); color: #1b1300; font-size: 0.75rem; font-weight: 700; text-transform: uppercase; letter-spacing: 0.3px; }
    .enc-total--parte { padding: 4px 12px; background: transparent; font-size: 0.8125rem; color: var(--text-secondary); }
    .enc-vazio { margin: 0 0 14px; font-size: 0.8125rem; color: var(--text-tertiary); }
    .enc-fotos-lista { display: flex; flex-wrap: wrap; gap: 8px; }
    .enc-fotos-lista a { display: block; width: 72px; height: 72px; border-radius: var(--button-radius); overflow: hidden; border: 1px solid var(--border-default); }
    .enc-fotos-lista img { width: 100%; height: 100%; object-fit: cover; display: block; }
    .enc-erro { display: flex; gap: 8px; align-items: flex-start; margin: 0 0 8px; padding: 10px 12px; border-radius: var(--button-radius); background: var(--danger-50, var(--bg-elevated)); color: var(--danger-500); font-size: 0.8rem; }
    .enc-acoes { display: flex; justify-content: flex-end; gap: 8px; margin-top: 6px; }
    @media (max-width: 480px) {
      .enc { padding: 16px; }
      .enc-dados { grid-template-columns: 1fr; }
      .enc-item { grid-template-columns: minmax(0, 1fr) auto; }
      .enc-item-valor { grid-column: 2; }
      .enc-acoes { flex-direction: column-reverse; }
      .enc-acoes app-flow-button { width: 100%; }
    }
  `
})
export class EncerrarChamadoDialogComponent {
  readonly ref = inject(MatDialogRef<EncerrarChamadoDialogComponent>);
  readonly chamado: Chamado = inject(MAT_DIALOG_DATA);
  private readonly dataService = inject(DataService);

  enviando = signal(false);
  erro = signal('');
  fotos = signal<string[]>([]);

  os = computed(() => (this.chamado.ordemServicoId ? this.dataService.getOSById(this.chamado.ordemServicoId) : undefined));

  tecnico = computed(() => {
    const os = this.os();
    const id = os?.executadoPor ?? os?.tecnicoId;
    const nome = id ? this.dataService.getUsuarioById(id)?.nome : undefined;
    if (nome) return nome;
    const contratada = this.dataService.getEmpresaContratadaById(os?.empresaContratadaId)?.nome;
    return contratada ? `Equipe da ${contratada}` : 'Não informado';
  });

  // Usado × preço do orçamento aprovado, com os itens fora do contrato
  // (Z3.5) marcados e somados à parte. A conta é a de shared/servico-os.ts,
  // a mesma do relatório do mês e do histórico do equipamento.
  linhas = computed<LinhaServico[]>(() => {
    const os = this.os();
    return os ? linhasDoServico(os, this.dataService.getOrcamentoByOS(os.id)) : [];
  });

  custo = computed(() => custoDoServico(this.linhas()));

  constructor() {
    const caminhos = this.os()?.fotosExecucao ?? [];
    if (caminhos.length) {
      Promise.all(caminhos.map(c => urlDoArquivo(c).catch(() => '')))
        .then(urls => this.fotos.set(urls.filter(Boolean)));
    }
  }

  async confirmar(): Promise<void> {
    if (this.enviando()) return;
    this.erro.set('');
    this.enviando.set(true);
    this.ref.disableClose = true;
    try {
      await this.dataService.encerrarChamado(this.chamado.id);
      this.ref.close(true);
    } catch (e) {
      this.erro.set(e instanceof Error ? e.message : 'Não foi possível encerrar. Tente de novo.');
    } finally {
      this.enviando.set(false);
      this.ref.disableClose = false;
    }
  }
}
