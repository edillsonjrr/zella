import { Injectable, inject } from '@angular/core';
import { LiveAnnouncer } from '@angular/cdk/a11y';
import { MatSnackBar } from '@angular/material/snack-bar';

@Injectable({ providedIn: 'root' })
export class UiFeedbackService {
  private readonly liveAnnouncer = inject(LiveAnnouncer);
  private readonly snackBar = inject(MatSnackBar);

  /** Só para leitor de tela: muda algo que já aparece na tela. */
  announce(message: string, politeness: 'polite' | 'assertive' | 'off' = 'polite'): void {
    this.liveAnnouncer.announce(message, politeness);
  }

  /**
   * Aviso visível de que a ação deu certo ("Pedido CH-2026-0104 enviado").
   * O snack bar do Material também anuncia para leitor de tela, então não
   * precisa do `announce` junto.
   */
  sucesso(mensagem: string): void {
    this.snackBar.open(mensagem, 'OK', {
      duration: 6000,
      panelClass: ['aviso-tela', 'aviso-tela--sucesso'],
      horizontalPosition: 'center',
      verticalPosition: 'bottom',
      politeness: 'polite'
    });
  }

  /** Aviso visível de erro, para ações que não têm onde mostrar o erro. */
  erro(mensagem: string): void {
    this.snackBar.open(mensagem, 'OK', {
      duration: 9000,
      panelClass: ['aviso-tela', 'aviso-tela--erro'],
      horizontalPosition: 'center',
      verticalPosition: 'bottom',
      politeness: 'assertive'
    });
  }
}
