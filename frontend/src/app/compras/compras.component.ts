import { Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { LogoComponent } from '../shared/logo/logo.component';
import { IconComponent } from '../shared/icon/icon.component';
import { FlowButtonComponent } from '../shared/flow-button/flow-button.component';
import { ThemeToggleComponent } from '../theme-toggle/theme-toggle.component';
import { UiFeedbackService } from '../shared/ui-feedback.service';
import { baixarArquivo } from '../shared/pdf/documento-pdf';
import {
  ADICIONAIS_COMERCIAIS,
  DADOS_COMERCIAIS,
  O_QUE_E_O_ZELLA,
  PLANOS_COMERCIAIS,
  linkEmail,
  linkWhatsapp,
  precoBr,
  whatsappFormatado
} from '../shared/comercial.config';

/**
 * "Para compras e licitação" (Z3.4): página pública, linkada da
 * apresentação. Reúne o que o setor de compras pede para cotar: o que é o
 * Zella, os planos com preço mensal e anual, o que vem em cada um, como
 * pedir a proposta e o botão da proposta em PDF.
 *
 * Os dados da empresa (razão social, CNPJ, contatos, nota fiscal) vêm de
 * shared/comercial.config.ts. Campo vazio não aparece.
 */
@Component({
  selector: 'app-compras',
  imports: [FormsModule, RouterLink, LogoComponent, IconComponent, FlowButtonComponent, ThemeToggleComponent],
  templateUrl: './compras.component.html',
  styleUrl: './compras.component.scss'
})
export class ComprasComponent {
  private readonly feedback = inject(UiFeedbackService);

  readonly dados = DADOS_COMERCIAIS;
  readonly planos = PLANOS_COMERCIAIS;
  readonly adicionais = ADICIONAIS_COMERCIAIS;
  readonly oQueE = O_QUE_E_O_ZELLA;
  readonly preco = precoBr;

  readonly whatsapp = whatsappFormatado(DADOS_COMERCIAIS.whatsappComercial);
  readonly linkWhatsapp = linkWhatsapp(DADOS_COMERCIAIS.whatsappComercial, 'Olá! Quero uma proposta do Zella para a minha instituição.');
  readonly linkEmail = linkEmail(DADOS_COMERCIAIS.emailComercial, 'Proposta do Zella');
  readonly temContato = !!(DADOS_COMERCIAIS.emailComercial.trim() || DADOS_COMERCIAIS.whatsappComercial.trim());
  readonly temEmpresa = !!(DADOS_COMERCIAIS.razaoSocial.trim() || DADOS_COMERCIAIS.cnpj.trim());

  paraQuem = '';
  gerando = signal(false);

  totalAnual(porMes: number): string {
    return precoBr(porMes * 12);
  }

  async baixarProposta(): Promise<void> {
    if (this.gerando()) return;
    this.gerando.set(true);
    try {
      const { gerarPropostaPdf } = await import('../shared/pdf/proposta-pdf');
      baixarArquivo(await gerarPropostaPdf(this.paraQuem), 'proposta-zella.pdf');
    } catch (e) {
      console.error('Falha ao gerar a proposta', e);
      this.feedback.erro('Não foi possível gerar a proposta. Tente de novo.');
    } finally {
      this.gerando.set(false);
    }
  }
}
