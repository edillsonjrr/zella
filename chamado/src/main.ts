/**
 * Abertura de chamado por QR Code — tela publica.
 *
 * Vive fora do sistema de proposito. Quem le o QR nao tem login, nao vai
 * navegar em lugar nenhum e quase sempre esta no celular, dentro da sala de
 * maquinas, com sinal ruim. Carregar o Zella inteiro para preencher quatro
 * campos seria o desenho errado.
 *
 * Como a seguranca funciona aqui, ja que nao ha usuario:
 *  - o QR impresso aponta para a Cloud Function, nao para esta tela;
 *  - a cada leitura a function cria um token de 3 minutos e redireciona para
 *    ca com ?qrToken=;
 *  - a unidade e o equipamento do chamado saem SEMPRE do token, no servidor.
 *    Nada do que este arquivo mandar sobre onde o chamado cai e levado em
 *    conta — e o que impede alguem de abrir chamado numa unidade alheia
 *    mexendo no formulario.
 */
import { initializeApp } from 'firebase/app';
import { getAuth, signInAnonymously } from 'firebase/auth';
import { getFunctions, httpsCallable } from 'firebase/functions';

const firebaseConfig = {
  apiKey: 'AIzaSyD8PfRBaeWK6TIt95n49TUPEfZLZAgciWU',
  authDomain: 'gestao-manutencao-app.firebaseapp.com',
  projectId: 'gestao-manutencao-app',
  storageBucket: 'gestao-manutencao-app.firebasestorage.app',
  appId: '1:1084576946618:web:0a7b0dd4b90ba2b0f6b0a5'
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const functions = getFunctions(app, 'southamerica-east1');

interface QrTokenResolvido {
  empresaId: string;
  unidadeId: string;
  unidadeNome: string | null;
  tipo: 'unidade' | 'bloco' | 'sala' | 'equipamento';
  nome?: string;
}

const validarQrToken = httpsCallable<{ token: string }, QrTokenResolvido>(functions, 'validarQrToken');
const criarChamado = httpsCallable<Record<string, unknown>, { id: string; numero?: string }>(functions, 'criarChamado');

const tela = document.getElementById('app') as HTMLElement;
const token = new URLSearchParams(location.search).get('qrToken') ?? '';

/** O rotulo do que foi lido muda conforme o nivel em que o QR estava colado. */
const COMO_CHAMAR: Record<QrTokenResolvido['tipo'], string> = {
  unidade: 'Unidade',
  bloco: 'Bloco',
  sala: 'Sala',
  equipamento: 'Equipamento'
};

function escapar(texto: string): string {
  const d = document.createElement('div');
  d.textContent = texto;
  return d.innerHTML;
}

function mostrarAviso(titulo: string, detalhe: string, comRecarregar = false): void {
  tela.innerHTML = `
    <div class="cartao cartao--aviso">
      <h1>${escapar(titulo)}</h1>
      <p>${escapar(detalhe)}</p>
      ${comRecarregar ? '<button type="button" class="botao" id="tentar">Escaneei de novo</button>' : ''}
    </div>`;
  document.getElementById('tentar')?.addEventListener('click', () => location.reload());
}

/**
 * Conta os 3 minutos do token. O tempo comeca na leitura do QR, e o redirect
 * acontece no mesmo instante, entao contar a partir do carregamento desta
 * pagina erra por menos de um segundo. Quando zera, o formulario sai do ar:
 * e melhor dizer antes do que deixar a pessoa escrever e perder o que digitou.
 */
function iniciarContagem(aoExpirar: () => void): void {
  const fim = Date.now() + 3 * 60 * 1000;
  const alvo = document.getElementById('restante');
  const tique = (): void => {
    const falta = Math.max(0, fim - Date.now());
    if (alvo) {
      const m = Math.floor(falta / 60000);
      const s = Math.floor((falta % 60000) / 1000);
      alvo.textContent = `${m}:${String(s).padStart(2, '0')}`;
      alvo.classList.toggle('acabando', falta < 30000);
    }
    if (falta <= 0) {
      clearInterval(id);
      aoExpirar();
    }
  };
  const id = setInterval(tique, 1000);
  tique();
}

function montarFormulario(alvo: QrTokenResolvido): void {
  const ondeCai = alvo.unidadeNome ? `Unidade ${alvo.unidadeNome}` : 'Unidade identificada pelo QR Code';
  const oQueFoiLido = alvo.nome
    ? `${COMO_CHAMAR[alvo.tipo]}: ${alvo.nome}`
    : COMO_CHAMAR[alvo.tipo];

  tela.innerHTML = `
    <form class="cartao" id="form" novalidate>
      <header class="cabecalho">
        <h1>Abrir chamado</h1>
        <p class="local">${escapar(oQueFoiLido)}</p>
        <p class="unidade">${escapar(ondeCai)}</p>
      </header>

      <label class="campo">
        <span>Seu nome</span>
        <input id="nome" name="nome" type="text" autocomplete="name" required maxlength="80"
               placeholder="Quem está abrindo o chamado" />
      </label>

      <label class="campo">
        <span>O que está acontecendo</span>
        <input id="titulo" name="titulo" type="text" required maxlength="120"
               placeholder="Ex.: ar-condicionado pingando água" />
      </label>

      <label class="campo">
        <span>Detalhes <em>(opcional)</em></span>
        <textarea id="descricao" name="descricao" rows="4" maxlength="1000"
                  placeholder="Desde quando, o que já tentaram, qualquer coisa que ajude"></textarea>
      </label>

      <p class="prazo">Este link vale por <strong id="restante">3:00</strong>. Depois disso, é só escanear o QR de novo.</p>

      <p class="erro" id="erro" hidden></p>

      <button type="submit" class="botao" id="enviar">Enviar chamado</button>
    </form>`;

  const form = document.getElementById('form') as HTMLFormElement;
  const botao = document.getElementById('enviar') as HTMLButtonElement;
  const erro = document.getElementById('erro') as HTMLElement;

  iniciarContagem(() => {
    mostrarAviso(
      'O link expirou',
      'Por segurança, o link vale 3 minutos a partir da leitura. Escaneie o QR Code de novo para abrir o chamado.',
      true
    );
  });

  form.addEventListener('submit', async (evento) => {
    evento.preventDefault();
    erro.hidden = true;

    const nome = (document.getElementById('nome') as HTMLInputElement).value.trim();
    const titulo = (document.getElementById('titulo') as HTMLInputElement).value.trim();
    const descricao = (document.getElementById('descricao') as HTMLTextAreaElement).value.trim();

    if (!nome || !titulo) {
      erro.textContent = 'Preencha seu nome e o que está acontecendo.';
      erro.hidden = false;
      return;
    }

    botao.disabled = true;
    botao.textContent = 'Enviando…';

    try {
      // `equipamento` e so o que a pessoa ve; a unidade real vem do token, no
      // servidor. Nao mando unidadeId de proposito: o backend ignoraria.
      const resposta = await criarChamado({
        titulo,
        equipamento: alvo.nome ?? COMO_CHAMAR[alvo.tipo],
        descricao: descricao || titulo,
        solicitanteNome: nome,
        possuiFoto: false,
        qrToken: token
      });

      const numero = resposta.data?.numero;
      tela.innerHTML = `
        <div class="cartao cartao--ok">
          <div class="marca-ok" aria-hidden="true">
            <svg viewBox="0 0 24 24"><path d="M5 13l4 4L19 7" /></svg>
          </div>
          <h1>Chamado aberto</h1>
          <p>${numero ? `Registrado como <strong>${escapar(numero)}</strong>. ` : ''}A equipe de manutenção já recebeu.</p>
          <p class="miudo">Pode fechar esta página. Para abrir outro chamado, escaneie o QR Code de novo.</p>
        </div>`;
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Não foi possível enviar.';
      // Token vencido no meio do preenchimento: dizer o que fazer, nao so o erro.
      if (/expirad|deadline|not-found|inválido/i.test(msg)) {
        mostrarAviso('O link expirou', 'Escaneie o QR Code de novo e envie outra vez.', true);
        return;
      }
      erro.textContent = msg;
      erro.hidden = false;
      botao.disabled = false;
      botao.textContent = 'Enviar chamado';
    }
  });
}

async function iniciar(): Promise<void> {
  if (!token) {
    mostrarAviso(
      'Escaneie o QR Code',
      'Esta página só abre a partir do QR Code colado no equipamento ou na parede do setor.'
    );
    return;
  }

  try {
    // Sessao anonima: o backend recusa anonimo sem token de QR, entao ela nao
    // da acesso a nada por si so.
    await signInAnonymously(auth);
    const alvo = await validarQrToken({ token });
    montarFormulario(alvo.data);
  } catch (e) {
    const msg = e instanceof Error ? e.message : '';
    if (/expirad|deadline/i.test(msg)) {
      mostrarAviso('O link expirou', 'O link vale 3 minutos a partir da leitura. Escaneie o QR Code de novo.', true);
    } else if (/not-found|inválido/i.test(msg)) {
      mostrarAviso('Link inválido', 'Escaneie o QR Code de novo. Se continuar, avise a manutenção.', true);
    } else {
      mostrarAviso('Não foi possível abrir', msg || 'Tente de novo em instantes.', true);
    }
  }
}

void iniciar();
