import { lerCsv, montarCsv, normalizarTexto } from './csv';
import type { Bloco, Equipamento, Sala, Unidade } from './models';

/**
 * Importação de equipamentos por planilha (Z3.1): leitura e conferência,
 * linha a linha, antes de gravar qualquer coisa. Sem Firestore aqui: a
 * gravação é da tela, pelo mesmo caminho do cadastro manual
 * (DataService.salvarBloco, salvarSala e salvarEquipamento).
 *
 * Regras:
 * - a unidade tem que existir (pelo nome ou pela sigla);
 * - bloco e sala que não existem são criados, e a conferência avisa;
 * - patrimônio não pode repetir, nem no cadastro nem na planilha.
 */

export const COLUNAS_MODELO = ['unidade', 'bloco', 'sala', 'nome', 'patrimonio', 'fabricante', 'modelo'] as const;
type Coluna = (typeof COLUNAS_MODELO)[number];

export const MAX_LINHAS = 2000;
const LIMITE: Record<Coluna, number> = { unidade: 120, bloco: 80, sala: 80, nome: 120, patrimonio: 40, fabricante: 60, modelo: 60 };
const NOME_COLUNA: Record<Coluna, string> = {
  unidade: 'unidade', bloco: 'bloco', sala: 'sala', nome: 'nome', patrimonio: 'patrimônio', fabricante: 'fabricante', modelo: 'modelo'
};

export interface CadastroAtual {
  unidades: Unidade[];
  blocos: Bloco[];
  salas: Sala[];
  equipamentos: Equipamento[];
}

export type SituacaoLinha = 'ok' | 'aviso' | 'erro';

export interface LinhaImportada {
  // Número da linha na planilha, contando o cabeçalho.
  linha: number;
  unidade: string;
  bloco: string;
  sala: string;
  nome: string;
  patrimonio: string;
  fabricante: string;
  modelo: string;
  unidadeId?: string;
  unidadeNome?: string;
  // Existentes. Quando o bloco ou a sala é novo, vem a chave do que será criado.
  blocoId?: string;
  salaId?: string;
  chaveBlocoNovo?: string;
  chaveSalaNova?: string;
  erros: string[];
  avisos: string[];
  situacao: SituacaoLinha;
}

export interface BlocoNovo {
  chave: string;
  unidadeId: string;
  nome: string;
}

export interface SalaNova {
  chave: string;
  unidadeId: string;
  blocoId?: string;
  chaveBlocoNovo?: string;
  nome: string;
}

export interface ConferenciaImportacao {
  linhas: LinhaImportada[];
  blocosNovos: BlocoNovo[];
  salasNovas: SalaNova[];
  comErro: number;
  comAviso: number;
  // Problema do arquivo inteiro (vazio, sem as colunas, grande demais).
  erroGeral: string;
}

// "PAT-0021", "pat 0021" e "0021" são o mesmo patrimônio.
function chavePatrimonio(codigo: string): string {
  return normalizarTexto(codigo).replace(/^pat[\s._-]*/, '').replace(/\s/g, '');
}

function colunaDoCabecalho(titulo: string): Coluna | null {
  const t = normalizarTexto(titulo);
  if (t.includes('unidade')) return 'unidade';
  if (t.includes('bloco')) return 'bloco';
  if (t.includes('sala') || t === 'local') return 'sala';
  if (t.includes('patrimonio')) return 'patrimonio';
  if (t.includes('fabricante') || t === 'marca') return 'fabricante';
  if (t.includes('modelo')) return 'modelo';
  if (t.includes('nome') || t.includes('equipamento')) return 'nome';
  return null;
}

function vazia(mensagem: string): ConferenciaImportacao {
  return { linhas: [], blocosNovos: [], salasNovas: [], comErro: 0, comAviso: 0, erroGeral: mensagem };
}

export function conferirPlanilhaEquipamentos(texto: string, cadastro: CadastroAtual): ConferenciaImportacao {
  const registros = lerCsv(texto);
  if (!registros.length) return vazia('O arquivo está vazio. Baixe o modelo, preencha e salve como CSV.');

  // Cabeçalho: a primeira linha que fala de unidade e sala. Sem ele, vale a
  // ordem do modelo.
  const primeira = registros[0].map(colunaDoCabecalho);
  const temCabecalho = primeira.includes('unidade') && primeira.includes('sala');
  const indice = new Map<Coluna, number>();
  if (temCabecalho) {
    primeira.forEach((c, i) => {
      if (c && !indice.has(c)) indice.set(c, i);
    });
    const faltando = (['unidade', 'sala', 'nome'] as Coluna[]).filter(c => !indice.has(c));
    if (faltando.length) {
      return vazia(`Faltam colunas na planilha: ${faltando.map(c => NOME_COLUNA[c]).join(', ')}. Use o modelo.`);
    }
  } else {
    COLUNAS_MODELO.forEach((c, i) => indice.set(c, i));
  }
  const dados = temCabecalho ? registros.slice(1) : registros;
  if (!dados.length) return vazia('A planilha só tem o cabeçalho. Preencha uma linha por equipamento.');
  if (dados.length > MAX_LINHAS) {
    return vazia(`A planilha tem ${dados.length} linhas. O limite é ${MAX_LINHAS} por vez: divida em mais de um arquivo.`);
  }

  const unidadePorNome = new Map<string, Unidade>();
  for (const u of cadastro.unidades) {
    unidadePorNome.set(normalizarTexto(u.nome), u);
    if (u.sigla) unidadePorNome.set(normalizarTexto(u.sigla), u);
  }
  const patrimonios = new Map<string, Equipamento>();
  for (const e of cadastro.equipamentos) {
    if (e.patrimonio) patrimonios.set(chavePatrimonio(e.patrimonio), e);
  }
  const salaPorId = new Map(cadastro.salas.map(s => [s.id, s]));

  const blocosNovos = new Map<string, BlocoNovo>();
  const salasNovas = new Map<string, SalaNova>();
  const patrimoniosNaPlanilha = new Map<string, number>();

  const linhas = dados.map((registro, i): LinhaImportada => {
    const valor = (c: Coluna) => (indice.has(c) ? (registro[indice.get(c)!] ?? '').trim().replace(/\s+/g, ' ') : '');
    const l: LinhaImportada = {
      linha: i + (temCabecalho ? 2 : 1),
      unidade: valor('unidade'),
      bloco: valor('bloco'),
      sala: valor('sala'),
      nome: valor('nome'),
      patrimonio: valor('patrimonio'),
      fabricante: valor('fabricante'),
      modelo: valor('modelo'),
      erros: [],
      avisos: [],
      situacao: 'ok'
    };

    for (const c of COLUNAS_MODELO) {
      if (l[c].length > LIMITE[c]) l.erros.push(`O campo ${NOME_COLUNA[c]} passa de ${LIMITE[c]} letras.`);
    }
    if (!l.nome) l.erros.push('Falta o nome do equipamento.');
    if (!l.sala) l.erros.push('Falta a sala. Todo equipamento fica numa sala.');

    const unidade = l.unidade ? unidadePorNome.get(normalizarTexto(l.unidade)) : undefined;
    if (!l.unidade) {
      l.erros.push('Falta a unidade.');
    } else if (!unidade) {
      l.erros.push(`A unidade "${l.unidade}" não está cadastrada. Use o nome que aparece em Unidades.`);
    } else {
      l.unidadeId = unidade.id;
      l.unidadeNome = unidade.nome;
    }

    if (unidade && l.sala) {
      const nomeSala = normalizarTexto(l.sala);
      if (l.bloco) {
        const bloco = cadastro.blocos.find(b => b.unidadeId === unidade.id && normalizarTexto(b.nome) === normalizarTexto(l.bloco));
        if (bloco) {
          l.blocoId = bloco.id;
          const sala = cadastro.salas.find(s => s.unidadeId === unidade.id && s.blocoId === bloco.id && normalizarTexto(s.nome) === nomeSala);
          if (sala) l.salaId = sala.id;
        } else {
          const chave = `${unidade.id}|${normalizarTexto(l.bloco)}`;
          if (!blocosNovos.has(chave)) blocosNovos.set(chave, { chave, unidadeId: unidade.id, nome: l.bloco });
          l.chaveBlocoNovo = chave;
          l.avisos.push(`Bloco novo: "${l.bloco}" será criado em ${unidade.nome}.`);
        }
      } else {
        const soltas = cadastro.salas.filter(s => s.unidadeId === unidade.id && !s.blocoId && normalizarTexto(s.nome) === nomeSala);
        const emBlocos = cadastro.salas.filter(s => s.unidadeId === unidade.id && s.blocoId && normalizarTexto(s.nome) === nomeSala);
        if (soltas.length) {
          l.salaId = soltas[0].id;
        } else if (emBlocos.length === 1) {
          l.salaId = emBlocos[0].id;
          l.blocoId = emBlocos[0].blocoId;
        } else if (emBlocos.length > 1) {
          l.erros.push(`Há mais de uma sala "${l.sala}" nesta unidade, em blocos diferentes. Preencha a coluna bloco.`);
        }
      }

      if (!l.salaId && !l.erros.length) {
        const chave = `${unidade.id}|${l.blocoId ?? l.chaveBlocoNovo ?? ''}|${nomeSala}`;
        if (!salasNovas.has(chave)) {
          salasNovas.set(chave, { chave, unidadeId: unidade.id, blocoId: l.blocoId, chaveBlocoNovo: l.chaveBlocoNovo, nome: l.sala });
        }
        l.chaveSalaNova = chave;
        l.avisos.push(`Sala nova: "${l.sala}" será criada${l.bloco ? ` no bloco ${l.bloco}` : ''}.`);
      }
    }

    if (l.patrimonio) {
      const chave = chavePatrimonio(l.patrimonio);
      const existente = patrimonios.get(chave);
      if (existente) {
        const sala = salaPorId.get(existente.salaId)?.nome;
        l.erros.push(`O patrimônio ${l.patrimonio} já está cadastrado (${existente.nome}${sala ? `, ${sala}` : ''}).`);
      } else if (patrimoniosNaPlanilha.has(chave)) {
        l.erros.push(`O patrimônio ${l.patrimonio} se repete na planilha (linha ${patrimoniosNaPlanilha.get(chave)}).`);
      } else {
        patrimoniosNaPlanilha.set(chave, l.linha);
      }
    }

    if (l.salaId && l.nome && !l.patrimonio) {
      const igual = cadastro.equipamentos.some(e => e.salaId === l.salaId && normalizarTexto(e.nome) === normalizarTexto(l.nome));
      if (igual) l.avisos.push('Já existe um equipamento com este nome nesta sala. Se for outro igual, pode gravar.');
    }

    l.situacao = l.erros.length ? 'erro' : l.avisos.length ? 'aviso' : 'ok';
    return l;
  });

  // Bloco ou sala novos de linhas com erro não entram na conta do que será criado.
  const validas = linhas.filter(l => l.situacao !== 'erro');
  const salasUsadas = new Set(validas.map(l => l.chaveSalaNova).filter(Boolean));
  const salas = [...salasNovas.values()].filter(s => salasUsadas.has(s.chave));
  const blocosUsados = new Set([...validas.map(l => l.chaveBlocoNovo), ...salas.map(s => s.chaveBlocoNovo)].filter(Boolean));
  const blocos = [...blocosNovos.values()].filter(b => blocosUsados.has(b.chave));

  return {
    linhas,
    blocosNovos: blocos,
    salasNovas: salas,
    comErro: linhas.filter(l => l.situacao === 'erro').length,
    comAviso: linhas.filter(l => l.situacao === 'aviso').length,
    erroGeral: ''
  };
}

/** Modelo para baixar, com uma linha de exemplo na primeira unidade cadastrada. */
export function modeloCsv(unidadeExemplo = 'Nome da unidade'): string {
  return montarCsv(
    [...COLUNAS_MODELO],
    [
      [unidadeExemplo, 'Bloco A', 'Sala 12', 'Ar-condicionado 12000 BTUs', '0021', 'LG', 'S4-W12JA3AA'],
      [unidadeExemplo, '', 'Recepção', 'Bebedouro', '', '', '']
    ]
  );
}
