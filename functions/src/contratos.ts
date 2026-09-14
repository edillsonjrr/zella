import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { db, colecao, exigirPerfil } from './admin';

// Layout esperado (CSV, ; como separador — ver PLANO_BACKEND_FATIA1.md):
// contrato;fornecedor;vigencia_inicio;vigencia_fim;item;quantidade
interface LinhaValidada {
  contrato: string;
  fornecedor: string;
  vigenciaInicio: string; // ISO yyyy-mm-dd
  vigenciaFim: string;
  item: string;
  quantidade: number;
}

function paraIso(dataBr: string): string | null {
  const m = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(dataBr.trim());
  if (!m) return null;
  const [, dia, mes, ano] = m;
  return `${ano}-${mes}-${dia}`;
}

function validarLinhas(csv: string): { linhas: LinhaValidada[]; erros: string[] } {
  const erros: string[] = [];
  const linhas: LinhaValidada[] = [];

  const registros = csv
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);

  if (!registros.length) {
    return { linhas, erros: ['Arquivo vazio.'] };
  }

  const cabecalho = registros[0].toLowerCase();
  const dados = cabecalho.startsWith('contrato') ? registros.slice(1) : registros;

  dados.forEach((linha, i) => {
    const numeroLinha = i + 2; // considerando cabeçalho na linha 1
    const campos = linha.split(';').map((c) => c.trim());
    if (campos.length !== 6) {
      erros.push(`Linha ${numeroLinha}: esperado 6 campos, encontrado ${campos.length}.`);
      return;
    }
    const [contrato, fornecedor, vigIniBr, vigFimBr, item, qtdStr] = campos;

    if (!contrato || !fornecedor || !item) {
      erros.push(`Linha ${numeroLinha}: contrato, fornecedor e item são obrigatórios.`);
      return;
    }

    const vigenciaInicio = paraIso(vigIniBr);
    const vigenciaFim = paraIso(vigFimBr);
    if (!vigenciaInicio || !vigenciaFim) {
      erros.push(`Linha ${numeroLinha}: data inválida (use dd/mm/aaaa).`);
      return;
    }
    if (vigenciaInicio >= vigenciaFim) {
      erros.push(`Linha ${numeroLinha}: vigência início deve ser antes da vigência fim.`);
      return;
    }

    const quantidade = Number(qtdStr.replace(',', '.'));
    if (!Number.isFinite(quantidade) || quantidade <= 0) {
      erros.push(`Linha ${numeroLinha}: quantidade deve ser um número maior que zero.`);
      return;
    }

    linhas.push({ contrato, fornecedor, vigenciaInicio, vigenciaFim, item, quantidade });
  });

  return { linhas, erros };
}

export const validarImportacaoContratos = onCall<{ csv: string }>(async (request) => {
  const { empresaId } = exigirPerfil(request, ['gestor']);

  const { linhas, erros } = validarLinhas(request.data.csv);

  const numerosUnicos = [...new Set(linhas.map((l) => l.contrato))];
  const existentes = await Promise.all(
    numerosUnicos.map(async (numero) => {
      const snap = await colecao(empresaId, 'contratos').where('numero', '==', numero).limit(1).get();
      return { numero, existe: !snap.empty };
    })
  );
  existentes.filter((e) => e.existe).forEach((e) => erros.push(`Contrato ${e.numero} já existe.`));

  return { totalLinhas: linhas.length, contratos: numerosUnicos.length, erros, valido: erros.length === 0 };
});

export const importarContratos = onCall<{ csv: string }>(async (request) => {
  const { empresaId } = exigirPerfil(request, ['gestor']);

  const { linhas, erros } = validarLinhas(request.data.csv);
  if (erros.length) {
    throw new HttpsError('invalid-argument', `Importação recusada: ${erros.join(' | ')}`);
  }
  if (linhas.length > 400) {
    throw new HttpsError('invalid-argument', 'Máximo de 400 linhas por importação nesta fatia.');
  }

  const numerosUnicos = [...new Set(linhas.map((l) => l.contrato))];
  const existentes = await Promise.all(
    numerosUnicos.map(async (numero) => {
      const snap = await colecao(empresaId, 'contratos').where('numero', '==', numero).limit(1).get();
      return { numero, existe: !snap.empty };
    })
  );
  const jaExiste = existentes.filter((e) => e.existe).map((e) => e.numero);
  if (jaExiste.length) {
    throw new HttpsError('invalid-argument', `Contratos já existentes: ${jaExiste.join(', ')}`);
  }

  const batch = db.batch();
  const porContrato = new Map<string, LinhaValidada[]>();
  for (const linha of linhas) {
    const lista = porContrato.get(linha.contrato) ?? [];
    lista.push(linha);
    porContrato.set(linha.contrato, lista);
  }

  let contratosCriados = 0;
  for (const [numero, itensLinhas] of porContrato) {
    const contratoRef = colecao(empresaId, 'contratos').doc();
    const primeira = itensLinhas[0];
    batch.set(contratoRef, {
      id: contratoRef.id,
      numero,
      fornecedor: primeira.fornecedor,
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
        unidadeMedida: 'un',
        quantidadeContratada: linha.quantidade,
        quantidadeDisponivel: linha.quantidade,
        quantidadeReservada: 0,
        quantidadeConsumida: 0,
        precoUnitario: 0
      });
    }
    contratosCriados++;
  }

  await batch.commit();

  return { contratosCriados, itensCriados: linhas.length };
});
