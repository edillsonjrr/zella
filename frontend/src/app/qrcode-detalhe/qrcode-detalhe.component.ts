import { Component, Inject, OnInit, inject, signal } from '@angular/core';
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
  erro = signal('');
  // Web Share com arquivo (celular): compartilhar/salvar a imagem direto.
  readonly podeCompartilhar = typeof navigator !== 'undefined' && typeof navigator.share === 'function';

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
    try {
      // A lib é CommonJS: no build de produção o import dinâmico só expõe
      // `default` (em desenvolvimento expunha as funções soltas também).
      // Sem esse ajuste o QR nunca era gerado em produção.
      const mod = await import('qrcode');
      const QRCode = ((mod as unknown as { default?: typeof mod }).default ?? mod) as typeof mod;
      const dataUrl = await QRCode.toDataURL(this.url, {
        width: 640,
        margin: 2,
        errorCorrectionLevel: 'M',
        color: { dark: '#111111', light: '#ffffff' }
      });
      this.qrDataUrl.set(dataUrl);
    } catch (e) {
      console.error('Falha ao gerar QR Code', e);
      this.erro.set('Não foi possível gerar o QR Code. Copie o link abaixo e tente novamente.');
    }
  }

  async copiarLink(): Promise<void> {
    try {
      await navigator.clipboard.writeText(this.url);
    } catch {
      // Fallback (navegador sem permissão de área de transferência).
      const campo = document.createElement('textarea');
      campo.value = this.url;
      campo.setAttribute('readonly', '');
      campo.style.position = 'fixed';
      campo.style.opacity = '0';
      document.body.appendChild(campo);
      campo.select();
      document.execCommand('copy');
      campo.remove();
    }
    this.linkCopiado.set(true);
    setTimeout(() => this.linkCopiado.set(false), 2000);
  }

  private get nomeArquivo(): string {
    return `qrcode-${this.alvo.tipo}-${this.slugify(this.alvo.subtitulo)}.png`;
  }

  async baixar(): Promise<void> {
    const dataUrl = this.qrDataUrl();
    if (!dataUrl) return;

    // Celular (iOS principalmente) ignora <a download> com data URL. Onde dá
    // pra compartilhar arquivo, abre a folha de compartilhar (Salvar imagem,
    // WhatsApp, impressora); senão cai no download normal.
    try {
      const blob = await (await fetch(dataUrl)).blob();
      const arquivo = new File([blob], this.nomeArquivo, { type: 'image/png' });
      const nav = navigator as Navigator & { canShare?: (d: ShareData) => boolean };
      if (this.podeCompartilhar && nav.canShare?.({ files: [arquivo] })) {
        await navigator.share({ files: [arquivo], title: `QR Code — ${this.alvo.titulo}` });
        return;
      }
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = this.nomeArquivo;
      document.body.appendChild(link);
      link.click();
      link.remove();
      setTimeout(() => URL.revokeObjectURL(url), 4000);
    } catch (e) {
      // Usuário cancelou a folha de compartilhar: não é erro.
      if ((e as DOMException)?.name !== 'AbortError') {
        window.open(dataUrl, '_blank');
      }
    }
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
