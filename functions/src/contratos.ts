import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { db, colecao, exigirPerfil } from './admin';
import { resolverAutor } from './logs';

// Layout esperado (CSV, ; como separador):
//   contrato;fornecedor;vigencia_inicio;vigencia_fim;item;quantidade
// Opcionalmente com mais duas colunas no fim:
//   ;unidade;preco_unitario
// Datas em dd/mm/aaaa, decimais com vírgula ou ponto.
interface LinhaValidada {
  linha: number;
  contrato: string;
  fornecedor: string;
  vigenciaInicio: string; // ISO yyyy-mm-dd
  vigenciaFim: string;
  item: string;
  quantidade: number;
  unidadeMedida: string;
  precoUnitario: number;
}

export interface ErroLinha {
  linha: number;
  mensagem: string;
}

function paraIso(dataBr: string): string | null {
  const m = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(dataBr.trim());
  if (!m) return null;
  const [, dia, mes, ano] = m;
  return `${ano}-${mes}-${dia}`;
}

function numero(texto: string): number {
  return Number(texto.trim().replace(/\./g, '').replace(',', '.'));
}

export function validarLinhas(csv: string): { linhas: LinhaValidada[]; erros: ErroLinha[] } {
  const erros: ErroLinha[] = [];
  const linhas: LinhaValidada[] = [];

  const registros = (csv ?? '')
    .replace(/^﻿/, '')
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);

  if (!registros.length) {
    return { linhas, erros: [{ linha: 0, mensagem: 'Arquivo vazio.' }] };
  }

  const cabecalho = registros[0].toLowerCase();
  const temCabecalho = cabecalho.startsWith('contrato');
  const dados = temCabecalho ? registros.slice(1) : registros;

  dados.forEach((linha, i) => {
    const numeroLinha = i + (temCabecalho ? 2 : 1);
    const campos = linha.split(';').map((c) => c.trim());
    if (campos.length !== 6 && campos.length !== 8) {
      erros.push({ linha: numeroLinha, mensagem: `esperado 6 ou 8 campos, encontrado ${campos.length}.` });
      return;
    }
    const [contrato, fornecedor, vigIniBr, vigFimBr, item, qtdStr, unidade, precoStr] = campos;

    if (!contrato || !fornecedor || !item) {
      erros.push({ linha: numeroLinha, mensagem: 'contrato, fornecedor e item são obrigatórios.' });
      return;
    }

    const vigenciaInicio = paraIso(vigIniBr);
    const vigenciaFim = paraIso(vigFimBr);
    if (!vigenciaInicio || !vigenciaFim) {
      erros.push({ linha: numeroLinha, mensagem: 'data inválida (use dd/mm/aaaa).' });
      return;
    }
    if (vigenciaInicio >= vigenciaFim) {
      erros.push({ linha: numeroLinha, mensagem: 'vigência início deve ser antes da vigência fim.' });
      return;
    }

    const quantidade = numero(qtdStr);
    if (!Number.isFinite(quantidade) || quantidade <= 0) {
      erros.push({ linha: numeroLinha, mensagem: 'quantidade deve ser um número maior que zero.' });
      return;
    }

    let precoUnitario = 0;
    if (precoStr !== undefined && precoStr !== '') {
      precoUnitario = numero(precoStr);
      if (!Number.isFinite(precoUnitario) || precoUnitario < 0) {
        erros.push({ linha: numeroLinha, mensagem: 'preço unitário inválido.' });
        return;
      }
    }

    linhas.push({
      linha: numeroLinha,
      contrato,
      fornecedor,
      vigenciaInicio,
      vigenciaFim,
      item,
      quantidade,
      unidadeMedida: unidade || 'un',
      precoUnitario
    });
  });

  // O mesmo contrato precisa ter fornecedor e vigência iguais em todas as
  // linhas; do contrário não dá pra saber qual cabeçalho vale.
  const cabecalhos = new Map<string, LinhaValidada>();
  for (const l of linhas) {
    const primeira = cabecalhos.get(l.contrato);
    if (!primeira) {
      cabecalhos.set(l.contrato, l);
      continue;
    }
    if (primeira.fornecedor !== l.fornecedor || primeira.vigenciaInicio !== l.vigenciaInicio || primeira.vigenciaFim !== l.vigenciaFim) {
      erros.push({ linha: l.linha, mensagem: `contrato ${l.contrato} aparece com fornecedor ou vigência diferentes da linha ${primeira.linha}.` });
    }
  }

  return { linhas, erros };
}

async function contratosExistentes(empresaId: string, numeros: string[]): Promise<string[]> {
  const existentes = await Promise.all(
    numeros.map(async (n) => {
      const snap = await colecao(empresaId, 'contratos').where('numero', '==', n).limit(1).get();
      return snap.empty ? null : n;
    })
  );
  return existentes.filter((n): n is string => n !== null);
}

// Fornecedor da planilha casado com o cadastro de empresas contratadas pelo
// nome (sem diferenciar maiúsculas). Sem casamento, o contrato nasce sem
// contratada e o gestor liga depois.
async function contratadasPorNome(empresaId: string): Promise<Map<string, string>> {
  const snap = await colecao(empresaId, 'empresasContratadas').get();
  const mapa = new Map<string, string>();
  for (const d of snap.docs) {
    const nome = (d.data().nome as string | undefined)?.trim().toLowerCase();
    if (nome) mapa.set(nome, d.id);
  }
  return mapa;
}

export interface ResultadoValidacao {
  totalLinhas: number;
  contratos: number;
  erros: ErroLinha[];
  contratosExistentes: string[];
  fornecedoresSemCadastro: string[];
  valido: boolean;
}

export const validarImportacaoContratos = onCall<{ csv: string }>(async (request): Promise<ResultadoValidacao> => {
  const { empresaId } = exigirPerfil(request, ['gestor']);

  const { linhas, erros } = validarLinhas(request.data?.csv);
  const numerosUnicos = [...new Set(linhas.map((l) => l.contrato))];
  const existentes = await contratosExistentes(empresaId, numerosUnicos);
  const contratadas = await contratadasPorNome(empresaId);
  const fornecedoresSemCadastro = [...new Set(linhas.map((l) => l.fornecedor))]
    .filter((f) => !contratadas.has(f.trim().toLowerCase()));

  return {
    totalLinhas: linhas.length,
    contratos: numerosUnicos.length,
    erros,
    contratosExistentes: existentes,
    fornecedoresSemCadastro,
    valido: erros.length === 0 && existentes.length === 0 && linhas.length > 0
  };
});

export const importarContratos = onCall<{ csv: string }>(async (request) => {
  const { empresaId } = exigirPerfil(request, ['gestor']);

  const { linhas, erros } = validarLinhas(request.data?.csv);
  if (erros.length) {
    throw new HttpsError('invalid-argument', `Importação recusada: ${erros.map((e) => `linha ${e.linha}: ${e.mensagem}`).join(' | ')}`);
  }
  if (!linhas.length) {
    throw new HttpsError('invalid-argument', 'A planilha não tem linhas de dados.');
  }
  if (linhas.length > 400) {
    throw new HttpsError('invalid-argument', 'Máximo de 400 linhas por importação.');
  }

  const numerosUnicos = [...new Set(linhas.map((l) => l.contrato))];
  const jaExiste = await contratosExistentes(empresaId, numerosUnicos);
  if (jaExiste.length) {
    throw new HttpsError('invalid-argument', `Contratos já existentes: ${jaExiste.join(', ')}`);
  }

  const contratadas = await contratadasPorNome(empresaId);
  const autor = await resolverAutor(request, empresaId);

  const batch = db.batch();
  const porContrato = new Map<string, LinhaValidada[]>();
  for (const linha of linhas) {
    const lista = porContrato.get(linha.contrato) ?? [];
    lista.push(linha);
    porContrato.set(linha.contrato, lista);
  }

  const criados: { id: string; numero: string }[] = [];
  for (const [numeroContrato, itensLinhas] of porContrato) {
    const contratoRef = colecao(empresaId, 'contratos').doc();
    const primeira = itensLinhas[0];
    const empresaContratadaId = contratadas.get(primeira.fornecedor.trim().toLowerCase());
    batch.set(contratoRef, {
      id: contratoRef.id,
      numero: numeroContrato,
      fornecedor: primeira.fornecedor,
      ...(empresaContratadaId ? { empresaContratadaId } : {}),
      vigenciaInicio: primeira.vigenciaInicio,
      vigenciaFim: primeira.vigenciaFim,
      status: 'Ativo'
    });

    for (const linha of itensLinhas) {
      const itemRef = contratoRef.collection('itens').doc();
      batch.set(itemRef, {
        id: itemRef.id,
        // Repetido no item de propósito: a tela de contratos lê os itens
        // por collection group, e a regra dessa leitura só consegue
        // filtrar por campo do documento, não pelo caminho.
        empresaId,
        nome: linha.item,
        unidadeMedida: linha.unidadeMedida,
        quantidadeContratada: linha.quantidade,
        quantidadeDisponivel: linha.quantidade,
        quantidadeReservada: 0,
        quantidadeConsumida: 0,
        precoUnitario: linha.precoUnitario
      });
    }
    criados.push({ id: contratoRef.id, numero: numeroContrato });
  }

  // Um log por contrato criado, no mesmo batch: o histórico do contrato
  // mostra que ele nasceu de importação e de qual lote.
  const agora = new Date().toISOString();
  for (const c of criados) {
    const logRef = colecao(empresaId, 'logs').doc();
    batch.set(logRef, {
      id: logRef.id,
      acao: 'contrato.importar',
      alvo: 'contrato',
      operacao: 'importar',
      descricao: `Importou o contrato ${c.numero} por planilha (${porContrato.get(c.numero)!.length} item(ns))`,
      data: agora,
      usuarioUid: autor.uid,
      usuarioNome: autor.nome,
      usuarioEmail: autor.email,
      alvoId: c.id,
      alvoRotulo: c.numero,
      alvoPaiId: c.id,
      detalhes: { itens: porContrato.get(c.numero)!.length, loteContratos: criados.length },
      origem: 'backend'
    });
  }

  await batch.commit();

  return { contratosCriados: criados.length, itensCriados: linhas.length };
});
