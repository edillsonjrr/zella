import { Component, Inject, OnInit, Optional, computed, inject, signal } from '@angular/core';
import { DatePipe } from '@angular/common';
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
import { MatAutocompleteModule, type MatAutocompleteSelectedEvent } from '@angular/material/autocomplete';
import { MatDialogModule, MAT_DIALOG_DATA, MatDialogRef } from '@angular/material/dialog';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { DataService } from '../shared/data.service';
import { AuthService } from '../shared/auth.service';
import { rotaInicial } from '../shared/permissoes';
import { OPCOES_URGENCIA, rotuloPatrimonio } from '../shared/rotulos';
import type { Chamado, Equipamento, UrgenciaChamado } from '../shared/models';
import { nomeNormalizado } from '../shared/cobertura-contrato';

// Valor da opção "Outro (descrever)" na lista de equipamentos.
const OUTRO = '__outro__';

interface OpcaoEquipamento {
  equipamento: Equipamento;
  // "Bloco B · Sala 12 · Patrimônio nº 0021"
  detalhe: string;
}

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
    MatSelectModule,
    MatAutocompleteModule,
    MatCheckboxModule,
    DatePipe
  ],
  templateUrl: './novo-chamado.component.html',
  styleUrl: './novo-chamado.component.scss'
})
export class NovoChamadoComponent implements OnInit {
  private router = inject(Router);
  private route = inject(ActivatedRoute);
  private dataService = inject(DataService);
  private auth = inject(AuthService);

  readonly OUTRO = OUTRO;
  readonly opcoesUrgencia = OPCOES_URGENCIA;

  equipamento = '';
  numeroSerie = '';
  unidadeId = signal('');
  descricao = '';
  solicitante = '';
  local = '';
  urgencia: UrgenciaChamado | '' = '';
  fotoPreview: string | null = null;

  // Equipamento do cadastro (Z2.4). Com a unidade escolhida, a pessoa busca
  // na lista; quem não acha o seu escolhe "Outro (descrever)" e escreve, como
  // era antes. Sem equipamento cadastrado na unidade, vai direto pro texto.
  equipamentoId = signal<string | null>(null);
  equipamentoOutro = signal(false);
  buscaEquipamento = signal('');

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
  // Veio de um QR Code: o token já diz o equipamento ou o local, então o
  // campo fica em texto livre, pré-preenchido, sem a lista.
  viaQrCode = signal(false);

  // Envio (os dois caminhos: logado e QR Code) e a confirmação que aparece
  // no lugar do formulário depois que o chamado nasceu.
  enviando = signal(false);
  chamadoEnviado = signal<string | null>(null);
  erroEnvio = signal<string | null>(null);

  usuarioLogado = this.auth.usuarioLogado;
  unidades = this.dataService.unidades;

  // Quem chegou escaneando o QR Code. Vê um formulário reduzido: o nome é o
  // único dado de identificação que ele digita, o resto vem do token.
  ehConvidado = computed(() => this.usuarioLogado().perfil === 'convidado');
  ehSolicitante = computed(() => this.usuarioLogado().perfil === 'cliente');

  equipamentosDaUnidade = computed<OpcaoEquipamento[]>(() => {
    const unidadeId = this.unidadeId();
    if (!unidadeId || this.ehConvidado()) return [];
    const ds = this.dataService;
    return ds.equipamentos()
      .filter(e => e.unidadeId === unidadeId)
      .map(e => ({
        equipamento: e,
        detalhe: [e.blocoId ? ds.getBlocoById(e.blocoId)?.nome : undefined, ds.getSalaById(e.salaId)?.nome, rotuloPatrimonio(e.patrimonio)]
          .filter(Boolean)
          .join(' · ')
      }))
      .sort((a, b) => a.equipamento.nome.localeCompare(b.equipamento.nome, 'pt-BR'));
  });

  // A lista aparece quando há cadastro na unidade e a pessoa não pediu "Outro".
  usarLista = computed(() => !this.viaQrCode() && this.equipamentosDaUnidade().length > 0 && !this.equipamentoOutro());

  equipamentosFiltrados = computed(() => {
    const termo = normalizar(this.buscaEquipamento());
    const lista = this.equipamentosDaUnidade();
    if (!termo || this.equipamentoId()) return lista;
    return lista.filter(o => normalizar(`${o.equipamento.nome} ${o.detalhe}`).includes(termo));
  });

  // O exemplo da busca sai do cadastro da unidade: antes sugeria "bebedouro"
  // numa unidade que não tem bebedouro, e a busca não achava nada.
  exemploBusca = computed(() => {
    const nomes = this.equipamentosDaUnidade().slice(0, 3).map(o => {
      const partes = o.equipamento.nome.toLowerCase().split(/\s+/);
      return partes[0].length <= 3 && partes[1] ? `${partes[0]} ${partes[1]}` : partes[0];
    });
    return nomes.length ? `Digite para buscar: ${nomes.join(', ')}…` : 'Digite para buscar';
  });

  // Digitou e nada do cadastro bate: diz isso e aponta o "Outro (descrever)".
  buscaSemResultado = computed(() =>
    !!normalizar(this.buscaEquipamento()) && !this.equipamentoId() && !this.equipamentosFiltrados().length
  );

  // Pedido parecido ainda em andamento na mesma unidade (mesmo equipamento do
  // cadastro ou o mesmo nome). Não bloqueia: avisa e pede confirmação, porque
  // pode ser outro defeito no mesmo equipamento.
  confirmouRepetido = signal(false);
  pediuConfirmacaoRepetido = signal(false);
  private repetidoConfirmadoPara = '';

  pedidoParecido(): Chamado | undefined {
    const unidadeId = this.unidadeId();
    const id = this.equipamentoId();
    const nome = nomeNormalizado(this.equipamento || this.buscaEquipamento());
    if (!unidadeId || (!id && !nome)) return undefined;
    return this.dataService.chamados().find(c =>
      c.unidadeId === unidadeId &&
      !['Encerrado', 'Cancelado'].includes(c.status) &&
      ((!!id && c.equipamentoId === id) || (!!nome && nomeNormalizado(c.equipamento) === nome))
    );
  }

  marcarRepetido(marcado: boolean, chamado: Chamado): void {
    this.confirmouRepetido.set(marcado);
    this.repetidoConfirmadoPara = marcado ? chamado.id : '';
    this.pediuConfirmacaoRepetido.set(false);
  }

  constructor(
    @Optional() private dialogRef: MatDialogRef<NovoChamadoComponent>,
    @Optional() @Inject(MAT_DIALOG_DATA) public data: any
  ) {
    const usuario = this.usuarioLogado();
    // O convidado não tem nome pra herdar: o campo começa vazio pra ele
    // preencher, e é o único campo de identificação do formulário dele.
    this.solicitante = usuario.perfil === 'convidado' ? '' : usuario.nome;
    if (usuario.perfil === 'cliente' && usuario.unidadeId) {
      this.unidadeId.set(usuario.unidadeId);
    }

    const unidadeIdParam = this.route.snapshot.queryParamMap.get('unidadeId');
    if (unidadeIdParam && this.dataService.getUnidadeById(unidadeIdParam)) {
      this.unidadeId.set(unidadeIdParam);
      this.unidadeViaQrCode = true;
    }
  }

  ngOnInit(): void {
    const qrToken = this.route.snapshot.queryParamMap.get('qrToken');
    if (!qrToken) return;
    this.viaQrCode.set(true);

    // A sessão anônima já foi aberta pelo guard de rota (shared/auth.guard.ts)
    // antes deste componente existir — aqui só resta descobrir o que o token
    // aponta pra montar o formulário.
    this.validandoQrToken.set(true);
    this.dataService
      .validarQrToken(qrToken)
      .then((res) => {
        this.unidadeId.set(res.unidadeId);
        this.unidadeNomeQrCode.set(res.unidadeNome);
        this.unidadeViaQrCode = true;
        this.qrToken = qrToken;
        // QR do equipamento: o nome entra no campo de equipamento (e o
        // backend liga o chamado ao cadastro pelo token). QR de bloco ou
        // sala: o nome vai para "Onde fica".
        if (res.tipo === 'equipamento' && res.nome) {
          this.equipamento = res.nome;
        } else if (res.tipo !== 'unidade' && res.nome) {
          this.local = res.nome;
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

  aoTrocarUnidade(unidadeId: string): void {
    this.unidadeId.set(unidadeId);
    // O equipamento escolhido era da unidade anterior.
    if (this.equipamentoId()) this.limparEquipamento();
  }

  // O que a pessoa digitou na busca. Ao escolher "Outro (descrever)" esse
  // texto vai para o campo livre: antes ele sumia e era preciso digitar de novo.
  private ultimoDigitado = '';

  aoDigitarEquipamento(texto: string): void {
    // O autocomplete também chama aqui com o valor da opção escolhida (o id
    // do equipamento ou o "Outro"); isso não é texto digitado.
    if (texto && texto !== OUTRO && !this.dataService.getEquipamentoById(texto)) this.ultimoDigitado = texto;
    this.buscaEquipamento.set(texto === OUTRO ? '' : texto);
    // Mudou o texto depois de escolher: deixa de ser o equipamento do cadastro.
    if (this.equipamentoId()) this.equipamentoId.set(null);
  }

  escolherEquipamento(evento: MatAutocompleteSelectedEvent): void {
    const valor = evento.option.value as string;
    if (valor === OUTRO) {
      this.equipamentoOutro.set(true);
      this.equipamentoId.set(null);
      this.equipamento = this.ultimoDigitado.trim();
      this.buscaEquipamento.set('');
      return;
    }
    const opcao = this.equipamentosDaUnidade().find(o => o.equipamento.id === valor);
    if (!opcao) return;
    this.equipamentoId.set(opcao.equipamento.id);
    this.equipamento = opcao.equipamento.nome;
    this.buscaEquipamento.set(opcao.equipamento.nome);
    // "Onde fica" já sai do cadastro, se a pessoa ainda não escreveu.
    if (!this.local.trim()) {
      const e = opcao.equipamento;
      this.local = [e.blocoId ? this.dataService.getBlocoById(e.blocoId)?.nome : undefined, this.dataService.getSalaById(e.salaId)?.nome]
        .filter(Boolean)
        .join(', ');
    }
  }

  // O autocomplete mostra o nome do equipamento no campo, não o id.
  readonly mostrarEquipamento = (valor: string | null): string => {
    if (!valor || valor === OUTRO) return '';
    return this.dataService.getEquipamentoById(valor)?.nome ?? valor;
  };

  voltarParaLista(): void {
    // Guarda o que estava escrito: se voltar para "Outro", o texto continua lá.
    if (this.equipamento.trim()) this.ultimoDigitado = this.equipamento;
    this.equipamentoOutro.set(false);
    this.equipamento = '';
  }

  private limparEquipamento(): void {
    this.equipamentoId.set(null);
    this.equipamento = '';
    this.buscaEquipamento.set('');
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

  // Leva ao primeiro campo com erro sem mexer no tamanho da janela. O
  // focus() comum rola todos os contêineres acima do campo, inclusive a
  // moldura do diálogo (overflow: hidden), e a janela parecia encolher, com
  // o cabeçalho cortado. Aqui só o corpo rolável se move.
  private focarPrimeiroErro(): void {
    const corpo = document.querySelector<HTMLElement>('.modal-scrollable-body');
    const campo = corpo?.querySelector<HTMLElement>('.ng-invalid input, input.ng-invalid, textarea.ng-invalid, .ng-invalid textarea, mat-select.ng-invalid');
    if (!campo) return;
    campo.focus({ preventScroll: true });
    if (corpo) {
      const topo = campo.getBoundingClientRect().top - corpo.getBoundingClientRect().top + corpo.scrollTop - 48;
      corpo.scrollTo({ top: Math.max(0, topo), behavior: 'smooth' });
    } else {
      campo.scrollIntoView({ block: 'nearest' });
    }
  }

  removerFoto(): void {
    this.fotoPreview = null;
  }

  salvar(form: NgForm): void {
    if (this.usarLista() && !this.equipamento.trim()) {
      // Campo da lista vazio: o "required" do autocomplete cobre, mas o
      // texto ainda pode estar só na busca.
      this.equipamento = this.buscaEquipamento().trim();
    }
    if (form.invalid || !this.equipamento.trim()) {
      form.control.markAllAsTouched();
      this.focarPrimeiroErro();
      return;
    }
    if (this.enviando()) return;

    const parecido = this.pedidoParecido();
    if (parecido && !(this.confirmouRepetido() && this.repetidoConfirmadoPara === parecido.id)) {
      this.pediuConfirmacaoRepetido.set(true);
      document.querySelector<HTMLElement>('.aviso-repetido input[type="checkbox"]')?.focus();
      return;
    }

    if (this.qrToken) {
      this.salvarPeloQrCode();
      return;
    }

    this.erroEnvio.set(null);
    this.enviando.set(true);
    this.dataService
      .adicionarChamado({
        titulo: this.equipamento.trim(),
        equipamento: this.equipamento.trim(),
        numeroSerie: this.numeroSerie.trim() || undefined,
        descricao: this.descricao,
        unidadeId: this.unidadeId(),
        solicitanteNome: this.solicitante,
        possuiFoto: !!this.fotoPreview,
        foto: this.fotoPreview ?? undefined,
        local: this.local.trim() || undefined,
        urgencia: this.urgencia || undefined,
        equipamentoId: this.equipamentoId() ?? undefined
      })
      .then(res => this.chamadoEnviado.set(res.numero))
      .catch((e: unknown) => {
        this.erroEnvio.set(e instanceof Error && e.message ? e.message : 'Não foi possível enviar o pedido. Confira a internet e tente de novo.');
      })
      .finally(() => this.enviando.set(false));
  }

  private salvarPeloQrCode(): void {
    this.erroEnvio.set(null);
    this.enviando.set(true);

    // A unidade e o id do solicitante não são enviados: o backend tira os
    // dois do token. O que sobe daqui é só o que a pessoa de fato digitou.
    this.dataService.criarChamadoPeloQr({
      titulo: this.equipamento,
      equipamento: this.equipamento,
      numeroSerie: this.numeroSerie || undefined,
      descricao: this.descricao,
      solicitanteNome: this.solicitante,
      possuiFoto: !!this.fotoPreview,
      foto: this.fotoPreview ?? undefined,
      qrToken: this.qrToken!,
      ...(this.local.trim() ? { local: this.local.trim() } : {}),
      ...(this.urgencia ? { urgencia: this.urgencia } : {})
    })
      .then((res) => {
        this.chamadoEnviado.set(res.numero);
      })
      .catch(() => {
        this.erroEnvio.set('Não foi possível enviar o chamado. Verifique sua conexão e tente novamente.');
      })
      .finally(() => {
        this.enviando.set(false);
      });
  }

  cancelar(): void {
    this.fechar();
  }

  private fechar(): void {
    if (this.dialogRef) {
      this.dialogRef.close(this.chamadoEnviado());
    } else if (!this.ehConvidado()) {
      this.router.navigateByUrl(rotaInicial(this.usuarioLogado().perfil));
    }
  }
}

function normalizar(texto: string): string {
  return texto.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();
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
