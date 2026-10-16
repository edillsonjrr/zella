import { Component, inject } from '@angular/core';
import { MAT_DIALOG_DATA, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { IconComponent } from '../icon/icon.component';
import { FlowButtonComponent } from '../flow-button/flow-button.component';
import { rotuloPerfil } from '../rotulos';
import type { PerfilEmpresa } from '../models';

interface Passo {
  icone: string;
  titulo: string;
  texto: string;
}

// Frases curtas, uma por coisa que a pessoa faz. Ficam aqui, perto da tela,
// para quem revisar o texto achar tudo junto.
const PASSOS: Record<PerfilEmpresa, Passo[]> = {
  cliente: [
    { icone: 'add', titulo: 'Peça um conserto', texto: 'Use o botão "Pedir um conserto", diga o que quebrou e onde fica. Uma foto ajuda.' },
    { icone: 'checklist', titulo: 'Acompanhe seus pedidos', texto: 'Em "Meus pedidos" você vê em que pé está cada um e quem age agora.' },
    { icone: 'notifications', titulo: 'Receba avisos', texto: 'O sino avisa quando o pedido é encaminhado, aprovado, feito e concluído.' }
  ],
  tecnico: [
    { icone: 'assignment', titulo: 'Suas OS para executar', texto: 'Em "Ordens de serviço" aparecem as OS aprovadas para você fazer.' },
    { icone: 'support_agent', titulo: 'Leia o pedido original', texto: 'Abra a OS para ver o defeito, o local e a foto de quem pediu.' },
    { icone: 'photo_camera', titulo: 'Registre o serviço feito', texto: 'No fim, use o botão "Registrar serviço feito" e anexe uma foto. A gestão é avisada.' }
  ],
  gestor_contratado: [
    { icone: 'assignment', titulo: 'OS da sua empresa', texto: 'As OS que a gestão envia chegam em "Ordens de serviço" e no sino.' },
    { icone: 'request_quote', titulo: 'Mande o orçamento', texto: 'Escolha os itens do contrato e envie para a gestão aprovar.' },
    { icone: 'assign_technician', titulo: 'Escolha o técnico', texto: 'Defina quem vai fazer cada OS.' },
    { icone: 'photo_camera', titulo: 'Registre o serviço feito', texto: 'Você ou o técnico registram o que foi feito, com foto.' }
  ],
  gestor: [
    { icone: 'support_agent', titulo: 'Receba os pedidos', texto: 'Os pedidos chegam em Chamados. Envie cada um para a empresa contratada.' },
    { icone: 'check_circle', titulo: 'Aprove os orçamentos', texto: 'Ao aprovar, o valor fica separado no saldo do contrato.' },
    { icone: 'task_alt', titulo: 'Encerre o chamado', texto: 'Depois do serviço feito, confira o resumo e encerre.' },
    { icone: 'account_balance_wallet', titulo: 'Acompanhe o saldo', texto: 'Em Contratos e Saldo você vê o que foi usado, o que está separado e o que está livre.' }
  ]
};

/**
 * "O que você faz aqui": a primeira vez de cada perfil (Z2.8). Abre uma vez
 * por pessoa; quem fecha não vê de novo (o layout guarda em
 * preferencias/{usuarioId} e no navegador).
 */
@Component({
  selector: 'app-boas-vindas',
  imports: [MatDialogModule, IconComponent, FlowButtonComponent],
  template: `
    <div class="bv">
      <div class="bv-cabecalho">
        <div class="bv-icone"><app-icon name="waving_hand" aria-hidden="true"></app-icon></div>
        <div>
          <h2 class="bv-titulo" id="boas-vindas-titulo">O que você faz aqui</h2>
          <p class="bv-sub">Você entrou como {{ perfil }}. Em poucas palavras:</p>
        </div>
      </div>
      <ol class="bv-passos">
        @for (p of passos; track p.titulo) {
          <li>
            <span class="bv-passo-icone" aria-hidden="true"><app-icon [name]="p.icone"></app-icon></span>
            <span class="bv-passo-texto">
              <strong>{{ p.titulo }}</strong>
              <span>{{ p.texto }}</span>
            </span>
          </li>
        }
      </ol>
      <div class="bv-acoes">
        <app-flow-button type="button" (click)="ref.close(true)">Entendi</app-flow-button>
      </div>
    </div>
  `,
  styles: `
    .bv { padding: 22px 22px 18px; background: var(--bg-tertiary); color: var(--text-primary); border-radius: var(--card-radius); }
    .bv-cabecalho { display: flex; gap: 12px; align-items: flex-start; margin-bottom: 16px; }
    .bv-icone { width: 44px; height: 44px; border-radius: 12px; background: var(--primary-50); color: var(--primary-500); display: flex; align-items: center; justify-content: center; font-size: 22px; flex-shrink: 0; }
    .bv-titulo { margin: 0; padding: 0; font-size: 1.125rem; font-weight: 700; color: var(--text-primary); }
    .bv-sub { margin: 2px 0 0; font-size: 0.8125rem; color: var(--text-secondary); }
    .bv-passos { list-style: none; margin: 0 0 16px; padding: 0; display: flex; flex-direction: column; gap: 12px; }
    .bv-passos li { display: flex; gap: 12px; align-items: flex-start; }
    .bv-passo-icone { width: 34px; height: 34px; border-radius: 10px; background: var(--bg-elevated); color: var(--primary-400); display: flex; align-items: center; justify-content: center; font-size: 18px; flex-shrink: 0; }
    .bv-passo-texto { display: flex; flex-direction: column; gap: 2px; padding-top: 1px; }
    .bv-passo-texto strong { font-size: 0.9375rem; color: var(--text-primary); }
    .bv-passo-texto span { font-size: 0.8125rem; line-height: 1.45; color: var(--text-secondary); }
    .bv-acoes { display: flex; justify-content: flex-end; }
    @media (max-width: 480px) { .bv-acoes app-flow-button { width: 100%; } }
  `
})
export class BoasVindasComponent {
  readonly ref = inject(MatDialogRef<BoasVindasComponent>);
  private readonly perfilEmpresa: PerfilEmpresa = inject(MAT_DIALOG_DATA);
  readonly passos = PASSOS[this.perfilEmpresa] ?? [];
  readonly perfil = rotuloPerfil(this.perfilEmpresa);
}

export const PERFIS_COM_BOAS_VINDAS = Object.keys(PASSOS) as PerfilEmpresa[];
