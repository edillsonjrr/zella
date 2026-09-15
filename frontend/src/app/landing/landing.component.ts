import { AfterViewInit, Component, ElementRef, OnDestroy, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { LogoComponent } from '../shared/logo/logo.component';
import { IconComponent } from '../shared/icon/icon.component';
import { FlowButtonComponent } from '../shared/flow-button/flow-button.component';
import { ThemeToggleComponent } from '../theme-toggle/theme-toggle.component';

interface Etapa {
  numero: string;
  titulo: string;
  texto: string;
  quem: string;
  icone: string;
}

interface Recurso {
  titulo: string;
  texto: string;
  icone: string;
  destaque?: boolean;
}

interface Perfil {
  nome: string;
  papel: string;
  itens: string[];
  icone: string;
}

/**
 * Site institucional (primeiro acesso). Rota pública em "/": quem já tem
 * sessão é mandado direto pra própria tela inicial pelo guard da rota.
 *
 * Referências de padrão (details.so): hero com revelação de texto em
 * gradiente, faixa infinita de capacidades, passos com revelação no scroll,
 * grade bento de recursos com hover de cartão, acordeão de perguntas e CTA
 * final. Tudo em CSS e IntersectionObserver, sem biblioteca.
 */
@Component({
  selector: 'app-landing',
  standalone: true,
  imports: [RouterLink, LogoComponent, IconComponent, FlowButtonComponent, ThemeToggleComponent],
  templateUrl: './landing.component.html',
  styleUrl: './landing.component.scss'
})
export class LandingComponent implements AfterViewInit, OnDestroy {
  private host = inject(ElementRef<HTMLElement>);
  private observer?: IntersectionObserver;

  menuAberto = signal(false);
  perguntaAberta = signal<number | null>(0);

  // Colunas do quadro do hero: o cartão em destaque percorre as quatro.
  readonly colunas = ['Aberto', 'Orçamento', 'Aprovado', 'Executado'];

  readonly capacidades = [
    'Trava de saldo por item',
    'Chamado por QR Code',
    'Aprovação com ajuste',
    'Execução parcial',
    'Aditivo de contrato',
    'Manutenção preventiva',
    'Fotos de evidência',
    'Histórico auditável',
    'Importação por planilha',
    'Notificações por perfil'
  ];

  readonly etapas: Etapa[] = [
    { numero: '01', titulo: 'Chamado aberto', texto: 'Pela tela ou escaneando o QR Code colado no equipamento, sem login. Já nasce com prazo.', quem: 'Cliente ou qualquer pessoa na unidade', icone: 'qr_code' },
    { numero: '02', titulo: 'Ordem de serviço', texto: 'O gestor transforma o chamado em OS dentro de um contrato e designa a contratada.', quem: 'Gestor', icone: 'assignment' },
    { numero: '03', titulo: 'Orçamento', texto: 'A contratada escolhe itens do contrato. Preço vem do contrato e quantidade acima do saldo é recusada.', quem: 'Contratada', icone: 'request_quote' },
    { numero: '04', titulo: 'Aprovação', texto: 'O gestor aprova, podendo reduzir quantidades. Nesse momento o saldo do contrato é reservado.', quem: 'Gestor', icone: 'check_circle' },
    { numero: '05', titulo: 'Execução', texto: 'O técnico informa o que executou de fato, com fotos. A sobra volta para o saldo.', quem: 'Técnico ou gestor da contratada', icone: 'build' },
    { numero: '06', titulo: 'Encerramento', texto: 'Chamado encerrado, saldo consumido e cada passo registrado no histórico.', quem: 'Gestor', icone: 'lock' }
  ];

  readonly recursos: Recurso[] = [
    { titulo: 'Saldo de contrato que não estoura', texto: 'Disponível, reservado e consumido por item, calculados pelo sistema e nunca digitados à mão. A aprovação só passa se houver saldo.', icone: 'account_balance_wallet', destaque: true },
    { titulo: 'QR Code no equipamento', texto: 'Quem está no local abre o chamado pelo celular, sem conta, já na unidade certa.', icone: 'qr_code' },
    { titulo: 'Aditivos e encerramento', texto: 'Quantidade e vigência só mudam por aditivo registrado. Encerrar contrato bloqueia se houver reserva pendente.', icone: 'description' },
    { titulo: 'Preventiva automática', texto: 'Planos por equipamento geram o chamado na data certa, todo dia às 6h.', icone: 'calendar_check' },
    { titulo: 'Evidência com foto', texto: 'Foto na abertura do chamado e na execução da OS, guardadas com o registro.', icone: 'photo_camera' },
    { titulo: 'Tudo registrado', texto: 'Quem fez o quê e quando, em cada chamado, OS e contrato. Histórico que ninguém edita.', icone: 'fact_check', destaque: true },
    { titulo: 'Avisos para quem precisa agir', texto: 'Orçamento pendente, aprovado ou OS executada chegam no sino de cada perfil.', icone: 'notifications' },
    { titulo: 'Contratos por planilha', texto: 'Importe contratos e itens em CSV com validação linha a linha antes de gravar.', icone: 'upload_file' }
  ];

  readonly perfis: Perfil[] = [
    { nome: 'Gestor', papel: 'Dono dos contratos', itens: ['Abre OS e aprova orçamentos', 'Registra aditivos', 'Acompanha saldo e prazos'], icone: 'group' },
    { nome: 'Contratada', papel: 'Empresa prestadora', itens: ['Orça com itens do contrato', 'Designa técnicos', 'Executa e comprova com foto'], icone: 'engineering' },
    { nome: 'Técnico', papel: 'Quem vai a campo', itens: ['Vê as OS designadas', 'Envia orçamento', 'Registra a execução'], icone: 'build' },
    { nome: 'Cliente', papel: 'Quem usa o espaço', itens: ['Abre chamado da unidade', 'Acompanha o andamento', 'Recebe o retorno'], icone: 'person' }
  ];

  readonly perguntas = [
    { p: 'O que impede gastar além do contrato?', r: 'Cada item do contrato tem saldo disponível, reservado e consumido. Orçamento acima do disponível é recusado, a aprovação reserva e a execução consome. Ninguém edita esses números à mão.' },
    { p: 'A empresa contratada precisa de várias contas?', r: 'Não. O gestor da contratada faz tudo que o técnico faz. Uma contratada de uma pessoa só funciona com um único usuário.' },
    { p: 'Quem está no local precisa ter login para abrir chamado?', r: 'Não. Pelo QR Code do equipamento, a pessoa informa o nome, descreve o problema e anexa foto. O chamado cai na unidade certa.' },
    { p: 'E se o serviço não usar tudo que foi aprovado?', r: 'Na execução o técnico informa a quantidade real. O que sobrou volta para o saldo do contrato na hora.' },
    { p: 'Os dados de uma empresa ficam separados das outras?', r: 'Sim. Cada empresa cliente tem seu espaço isolado, e cada perfil só enxerga o que lhe cabe: o cliente vê a própria unidade, a contratada vê os próprios contratos.' }
  ];

  alternarPergunta(i: number): void {
    this.perguntaAberta.update(atual => (atual === i ? null : i));
  }

  ngAfterViewInit(): void {
    const alvos = this.host.nativeElement.querySelectorAll('[data-revelar]');
    if (!('IntersectionObserver' in window)) {
      alvos.forEach((el: Element) => el.classList.add('revelado'));
      return;
    }
    this.observer = new IntersectionObserver(
      entradas => {
        for (const e of entradas) {
          if (e.isIntersecting) {
            e.target.classList.add('revelado');
            this.observer?.unobserve(e.target);
          }
        }
      },
      { threshold: 0.15, rootMargin: '0px 0px -40px 0px' }
    );
    alvos.forEach((el: Element) => this.observer!.observe(el));
  }

  ngOnDestroy(): void {
    this.observer?.disconnect();
  }
}
