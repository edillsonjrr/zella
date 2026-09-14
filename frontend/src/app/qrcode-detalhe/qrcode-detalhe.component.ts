import { Component, Inject, OnInit, inject, signal } from '@angular/core';
import * as QRCode from 'qrcode';
import { IconComponent } from '../shared/icon/icon.component';
import { FlowButtonComponent } from '../shared/flow-button/flow-button.component';
import { MatButtonModule } from '@angular/material/button';
import { MatDividerModule } from '@angular/material/divider';
import { MAT_DIALOG_DATA, MatDialogRef } from '@angular/material/dialog';
import { emulando } from '../shared/firebase';
import { AuthService } from '../shared/auth.service';
import type { QrAlvo } from '../shared/models';

@Component({
  selector: 'app-qrcode-detalhe',
  imports: [IconComponent, FlowButtonComponent, MatButtonModule, MatDividerModule],
  templateUrl: './qrcode-detalhe.component.html',
  styleUrl: './qrcode-detalhe.component.scss'
})
export class QrcodeDetalheComponent implements OnInit {
  private dialogRef = inject(MatDialogRef<QrcodeDetalheComponent>);
  private auth = inject(AuthService);

  linkCopiado = signal(false);
  qrDataUrl = signal<string | null>(null);

  url: string;

  constructor(@Inject(MAT_DIALOG_DATA) public alvo: QrAlvo) {
    // O QR não aponta direto pro formulário — aponta pra Cloud Function que
    // gera um link de 3 minutos a cada leitura (abrirChamadoQr, em
    // functions/src/qrLinks.ts). Isso é o que faz o link expirar: o código
    // impresso nunca muda, mas o token por trás dele sim a cada escaneada.
    // `tipo` e `id` identificam qualquer um dos 4 níveis mapeáveis (unidade,
    // bloco, sala, equipamento) — a function resolve a unidade a partir daí.
    // A empresa vai no QR porque quem escaneia não tem login: é o único
    // lugar de onde a function consegue saber em qual cliente procurar.
    const consulta = `e=${this.auth.empresaId}&tipo=${alvo.tipo}&id=${alvo.id}`;
    this.url = emulando
      ? `http://127.0.0.1:5001/gestao-manutencao-app/southamerica-east1/abrirChamadoQr?${consulta}`
      : `${location.origin}/api/qr?${consulta}`;
  }

  async ngOnInit(): Promise<void> {
    const dataUrl = await QRCode.toDataURL(this.url, {
      width: 320,
      margin: 2,
      color: { dark: '#111111', light: '#ffffff' }
    });
    this.qrDataUrl.set(dataUrl);
  }

  async copiarLink(): Promise<void> {
    await navigator.clipboard.writeText(this.url);
    this.linkCopiado.set(true);
    setTimeout(() => this.linkCopiado.set(false), 2000);
  }

  baixar(): void {
    const dataUrl = this.qrDataUrl();
    if (!dataUrl) return;

    const link = document.createElement('a');
    link.href = dataUrl;
    link.download = `qrcode-${this.alvo.tipo}-${this.slugify(this.alvo.subtitulo)}.png`;
    link.click();
  }

  private slugify(texto: string): string {
    return texto
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/(^-|-$)/g, '');
  }

  fechar(): void {
    this.dialogRef.close();
  }
}
