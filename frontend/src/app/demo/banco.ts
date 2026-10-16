import { signal } from '@angular/core';
import { montarDadosDemo } from './semente';
import type { DadosDemo } from './tipos';

/**
 * O "banco" da demonstração: os dados da empresa de exemplo em memória,
 * guardados no navegador para sobreviver a um recarregar.
 *
 * Uma chave só no localStorage, com versão: quando o formato mudar, sobe a
 * versão e quem tinha dados antigos recomeça dos dados de exemplo, em vez de
 * abrir telas com campos faltando. Quem está na sessão fica à parte, no
 * sessionStorage da aba: assim a prévia do QR Code, que abre em outra aba,
 * chega como quem escaneou a plaqueta (sem login), igual ao de verdade.
 */

const CHAVE = 'zella-demo';
const VERSAO = 4;
const CHAVE_SESSAO = 'zella-demo-sessao';
// Cópia no navegador do "O que você faz aqui" (layout.component.ts).
const PREFIXO_BOAS_VINDAS = 'zella-boas-vindas-demo-';

interface Gravado {
  versao: number;
  dados: DadosDemo;
  // Perfis que já viram o cartão de boas-vindas da demonstração.
  cartoesVistos: string[];
}

function lerGravado(): Gravado | null {
  try {
    const bruto = localStorage.getItem(CHAVE);
    if (!bruto) return null;
    const lido = JSON.parse(bruto) as Gravado;
    return lido?.versao === VERSAO && lido.dados ? lido : null;
  } catch {
    return null;
  }
}

// Fotos são o que mais pesa. Se o navegador recusar por espaço, guarda sem
// elas: perder a foto é melhor que perder o que a pessoa fez.
function semFotos(dados: DadosDemo): DadosDemo {
  return {
    ...dados,
    chamados: dados.chamados.map(c => (c.fotoPath?.startsWith('data:') ? { ...c, fotoPath: undefined, possuiFoto: false } : c)),
    ordensServico: dados.ordensServico.map(o => (o.fotosExecucao?.length ? { ...o, fotosExecucao: undefined } : o))
  };
}

class BancoDemo {
  private dados: DadosDemo;
  private cartoes: string[];
  private sessaoId: string | null;

  /** Muda a cada gravação: é o que faz os signals do DataService recalcularem. */
  readonly revisao = signal(0);

  constructor() {
    const gravado = lerGravado();
    this.dados = gravado?.dados ?? montarDadosDemo();
    this.cartoes = gravado?.cartoesVistos ?? [];
    if (!gravado) this.gravar();
    this.sessaoId = this.lerSessao();

    // Outra aba mexeu (a prévia do QR Code abriu um chamado, por exemplo):
    // esta aba passa a ver o mesmo. Só os dados; a sessão é de cada aba.
    if (typeof window !== 'undefined') {
      window.addEventListener('storage', evento => {
        if (evento.key !== CHAVE) return;
        const lido = lerGravado();
        if (!lido) return;
        this.dados = lido.dados;
        this.cartoes = lido.cartoesVistos;
        this.revisao.update(n => n + 1);
      });
    }
  }

  /** Os dados atuais. Só leitura: para mudar, use `alterar`. */
  ler(): DadosDemo {
    return this.dados;
  }

  /**
   * Faz a mudança numa cópia e só grava se ela terminar sem erro, como a
   * transação das functions: uma regra que recusa no meio do caminho não
   * deixa metade da ação gravada.
   */
  alterar<T>(mudar: (dados: DadosDemo) => T): T {
    const copia = structuredClone(this.dados);
    const resultado = mudar(copia);
    this.dados = copia;
    this.gravar();
    this.revisao.update(n => n + 1);
    return resultado;
  }

  /** "Recomeçar" (volta aos dados de exemplo): refaz tudo, mantém quem está na sessão. */
  voltarAoExemplo(): void {
    this.dados = montarDadosDemo();
    try {
      for (const chave of Object.keys(localStorage)) {
        if (chave.startsWith(PREFIXO_BOAS_VINDAS)) localStorage.removeItem(chave);
      }
    } catch {
      // Sem armazenamento: não há o que limpar.
    }
    this.gravar();
    this.revisao.update(n => n + 1);
  }

  /* Sessão ---------------------------------------------------------------- */

  /** Id do cadastro na sessão, 'convidado' (QR Code) ou null. */
  get sessao(): string | null {
    return this.sessaoId;
  }

  definirSessao(id: string | null): void {
    this.sessaoId = id;
    try {
      if (id) sessionStorage.setItem(CHAVE_SESSAO, id);
      else sessionStorage.removeItem(CHAVE_SESSAO);
    } catch {
      // Sem armazenamento: a sessão vale até recarregar.
    }
  }

  /* Cartão de boas-vindas -------------------------------------------------- */

  cartaoVisto(chave: string): boolean {
    return this.cartoes.includes(chave);
  }

  marcarCartaoVisto(chave: string): void {
    if (this.cartoes.includes(chave)) return;
    this.cartoes = [...this.cartoes, chave];
    this.gravar();
  }

  private lerSessao(): string | null {
    try {
      return sessionStorage.getItem(CHAVE_SESSAO);
    } catch {
      return null;
    }
  }

  private gravar(): void {
    const gravar = (dados: DadosDemo) =>
      localStorage.setItem(CHAVE, JSON.stringify({ versao: VERSAO, dados, cartoesVistos: this.cartoes } satisfies Gravado));
    try {
      gravar(this.dados);
    } catch {
      try {
        gravar(semFotos(this.dados));
      } catch {
        // Sem armazenamento (aba privada, cota cheia): vale até recarregar.
      }
    }
  }
}

export const banco = new BancoDemo();
