import { Component, computed, inject, signal } from '@angular/core';
import { DatePipe } from '@angular/common';
import { MAT_DIALOG_DATA, MatDialogRef } from '@angular/material/dialog';
import { MatButtonModule } from '@angular/material/button';
import { MatDividerModule } from '@angular/material/divider';
import { urlDoArquivo } from '../shared/arquivos';
import { IconComponent } from '../shared/icon/icon.component';
import { FlowButtonComponent } from '../shared/flow-button/flow-button.component';
import { DataService } from '../shared/data.service';
import { prazoDoChamado } from '../shared/chamado-prazo';
import { nomeUnidade, rotuloUrgencia, situacaoDoPedido } from '../shared/rotulos';
import type { Chamado } from '../shared/models';

interface Etapa {
  titulo: string;
  data?: string;
  feita: boolean;
  atual: boolean;
}

/**
 * Um pedido visto por quem pediu: em que pé está, quem age agora, as etapas
 * já cumpridas e, quando o serviço foi feito, o resumo (o que foi feito,
 * quando e por quem). Só lê o que a solicitante pode ler pelas rules: o
 * chamado e a OS da unidade dela; o orçamento (valores) fica de fora.
 */
@Component({
  selector: 'app-pedido-detalhe',
  imports: [DatePipe, MatButtonModule, MatDividerModule, IconComponent, FlowButtonComponent],
  template: `
    <div class="painel-header">
      <div class="painel-titulo">
        <div class="painel-icone"><app-icon name="support_agent" aria-hidden="true"></app-icon></div>
        <div>
          <h2>{{ pedido().numero }}</h2>
          <span class="painel-subtitulo">Seu pedido</span>
        </div>
      </div>
      <button mat-icon-button (click)="fechar()" aria-label="Fechar"><app-icon name="close"></app-icon></button>
    </div>

    <mat-divider></mat-divider>

    <div class="painel-conteudo">
      <div [class]="'situacao situacao--' + situacao().tom">
        <strong>{{ situacao().rotulo }}</strong>
        <span>{{ situacao().agora }}</span>
      </div>

      @if (resumo(); as r) {
        <section class="bloco" aria-labelledby="titulo-resumo">
          <h3 id="titulo-resumo" class="bloco-titulo">Resumo do serviço</h3>
          <dl class="dados">
            <div><dt>Quando</dt><dd>{{ r.data ? (r.data | date:'dd/MM/yyyy') : 'Não informado' }}</dd></div>
            <div><dt>Quem fez</dt><dd>{{ r.tecnico }}</dd></div>
            <div class="dados--largo">
              <dt>O que foi feito</dt>
              <dd>{{ r.observacao || 'O técnico não escreveu observação.' }}</dd>
            </div>
            @if (r.itens.length) {
              <div class="dados--largo">
                <dt>Material e serviços usados</dt>
                <dd>
                  <ul class="itens">
                    @for (i of r.itens; track $index) { <li>{{ i }}</li> }
                  </ul>
                </dd>
              </div>
            }
          </dl>
          @if (fotosServico().length) {
            <div class="fotos">
              @for (url of fotosServico(); track url) {
                <a [href]="url" target="_blank" rel="noopener"><img [src]="url" alt="Foto do serviço feito" /></a>
              }
            </div>
          }
        </section>
      }

      <section class="bloco" aria-labelledby="titulo-etapas">
        <h3 id="titulo-etapas" class="bloco-titulo">Etapas</h3>
        <ol class="etapas">
          @for (e of etapas(); track e.titulo) {
            <li class="etapa" [class.etapa--feita]="e.feita" [class.etapa--atual]="e.atual">
              <span class="etapa-marca" aria-hidden="true">
                @if (e.feita) { <app-icon name="check_circle"></app-icon> } @else { <app-icon name="radio_button_unchecked"></app-icon> }
              </span>
              <span class="etapa-texto">
                <span>{{ e.titulo }}</span>
                @if (e.data) { <span class="etapa-data">{{ e.data | date:'dd/MM/yyyy' }}</span> }
                @if (!e.feita) { <span class="sr-only">(ainda não)</span> }
              </span>
            </li>
          }
        </ol>
      </section>

      <section class="bloco" aria-labelledby="titulo-pedido">
        <h3 id="titulo-pedido" class="bloco-titulo">O que você pediu</h3>
        <dl class="dados">
          <div class="dados--largo"><dt>Equipamento</dt><dd>{{ pedido().equipamento }}</dd></div>
          <div><dt>Onde fica</dt><dd>{{ onde() }}</dd></div>
          <div><dt>Pedido em</dt><dd>{{ pedido().dataCriacao | date:'dd/MM/yyyy' }}</dd></div>
          @if (urgencia()) {
            <div><dt>Urgência</dt><dd>{{ urgencia() }}</dd></div>
          }
          @if (prazo(); as p) {
            <div><dt>Prazo</dt><dd [class.alerta]="p.atrasado">{{ p.data }}{{ p.atrasado ? ' (atrasado)' : '' }}</dd></div>
          }
          <div class="dados--largo"><dt>Descrição</dt><dd class="descricao">{{ pedido().descricao }}</dd></div>
        </dl>
        @if (fotoPedido(); as url) {
          <a [href]="url" target="_blank" rel="noopener" class="foto-pedido"><img [src]="url" alt="Foto que você enviou" /></a>
        }
      </section>
    </div>

    <div class="painel-acoes">
      <app-flow-button variant="secondary" class="full-width" type="button" (click)="fechar()">Fechar</app-flow-button>
    </div>
  `,
  styles: `
    :host { display: flex; flex-direction: column; height: 100%; }
    .painel-header { display: flex; justify-content: space-between; align-items: flex-start; gap: 16px; padding: 20px; }
    .painel-titulo { display: flex; align-items: center; gap: 14px; }
    .painel-icone { width: 44px; height: 44px; border-radius: 12px; background: var(--primary-50); color: var(--primary-500); display: flex; align-items: center; justify-content: center; font-size: 22px; flex-shrink: 0; }
    h2 { margin: 0; font-size: 1.15rem; font-weight: 700; color: var(--text-primary); }
    .painel-subtitulo { font-size: 0.8125rem; color: var(--text-tertiary); }
    .painel-conteudo { flex: 1; overflow-y: auto; padding: 20px; display: flex; flex-direction: column; gap: 18px; }
    .painel-acoes { padding: 16px 20px 20px; border-top: 1px solid var(--border-default); }
    .situacao { display: flex; flex-direction: column; gap: 4px; padding: 12px 14px; border-radius: var(--button-radius); border-left: 4px solid var(--info-500); background: var(--bg-secondary); }
    .situacao strong { font-size: 0.9375rem; color: var(--text-primary); }
    .situacao span { font-size: 0.8125rem; color: var(--text-secondary); }
    .situacao--andamento { border-left-color: var(--warning-500); }
    .situacao--feito { border-left-color: var(--success-500); }
    .situacao--cancelado { border-left-color: var(--text-tertiary); }
    .bloco-titulo { margin: 0 0 8px; font-size: 0.8125rem; font-weight: 700; color: var(--text-primary); }
    .dados { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 10px 16px; margin: 0; }
    .dados div { min-width: 0; }
    .dados--largo { grid-column: 1 / -1; }
    dt { font-size: 0.75rem; font-weight: 600; text-transform: uppercase; letter-spacing: 0.4px; color: var(--text-tertiary); }
    dd { margin: 2px 0 0; font-size: 0.875rem; color: var(--text-secondary); overflow-wrap: anywhere; }
    .descricao { white-space: pre-line; }
    .alerta { color: var(--danger-500); font-weight: 600; }
    .itens { margin: 0; padding-left: 18px; }
    .fotos { display: flex; flex-wrap: wrap; gap: 8px; margin-top: 10px; }
    .fotos a { display: block; width: 84px; height: 84px; border-radius: var(--button-radius); overflow: hidden; border: 1px solid var(--border-default); }
    .fotos img, .foto-pedido img { width: 100%; height: 100%; object-fit: cover; display: block; }
    .foto-pedido { display: block; margin-top: 10px; max-height: 220px; border-radius: var(--button-radius); overflow: hidden; border: 1px solid var(--border-default); }
    .etapas { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; }
    .etapa { display: flex; gap: 10px; align-items: flex-start; position: relative; padding-bottom: 14px; color: var(--text-tertiary); font-size: 0.875rem; }
    .etapa:not(:last-child)::after { content: ''; position: absolute; left: 9px; top: 22px; bottom: 2px; width: 2px; background: var(--border-default); }
    .etapa--feita { color: var(--text-primary); }
    .etapa--feita:not(:last-child)::after { background: var(--success-500); }
    .etapa--atual { font-weight: 600; }
    .etapa-marca { display: inline-flex; font-size: 20px; flex-shrink: 0; }
    .etapa--feita .etapa-marca { color: var(--success-500); }
    .etapa-texto { display: flex; flex-direction: column; gap: 1px; padding-top: 1px; }
    .etapa-data { font-size: 0.75rem; font-weight: 400; color: var(--text-tertiary); }
    .sr-only { position: absolute; width: 1px; height: 1px; overflow: hidden; clip: rect(0 0 0 0); white-space: nowrap; }
    @media (max-width: 480px) { .dados { grid-template-columns: 1fr; } }
  `
})
export class PedidoDetalheComponent {
  private readonly dialogRef = inject(MatDialogRef<PedidoDetalheComponent>);
  private readonly dataService = inject(DataService);
  private readonly inicial: Chamado = inject(MAT_DIALOG_DATA);

  // Lido ao vivo: o painel pode estar aberto quando a etapa muda.
  pedido = computed(() => this.dataService.getChamadoById(this.inicial.id) ?? this.inicial);
  os = computed(() => {
    const id = this.pedido().ordemServicoId;
    return id ? this.dataService.getOSById(id) : undefined;
  });
  situacao = computed(() => situacaoDoPedido(this.pedido().status));
  prazo = computed(() => (this.situacao().tom === 'feito' || this.situacao().tom === 'cancelado' ? null : prazoDoChamado(this.pedido())));
  urgencia = computed(() => rotuloUrgencia(this.pedido().urgencia));
  onde = computed(() => {
    const p = this.pedido();
    return [p.local, nomeUnidade(this.dataService.getUnidadeById(p.unidadeId), '')].filter(Boolean).join(' · ') || 'Não informado';
  });

  etapas = computed<Etapa[]>(() => {
    const p = this.pedido();
    const os = this.os();
    const aprovada = !!os && ['Aprovada', 'Executada', 'Encerrada'].includes(os.situacao);
    const feito = !!os && ['Executada', 'Encerrada'].includes(os.situacao);
    const lista: Omit<Etapa, 'atual'>[] = [
      { titulo: 'Pedido enviado', data: p.dataCriacao, feita: true },
      { titulo: 'Encaminhado à empresa contratada', data: os?.dataCriacao, feita: !!os },
      { titulo: 'Aprovado', feita: aprovada },
      { titulo: 'Serviço feito', data: os?.dataExecucao, feita: feito },
      { titulo: 'Encerrado', data: p.status === 'Encerrado' ? p.dataFechamento : undefined, feita: p.status === 'Encerrado' }
    ];
    if (p.status === 'Cancelado') {
      const ate = lista.filter(e => e.feita);
      return [...ate, { titulo: 'Cancelado', data: p.dataFechamento, feita: true }].map((e, i, arr) => ({ ...e, atual: i === arr.length - 1 }));
    }
    const ultimaFeita = lista.map(e => e.feita).lastIndexOf(true);
    return lista.map((e, i) => ({ ...e, atual: i === ultimaFeita }));
  });

  // Resumo do serviço: aparece depois que o técnico registrou (Executado e
  // Encerrado). Itens sem valores: a solicitante não lê o orçamento.
  resumo = computed(() => {
    const os = this.os();
    if (!os || !['Executada', 'Encerrada'].includes(os.situacao)) return null;
    const id = os.executadoPor ?? os.tecnicoId;
    const nome = id ? this.dataService.getUsuarioById(id)?.nome : undefined;
    const contratada = this.dataService.getEmpresaContratadaById(os.empresaContratadaId)?.nome;
    return {
      data: os.dataExecucao,
      tecnico: nome ?? (contratada ? `Equipe da ${contratada}` : 'Empresa contratada'),
      observacao: os.observacaoExecucao ?? '',
      itens: [
        ...(os.itensExecutados ?? []).filter(i => i.executado > 0).map(i => `${i.executado} × ${i.nome}`),
        // Fora do contrato (Z3.5): a OS guarda o que foi usado, sem preço.
        ...(os.itensForaContratoExecutados ?? []).filter(i => i.executado > 0).map(i => `${i.executado} ${i.unidade} × ${i.descricao} (fora do contrato)`)
      ]
    };
  });

  fotoPedido = signal<string | null>(null);
  fotosServico = signal<string[]>([]);
  private fotosCarregadas = '';

  constructor() {
    if (this.inicial.fotoPath) {
      urlDoArquivo(this.inicial.fotoPath).then(url => this.fotoPedido.set(url)).catch(() => undefined);
    }
    this.carregarFotosServico();
  }

  private carregarFotosServico(): void {
    const caminhos = this.os()?.fotosExecucao ?? [];
    const chave = caminhos.join('|');
    if (!caminhos.length || chave === this.fotosCarregadas) return;
    this.fotosCarregadas = chave;
    Promise.all(caminhos.map(c => urlDoArquivo(c).catch(() => ''))).then(urls => this.fotosServico.set(urls.filter(Boolean)));
  }

  fechar(): void {
    this.dialogRef.close();
  }
}
