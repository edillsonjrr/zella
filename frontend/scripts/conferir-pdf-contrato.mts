// Confere a leitura de um contrato em PDF fora do navegador.
//
// A conferencia que vale e a ultima linha: a soma de quantidade x preco de
// todos os itens tem que bater com o total impresso no proprio documento. Se
// bater, nenhuma quantidade nem preco se perdeu na leitura.
//
//   npx tsx scripts/conferir-pdf-contrato.mts "C:/caminho/contrato.pdf"
import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { montarLeitura, linhasDaPagina } from '../src/app/shared/pdf-contrato';

// Caminho do PDF vem por argumento: este script existe para conferir um
// contrato novo antes de confiar nele na tela.
const arquivo = process.argv[2];
if (!arquivo) {
  console.error('uso: npx tsx scripts/conferir-pdf-contrato.mts <caminho-do.pdf>');
  process.exit(1);
}

const pdfjs: any = await import('pdfjs-dist/legacy/build/pdf.mjs');
pdfjs.GlobalWorkerOptions.workerSrc = pathToFileURL(
  process.cwd() + '/node_modules/pdfjs-dist/legacy/build/pdf.worker.mjs'
).href;

const doc = await pdfjs.getDocument({ data: new Uint8Array(readFileSync(arquivo)) }).promise;

const linhas: string[] = [];
for (let n = 1; n <= doc.numPages; n++) {
  linhas.push(...(await linhasDaPagina(await doc.getPage(n))));
}

const r = montarLeitura(linhas);
console.log('paginas:', doc.numPages, '| linhas reconstruidas:', linhas.length);
console.log('itens:', r.itens.length, '| soma:', r.somaCalculada, '| totais declarados:', r.totaisDeclarados);
console.log('CONFERE:', r.confere, '| avisos:', r.avisos);
console.log('numero:', r.cabecalho.numero);
console.log('fornecedor:', r.cabecalho.fornecedor);
console.log('vigencia:', r.cabecalho.vigenciaInicio, '->', r.cabecalho.vigenciaFim, '| prorrogacao:', r.cabecalho.ehProrrogacao);
console.log('valor declarado:', r.cabecalho.valorTotalDeclarado);
console.log('primeiro:', r.itens[0]?.descricao.slice(0, 60), '|', r.itens[0]?.quantidade, r.itens[0]?.unidade);
console.log('ultimo  :', r.itens.at(-1)?.descricao.slice(0, 60), '|', r.itens.at(-1)?.quantidade, r.itens.at(-1)?.unidade);

