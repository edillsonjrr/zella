import { Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MAT_DIALOG_DATA, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { IconComponent } from '../shared/icon/icon.component';
import { FlowButtonComponent } from '../shared/flow-button/flow-button.component';
import { SpinnerComponent } from '../shared/spinner/spinner.component';
import { DataService } from '../shared/data.service';
import { reduzirImagem } from '../shared/imagem';
import type { Orcamento } from '../shared/models';

export interface ExecutarOsDialogData {
  osId: string;
  numeroOS: string;
  // Equipamento e local do pedido, para o técnico conferir que está na OS certa.
  equipamento?: string;
  local?: string;
  // OS aprovada sem orçamento carregado (dado antigo): registra sem itens.
  orcamento?: Orcamento;
}

const MAX_FOTOS = 3;

// Uma linha por item de contrato: o orçamento pode repetir o item, e a
// execução é por item, não por linha.
interface LinhaExecucao {
  itemContratoId: string;
  nome: string;
  orcado: number;
  executado: number;
}

// Item fora do contrato aprovado (Z3.5). Também já vem com o aprovado; não
// mexe em saldo, só registra o que foi usado.
interface LinhaForaExecucao {
  id: string;
  descricao: string;
  unidade: string;
  orcado: number;
  executado: number;
}

/**
 * "Registrar serviço feito", pensado para o celular do técnico:
 *
 *   1. o botão da lista ou da OS abre esta janela;
 *   2. "Tirar foto do serviço" abre a câmera;
 *   3. "Registrar serviço feito" envia.
 *
 * As quantidades já vêm com o aprovado; só mexe nelas quem usou menos (a
 * diferença volta para o saldo do contrato). A janela faz o envio e só fecha
 * quando deu certo — o erro aparece aqui, sem perder as fotos. Fecha com
 * `true` quando registrou.
 */
@Component({
  selector: 'app-executar-os-dialog',
  imports: [FormsModule, MatDialogModule, MatFormFieldModule, MatInputModule, IconComponent, FlowButtonComponent, SpinnerComponent],
  template: `
    <div class="exec">
      <div class="exec-cabecalho">
        <div class="exec-icone"><app-icon name="build" aria-hidden="true"></app-icon></div>
        <div class="exec-cabecalho-texto">
          <h2 class="exec-titulo">Registrar serviço feito</h2>
          <p class="exec-sub">
            {{ data.numeroOS }}@if (data.equipamento) { · {{ data.equipamento }} }@if (data.local) { · {{ data.local }} }
          </p>
        </div>
      </div>

      <!-- A foto é o que mais pesa para quem confere: fica no topo, ao alcance do polegar. -->
      <div class="exec-fotos">
        @if (fotos.length < maxFotos) {
          <label class="exec-foto-botao" [class.exec-foto-botao--compacto]="fotos.length > 0">
            <input type="file" accept="image/*" capture="environment" multiple class="sr-only" (change)="onFotos($event)" [disabled]="enviando()" />
            <app-icon name="photo_camera" aria-hidden="true"></app-icon>
            <span>{{ lendoFotos ? 'Lendo a foto…' : fotos.length ? 'Tirar outra foto' : 'Tirar foto do serviço' }}</span>
          </label>
        }
        @if (fotos.length) {
          <div class="exec-fotos-lista">
            @for (f of fotos; track $index) {
              <div class="exec-foto">
                <img [src]="f" alt="Foto do serviço {{ $index + 1 }}" />
                <button type="button" class="exec-foto-remover" (click)="removerFoto($index)" [disabled]="enviando()" [attr.aria-label]="'Remover foto ' + ($index + 1)">
                  <app-icon name="close" aria-hidden="true"></app-icon>
                </button>
              </div>
            }
          </div>
        }
        <span class="exec-fotos-rotulo">
          {{ fotos.length ? fotos.length + ' de ' + maxFotos + (fotos.length === 1 ? ' foto' : ' fotos') : 'Opcional, até ' + maxFotos + ' fotos. Ajuda a gestão a conferir.' }}
        </span>
      </div>

      @if (linhas.length) {
        <div class="exec-secao">
          <span class="exec-secao-titulo">O que foi usado</span>
          <span class="exec-secao-ajuda">Já preenchido com o que foi aprovado. Mude só se usou menos.</span>
        </div>
        <div class="exec-linhas">
          @for (l of linhas; track l.itemContratoId) {
            <div class="exec-linha" [class.exec-linha--parcial]="l.executado < l.orcado">
              <div class="exec-info">
                <strong>{{ l.nome }}</strong>
                <span class="exec-meta">Aprovado: {{ l.orcado }}</span>
              </div>
              <mat-form-field appearance="outline" class="exec-qtd">
                <mat-label>Usado</mat-label>
                <input matInput type="number" inputmode="decimal" min="0" [max]="l.orcado" step="1" [(ngModel)]="l.executado" [name]="'exec-' + l.itemContratoId" [disabled]="enviando()" />
                @if (problema(l)) {
                  <mat-hint class="hint-erro">{{ problema(l) }}</mat-hint>
                } @else if (l.executado < l.orcado) {
                  <mat-hint>{{ l.orcado - l.executado }} {{ l.orcado - l.executado === 1 ? 'volta' : 'voltam' }} ao contrato</mat-hint>
                }
              </mat-form-field>
            </div>
          }
        </div>
      }

      @if (linhasFora.length) {
        <div class="exec-secao">
          <span class="exec-secao-titulo">Fora do contrato</span>
          <span class="exec-secao-ajuda">Aprovados à parte. Não saem do saldo do contrato.</span>
        </div>
        <div class="exec-linhas">
          @for (l of linhasFora; track l.id) {
            <div class="exec-linha exec-linha--fora">
              <div class="exec-info">
                <span class="exec-selo">Fora do contrato</span>
                <strong>{{ l.descricao }}</strong>
                <span class="exec-meta">Aprovado: {{ l.orcado }} {{ l.unidade }}</span>
              </div>
              <mat-form-field appearance="outline" class="exec-qtd">
                <mat-label>Usado</mat-label>
                <input matInput type="number" inputmode="decimal" min="0" [max]="l.orcado" step="any" [(ngModel)]="l.executado" [name]="'exec-fora-' + l.id" [disabled]="enviando()" />
                @if (problema(l)) {
                  <mat-hint class="hint-erro">{{ problema(l) }}</mat-hint>
                }
              </mat-form-field>
            </div>
          }
        </div>
      }

      <mat-form-field appearance="outline" class="exec-obs">
        <mat-label>O que foi feito (opcional)</mat-label>
        <input matInput [(ngModel)]="observacao" name="observacao" maxlength="500" placeholder="Ex: troquei 6 lâmpadas e 1 reator" [disabled]="enviando()" />
      </mat-form-field>

      @if (erro) {
        <p class="exec-erro" role="alert"><app-icon name="warning" aria-hidden="true"></app-icon> {{ erro }}</p>
      }

      <div class="exec-acoes">
        <app-flow-button variant="secondary" type="button" [class.full-width]="celular" [disabled]="enviando()" (click)="ref.close()">Voltar</app-flow-button>
        <app-flow-button type="button" [class.full-width]="celular" [disabled]="!valido || enviando() || lendoFotos" (click)="confirmar()">
          @if (enviando()) {
            <app-spinner size="sm" label="Registrando"></app-spinner> {{ fotos.length ? 'Enviando fotos…' : 'Registrando…' }}
          } @else {
            <app-icon class="btn-icon" name="check_circle" aria-hidden="true"></app-icon> {{ parcial ? 'Registrar serviço feito, com menos itens' : 'Registrar serviço feito' }}
          }
        </app-flow-button>
      </div>
    </div>
  `,
  styles: `
    .exec { padding: 20px 22px 18px; background: var(--bg-tertiary); color: var(--text-primary); border-radius: var(--card-radius); }
    .exec-cabecalho { display: flex; gap: 12px; align-items: flex-start; margin-bottom: 16px; }
    .exec-cabecalho-texto { min-width: 0; }
    .exec-icone { width: 40px; height: 40px; border-radius: 12px; background: var(--primary-50); color: var(--primary-500); display: flex; align-items: center; justify-content: center; flex-shrink: 0; }
    .exec-titulo { margin: 0; font-size: 1rem; font-weight: 600; }
    .exec-sub { margin: 2px 0 0; font-size: 0.8rem; color: var(--text-secondary); overflow-wrap: anywhere; }
    .exec-fotos { display: flex; flex-direction: column; gap: 8px; margin-bottom: 16px; }
    .exec-foto-botao {
      display: flex; align-items: center; justify-content: center; gap: 10px; min-height: 56px; padding: 12px 16px;
      border: 1px dashed var(--primary-500); border-radius: var(--button-radius); background: var(--primary-50);
      color: var(--primary-400); font-weight: 600; font-size: 0.9375rem; cursor: pointer;
      app-icon { font-size: 22px; }
      &:focus-within { outline: 2px solid var(--primary-500); outline-offset: 2px; }
    }
    .exec-foto-botao--compacto { min-height: 44px; font-size: 0.8125rem; }
    .exec-fotos-lista { display: flex; flex-wrap: wrap; gap: 8px; }
    .exec-foto { position: relative; width: 84px; height: 84px; border-radius: var(--button-radius); overflow: hidden; border: 1px solid var(--border-default); }
    .exec-foto img { width: 100%; height: 100%; object-fit: cover; display: block; }
    .exec-foto-remover { position: absolute; top: 4px; right: 4px; width: 28px; height: 28px; border: none; border-radius: 50%; background: rgba(0,0,0,.6); color: #fff; cursor: pointer; display: flex; align-items: center; justify-content: center; padding: 0; }
    .exec-fotos-rotulo { font-size: 0.75rem; color: var(--text-tertiary); }
    .exec-secao { display: flex; flex-direction: column; gap: 2px; margin-bottom: 8px; }
    .exec-secao-titulo { font-size: 0.75rem; font-weight: 600; text-transform: uppercase; letter-spacing: 0.4px; color: var(--text-tertiary); }
    .exec-secao-ajuda { font-size: 0.75rem; color: var(--text-secondary); }
    .exec-linhas { display: flex; flex-direction: column; gap: 8px; margin-bottom: 8px; }
    .exec-linha { display: flex; justify-content: space-between; align-items: flex-start; gap: 12px; padding: 8px 12px; border: 1px solid var(--border-default); border-radius: var(--button-radius); }
    .exec-linha--parcial { border-color: var(--primary-500); background: var(--primary-50); }
    .exec-info { display: flex; flex-direction: column; gap: 2px; padding-top: 8px; min-width: 0; }
    .exec-info strong { font-size: 0.875rem; overflow-wrap: anywhere; }
    .exec-meta { font-size: 0.75rem; color: var(--text-tertiary); }
    .exec-qtd { flex: 0 0 130px; max-width: 130px; }
    .exec-linha--fora { border-style: dashed; border-color: var(--warning-500); background: var(--warning-50, var(--bg-elevated)); }
    .exec-selo { align-self: flex-start; padding: 1px 8px; border-radius: 999px; background: var(--warning-500); color: #1b1300; font-size: 0.75rem; font-weight: 700; text-transform: uppercase; letter-spacing: 0.3px; }
    .exec-obs { width: 100%; }
    .hint-erro { color: var(--danger-500); }
    .exec-erro { display: flex; gap: 8px; align-items: flex-start; margin: 0 0 8px; padding: 10px 12px; border-radius: var(--button-radius); background: var(--danger-50, var(--bg-elevated)); color: var(--danger-500); font-size: 0.8rem; }
    .exec-acoes { display: flex; justify-content: flex-end; gap: 8px; margin-top: 6px; }
    .sr-only { position: absolute; width: 1px; height: 1px; overflow: hidden; clip: rect(0 0 0 0); }
    @media (max-width: 480px) {
      .exec { padding: 16px; }
      .exec-linha { align-items: center; }
      .exec-info { padding-top: 0; }
      .exec-qtd { flex: 0 0 104px; max-width: 104px; }
      .exec-acoes { flex-direction: column-reverse; }
    }
  `
})
export class ExecutarOsDialogComponent {
  // No celular, os botões de ação ocupam a largura toda.
  readonly celular = typeof matchMedia === 'function' && matchMedia('(max-width: 480px)').matches;
  readonly ref = inject(MatDialogRef<ExecutarOsDialogComponent>);
  readonly data: ExecutarOsDialogData = inject(MAT_DIALOG_DATA);
  private readonly dataService = inject(DataService);

  linhas: LinhaExecucao[];
  linhasFora: LinhaForaExecucao[];
  observacao = '';
  erro = '';
  fotos: string[] = [];
  lendoFotos = false;
  enviando = signal(false);
  readonly maxFotos = MAX_FOTOS;

  constructor() {
    const porItem = new Map<string, LinhaExecucao>();
    for (const i of this.data.orcamento?.itens ?? []) {
      const atual = porItem.get(i.itemContratoId);
      if (atual) atual.orcado += i.quantidade;
      else porItem.set(i.itemContratoId, { itemContratoId: i.itemContratoId, nome: i.nome, orcado: i.quantidade, executado: i.quantidade });
    }
    this.linhas = [...porItem.values()].map(l => ({ ...l, executado: l.orcado }));
    this.linhasFora = (this.data.orcamento?.itensForaContrato ?? [])
      .filter(f => f.decisao === 'Aprovado')
      .map(f => ({ id: f.id, descricao: f.descricao, unidade: f.unidade, orcado: f.quantidade, executado: f.quantidade }));
  }

  async onFotos(event: Event): Promise<void> {
    const input = event.target as HTMLInputElement;
    const arquivos = Array.from(input.files ?? []);
    input.value = '';
    if (!arquivos.length) return;
    this.lendoFotos = true;
    this.erro = '';
    try {
      for (const arquivo of arquivos) {
        if (this.fotos.length >= MAX_FOTOS) break;
        try {
          this.fotos.push(await reduzirImagem(arquivo, 1280, 0.8));
        } catch {
          this.erro = `Não foi possível ler a imagem "${arquivo.name}". Tente tirar a foto de novo.`;
        }
      }
    } finally {
      this.lendoFotos = false;
    }
  }

  removerFoto(i: number): void {
    this.fotos.splice(i, 1);
  }

  problema(l: { orcado: number; executado: number }): string {
    const v = Number(l.executado);
    if (!Number.isFinite(v) || v < 0) return 'Informe um número maior ou igual a zero';
    if (v > l.orcado) return `Máximo ${l.orcado} (aprovado)`;
    return '';
  }

  get valido(): boolean {
    return this.linhas.every(l => !this.problema(l)) && this.linhasFora.every(l => !this.problema(l));
  }

  get parcial(): boolean {
    return [...this.linhas, ...this.linhasFora].some(l => Number(l.executado) < l.orcado);
  }

  async confirmar(): Promise<void> {
    if (!this.valido || this.enviando()) return;
    const todas = [...this.linhas, ...this.linhasFora];
    if (todas.length && todas.every(l => Number(l.executado) === 0)) {
      this.erro = 'Nada foi usado. Se o serviço não vai acontecer, peça à gestão para cancelar o chamado.';
      return;
    }
    this.erro = '';
    this.enviando.set(true);
    this.ref.disableClose = true;
    try {
      const itens = this.linhas.length
        ? this.linhas.map(l => ({ itemContratoId: l.itemContratoId, quantidadeExecutada: Number(l.executado) }))
        : undefined;
      const foraContrato = this.linhasFora.map(l => ({ id: l.id, quantidadeExecutada: Number(l.executado) }));
      await this.dataService.executarOS(this.data.osId, itens, this.observacao.trim(), [...this.fotos], foraContrato);
      this.ref.close(true);
    } catch (e) {
      this.erro = e instanceof Error ? e.message : 'Não foi possível registrar. Confira a internet e tente de novo.';
    } finally {
      this.enviando.set(false);
      this.ref.disableClose = false;
    }
  }
}
