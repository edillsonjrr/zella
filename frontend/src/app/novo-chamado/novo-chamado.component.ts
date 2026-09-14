import { Component, Inject, OnInit, Optional, computed, inject, signal } from '@angular/core';
import { IconComponent } from '../shared/icon/icon.component';
import { SpinnerComponent } from '../shared/spinner/spinner.component';
import { LabelInputComponent } from '../shared/label-input/label-input.component';
import { FlowButtonComponent } from '../shared/flow-button/flow-button.component';
import { FormsModule, NgForm } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { MatCardModule } from '@angular/material/card';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatButtonModule } from '@angular/material/button';
import { MatDividerModule } from '@angular/material/divider';
import { MatSelectModule } from '@angular/material/select';
import { MatDialogModule, MAT_DIALOG_DATA, MatDialogRef } from '@angular/material/dialog';
import { httpsCallable } from 'firebase/functions';
import { functions } from '../shared/firebase';
import { DataService } from '../shared/data.service';
import { AuthService } from '../shared/auth.service';

@Component({
  selector: 'app-novo-chamado',
  imports: [
    SpinnerComponent,
    FormsModule,
    MatCardModule,
    MatFormFieldModule,
    MatInputModule,
    MatButtonModule,
    IconComponent,
    LabelInputComponent,
    FlowButtonComponent,
    MatDividerModule,
    MatDialogModule,
    MatSelectModule
  ],
  templateUrl: './novo-chamado.component.html',
  styleUrl: './novo-chamado.component.scss'
})
export class NovoChamadoComponent implements OnInit {
  private router = inject(Router);
  private route = inject(ActivatedRoute);
  private dataService = inject(DataService);
  private auth = inject(AuthService);

  equipamento = '';
  numeroSerie = '';
  unidadeId = '';
  descricao = '';
  solicitante = '';
  fotoPreview: string | null = null;

  // Preenchido quando o formulário foi aberto via QR Code (?unidadeId=...
  // ainda funciona direto, mas o fluxo real vem de ?qrToken=... gerado pela
  // Cloud Function abrirChamadoQr) — trava a unidade pra quem escaneou não
  // escolher outra por engano.
  unidadeViaQrCode = false;

  // Token do link temporário, quando o formulário veio de um QR Code. Vai
  // junto na chamada de criação: é dele que o backend tira a unidade, em vez
  // de confiar no que a tela mandar.
  private qrToken: string | null = null;

  // Nome da unidade resolvido pelo token. O convidado não tem permissão de
  // ler a coleção de unidades, então o seletor não serve pra ele — no lugar
  // dele o formulário mostra este texto.
  unidadeNomeQrCode = signal<string | null>(null);

  // Estado do link temporário do QR Code (3 minutos de validade — ver
  // functions/src/qrLinks.ts). Enquanto valida, o formulário fica escondido.
  validandoQrToken = signal(false);
  qrTokenExpirado = signal(false);

  // Quem abre pelo QR Code normalmente não está logado. Esse fluxo salva de
  // verdade no Firestore (via Cloud Function criarChamado), diferente do
  // resto do app hoje (ainda em DataService) — por isso tem estados
  // próprios de envio/sucesso/erro e não reaproveita dataService.adicionarChamado.
  enviandoQrCode = signal(false);
  chamadoEnviado = signal<string | null>(null);
  erroEnvioQrCode = signal<string | null>(null);

  usuarioLogado = this.auth.usuarioLogado;
  unidades = this.dataService.unidades;

  // Quem chegou escaneando o QR Code. Vê um formulário reduzido: o nome é o
  // único dado de identificação que ele digita, o resto vem do token.
  ehConvidado = computed(() => this.usuarioLogado().perfil === 'convidado');

  constructor(
    @Optional() private dialogRef: MatDialogRef<NovoChamadoComponent>,
    @Optional() @Inject(MAT_DIALOG_DATA) public data: any
  ) {
    const usuario = this.usuarioLogado();
    // O convidado não tem nome pra herdar: o campo começa vazio pra ele
    // preencher, e é o único campo de identificação do formulário dele.
    this.solicitante = usuario.perfil === 'convidado' ? '' : usuario.nome;
    if (usuario.perfil === 'cliente' && usuario.unidadeId) {
      this.unidadeId = usuario.unidadeId;
    }

    const unidadeIdParam = this.route.snapshot.queryParamMap.get('unidadeId');
    if (unidadeIdParam && this.dataService.getUnidadeById(unidadeIdParam)) {
      this.unidadeId = unidadeIdParam;
      this.unidadeViaQrCode = true;
    }
  }

  ngOnInit(): void {
    const qrToken = this.route.snapshot.queryParamMap.get('qrToken');
    if (!qrToken) return;

    // A sessão anônima já foi aberta pelo guard de rota (shared/auth.guard.ts)
    // antes deste componente existir — aqui só resta descobrir o que o token
    // aponta pra montar o formulário.
    this.validandoQrToken.set(true);
    const validarQrToken = httpsCallable<
      { token: string },
      {
        unidadeId: string;
        unidadeNome: string | null;
        tipo: 'unidade' | 'bloco' | 'sala' | 'equipamento';
        nome?: string;
      }
    >(functions, 'validarQrToken');

    validarQrToken({ token: qrToken })
      .then((res) => {
        this.unidadeId = res.data.unidadeId;
        this.unidadeNomeQrCode.set(res.data.unidadeNome);
        this.unidadeViaQrCode = true;
        this.qrToken = qrToken;
        // Quando o QR era de bloco/sala/equipamento (não da unidade toda),
        // o nome do local já entra pré-preenchido no campo de equipamento.
        if (res.data.tipo !== 'unidade' && res.data.nome) {
          this.equipamento = res.data.nome;
        }
      })
      .catch(() => {
        this.qrTokenExpirado.set(true);
      })
      .finally(() => {
        this.validandoQrToken.set(false);
      });
  }

  get isDialog(): boolean {
    return !!this.dialogRef;
  }

  onFotoSelecionada(event: Event): void {
    const input = event.target as HTMLInputElement;
    const arquivo = input.files?.[0];
    if (!arquivo) return;
    // A foto sobe dentro da chamada de criação (em base64), então é
    // reduzida aqui antes: uma foto de celular passa fácil de 5 MB, e o
    // formulário do QR Code roda em rede móvel.
    reduzirImagem(arquivo, 1280, 0.82)
      .then(dataUrl => { this.fotoPreview = dataUrl; })
      .catch(() => { this.fotoPreview = null; });
  }

  removerFoto(): void {
    this.fotoPreview = null;
  }

  salvar(form: NgForm): void {
    if (form.invalid) {
      form.control.markAllAsTouched();
      document.querySelector<HTMLElement>('.modal-scrollable-body .ng-invalid')?.focus();
      return;
    }

    if (this.qrToken) {
      this.salvarNoBackend();
      return;
    }

    const usuario = this.usuarioLogado();
    this.dataService.adicionarChamado({
      titulo: this.equipamento,
      equipamento: this.equipamento,
      numeroSerie: this.numeroSerie,
      descricao: this.descricao,
      unidadeId: this.unidadeId,
      solicitanteId: usuario.id,
      solicitanteNome: this.solicitante,
      possuiFoto: !!this.fotoPreview,
      foto: this.fotoPreview ?? undefined
    });

    this.fechar();
  }

  private salvarNoBackend(): void {
    this.erroEnvioQrCode.set(null);
    this.enviandoQrCode.set(true);

    const criarChamado = httpsCallable<
      {
        titulo: string;
        equipamento: string;
        numeroSerie?: string;
        descricao: string;
        solicitanteNome: string;
        possuiFoto: boolean;
        foto?: string;
        qrToken: string;
      },
      { id: string; numero: string }
    >(functions, 'criarChamado');

    // A unidade e o id do solicitante não são enviados: o backend tira os
    // dois do token. O que sobe daqui é só o que a pessoa de fato digitou.
    criarChamado({
      titulo: this.equipamento,
      equipamento: this.equipamento,
      numeroSerie: this.numeroSerie || undefined,
      descricao: this.descricao,
      solicitanteNome: this.solicitante,
      possuiFoto: !!this.fotoPreview,
      foto: this.fotoPreview ?? undefined,
      qrToken: this.qrToken!
    })
      .then((res) => {
        this.chamadoEnviado.set(res.data.numero);
      })
      .catch(() => {
        this.erroEnvioQrCode.set('Não foi possível enviar o chamado. Verifique sua conexão e tente novamente.');
      })
      .finally(() => {
        this.enviandoQrCode.set(false);
      });
  }

  cancelar(): void {
    this.fechar();
  }

  private fechar(): void {
    if (this.dialogRef) {
      this.dialogRef.close();
    } else {
      this.router.navigate(['/dashboard']);
    }
  }
}


// Redimensiona pelo canvas e devolve um JPEG em data URL. Se o navegador
// não conseguir decodificar (formato exótico), rejeita e a foto é descartada.
function reduzirImagem(arquivo: File, ladoMaximo: number, qualidade: number): Promise<string> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(arquivo);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      const escala = Math.min(1, ladoMaximo / Math.max(img.width, img.height));
      const canvas = document.createElement('canvas');
      canvas.width = Math.round(img.width * escala);
      canvas.height = Math.round(img.height * escala);
      const ctx = canvas.getContext('2d');
      if (!ctx) { reject(new Error('canvas')); return; }
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      resolve(canvas.toDataURL('image/jpeg', qualidade));
    };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('imagem')); };
    img.src = url;
  });
}
