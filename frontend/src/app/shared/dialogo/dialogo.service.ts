import { Injectable, inject } from '@angular/core';
import { MatDialog } from '@angular/material/dialog';
import { firstValueFrom } from 'rxjs';
import { ConfirmacaoDialogComponent, type ConfirmacaoDialogData } from './confirmacao-dialog.component';

/**
 * Confirmações e perguntas curtas dentro da UI, no lugar de `confirm()`,
 * `prompt()` e `alert()` nativos (que travam a aba, ignoram o tema e não
 * funcionam com automação de navegador).
 */
@Injectable({ providedIn: 'root' })
export class DialogoService {
  private dialog = inject(MatDialog);

  private abrir(data: ConfirmacaoDialogData): Promise<boolean | string> {
    const ref = this.dialog.open(ConfirmacaoDialogComponent, {
      data,
      // Mesma moldura dos formulários em modal (styles.scss): surface com
      // borda e raio, container transparente.
      panelClass: 'usuario-form-dialog',
      width: '440px',
      maxWidth: '95vw',
      autoFocus: data.campo ? 'input' : 'first-tabbable',
      restoreFocus: true
    });
    return firstValueFrom(ref.afterClosed()).then(r => r ?? false);
  }

  /** `true` se a pessoa confirmou. */
  async confirmar(titulo: string, mensagem?: string, opcoes: { confirmar?: string; perigo?: boolean } = {}): Promise<boolean> {
    return (await this.abrir({ titulo, mensagem, ...opcoes })) === true;
  }

  /** Confirmação de exclusão: botão vermelho e texto "Excluir". */
  excluir(titulo: string, mensagem?: string): Promise<boolean> {
    return this.confirmar(titulo, mensagem, { confirmar: 'Excluir', perigo: true });
  }

  /**
   * Pergunta com um campo de texto. Devolve o texto (pode ser vazio quando
   * `opcional`) ou `null` se a pessoa voltou.
   */
  async perguntar(
    titulo: string,
    rotulo: string,
    opcoes: { mensagem?: string; confirmar?: string; perigo?: boolean; opcional?: boolean; maxlength?: number } = {}
  ): Promise<string | null> {
    const { mensagem, confirmar, perigo, opcional, maxlength } = opcoes;
    const r = await this.abrir({ titulo, mensagem, confirmar, perigo, campo: { rotulo, opcional, maxlength } });
    return typeof r === 'string' ? r : null;
  }
}
