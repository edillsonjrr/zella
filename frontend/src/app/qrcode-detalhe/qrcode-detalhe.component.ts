import { Component, Inject, OnInit, inject, signal } from '@angular/core';
import { IconComponent } from '../shared/icon/icon.component';
import { FlowButtonComponent } from '../shared/flow-button/flow-button.component';
import { MAT_DIALOG_DATA, MatDialogRef } from '@angular/material/dialog';
import { AuthService } from '../shared/auth.service';
import { DataService } from '../shared/data.service';
import { UiFeedbackService } from '../shared/ui-feedback.service';
import { desenharPlaqueta, gerarQrDataUrl, montarPlaca, urlDoQr, type Placa } from '../shared/plaqueta';
import type { QrAlvo } from '../shared/models';

@Component({
  selector: 'app-qrcode-detalhe',
  imports: [IconComponent, FlowButtonComponent],
  templateUrl: './qrcode-detalhe.component.html',
  styleUrl: './qrcode-detalhe.component.scss'
})
export class QrcodeDetalheComponent implements OnInit {
  private dialogRef = inject(MatDialogRef<QrcodeDetalheComponent>);
  private auth = inject(AuthService);
  private dataService = inject(DataService);
  private feedback = inject(UiFeedbackService);

  qrDataUrl = signal<string | null>(null);
  linkCopiado = signal(false);
  erro = signal('');
  // Web Share com arquivo (celular): compartilhar/salvar a imagem direto.
  readonly podeCompartilhar = typeof navigator !== 'undefined' && typeof navigator.share === 'function';

  url: string;
  placa: Placa;

  // brilho do metal e inclinação da placa, seguindo o ponteiro
  brilhoX = signal(30);
  brilhoY = signal(20);
  incX = signal(0);
  incY = signal(0);

  constructor(@Inject(MAT_DIALOG_DATA) public alvo: QrAlvo) {
    // Endereço, texto e desenho da plaqueta moram em shared/plaqueta.ts,
    // os mesmos das etiquetas em lote. `tipo` e `id` identificam qualquer
    // um dos 4 níveis mapeáveis (unidade, bloco, sala, equipamento).
    this.url = urlDoQr(this.auth.empresaId, alvo.tipo, alvo.id);
    this.placa = montarPlaca(this.dataService, alvo);
  }

  mover(e: PointerEvent): void {
    if (e.pointerType !== 'mouse') return;
    const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
    const x = (e.clientX - r.left) / r.width;
    const y = (e.clientY - r.top) / r.height;
    this.brilhoX.set(Math.round(x * 100));
    this.brilhoY.set(Math.round(y * 100));
    this.incX.set(+((0.5 - y) * 6).toFixed(2));
    this.incY.set(+((x - 0.5) * 8).toFixed(2));
  }

  soltar(): void {
    this.incX.set(0);
    this.incY.set(0);
    this.brilhoX.set(30);
    this.brilhoY.set(20);
  }

  async ngOnInit(): Promise<void> {
    try {
      const dataUrl = await gerarQrDataUrl(this.url);
      this.qrDataUrl.set(dataUrl);
    } catch (e) {
      console.error('Falha ao gerar QR Code', e);
      this.erro.set('Não foi possível gerar o QR Code. Feche e tente novamente.');
    }
  }

  private get nomeArquivo(): string {
    return `plaqueta-${this.alvo.tipo}-${this.slugify(this.alvo.subtitulo)}.png`;
  }

  async baixar(): Promise<void> {
    const qr = this.qrDataUrl();
    if (!qr) return;
    let dataUrl = qr;

    // Celular (iOS principalmente) ignora <a download> com data URL. Onde dá
    // pra compartilhar arquivo, abre a folha de compartilhar (Salvar imagem,
    // WhatsApp, impressora); senão cai no download normal.
    try {
      // O arquivo é a plaqueta inteira, pronta para virar adesivo; se o
      // desenho falhar, ainda sai o QR sozinho.
      dataUrl = await desenharPlaqueta(qr, this.alvo.titulo, this.placa).catch(() => qr);
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

  /**
   * Copia o endereço que está dentro do QR Code, para testar sem celular ou
   * mandar por mensagem. É o link fixo da plaqueta; cada abertura gera um
   * link novo de 3 minutos para o formulário.
   */
  async copiarLink(): Promise<void> {
    let copiou = false;
    try {
      await navigator.clipboard.writeText(this.url);
      copiou = true;
    } catch {
      // Sem permissão de área de transferência (http, navegador antigo):
      // cai no jeito antigo, com um campo escondido.
      const campo = document.createElement('textarea');
      campo.value = this.url;
      campo.setAttribute('readonly', '');
      campo.style.position = 'fixed';
      campo.style.opacity = '0';
      document.body.appendChild(campo);
      campo.select();
      try {
        copiou = document.execCommand('copy');
      } catch {
        copiou = false;
      }
      campo.remove();
    }
    if (copiou) {
      this.linkCopiado.set(true);
      this.feedback.sucesso('Link do QR Code copiado.');
      setTimeout(() => this.linkCopiado.set(false), 2500);
    } else {
      this.feedback.erro('Não foi possível copiar. Selecione o link abaixo e copie.');
    }
  }

  /**
   * Abre numa aba nova o mesmo caminho de quem escaneia: a função gera o
   * link de 3 minutos e leva ao formulário. Enviar por ali abre um chamado
   * de verdade.
   */
  abrirPrevia(): void {
    window.open(this.url, '_blank', 'noopener');
  }

  fechar(): void {
    this.dialogRef.close();
  }
}
