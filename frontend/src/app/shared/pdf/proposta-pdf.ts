import { COR, DocumentoPdf, hojeBr, reais } from './documento-pdf';
import {
  ADICIONAIS_COMERCIAIS,
  DADOS_COMERCIAIS,
  O_QUE_E_O_ZELLA,
  PLANOS_COMERCIAIS,
  whatsappFormatado
} from '../comercial.config';

/**
 * Proposta comercial em PDF (Z3.4), com os dados de comercial.config.ts.
 * Linha sem dado não aparece: CNPJ vazio, por exemplo, some do documento.
 * Nota fiscal só é citada com `emitimosNotaFiscal: true`.
 */
export async function gerarPropostaPdf(paraQuem = ''): Promise<Blob> {
  const d = DADOS_COMERCIAIS;
  const pdf = await DocumentoPdf.criar({
    titulo: 'Proposta comercial: Zella',
    subtitulo: 'Gestão de manutenção predial: chamados, ordens de serviço, preventiva e saldo de contrato',
    linhaInfo: [`Emitida em ${hojeBr()}`, paraQuem.trim() ? `Para: ${paraQuem.trim()}` : ''].filter(Boolean).join(' · '),
    rodape: ['Zella · Proposta comercial', d.razaoSocial, d.cnpj ? `CNPJ ${d.cnpj}` : ''].filter(Boolean).join(' · ')
  });

  const emitente: [string, string][] = [
    ['Razão social', d.razaoSocial],
    ['CNPJ', d.cnpj],
    ['E-mail', d.emailComercial],
    ['WhatsApp', whatsappFormatado(d.whatsappComercial)]
  ];
  if (emitente.some(([, v]) => v)) {
    pdf.secao('Quem oferece');
    pdf.dados(emitente);
  }

  pdf.secao('O que é o Zella');
  pdf.lista(O_QUE_E_O_ZELLA);

  pdf.secao('Planos e valores', 'Valores por empresa. Quem pede conserto e quem abre chamado pelo QR Code não paga.');
  pdf.tabela({
    colunas: [
      { titulo: 'Plano', largura: 0.28 },
      { titulo: 'Mensal', largura: 0.22, alinhar: 'right' },
      { titulo: 'Anual (por mês)', largura: 0.25, alinhar: 'right' },
      { titulo: 'Anual (12 meses)', largura: 0.25, alinhar: 'right' }
    ],
    linhas: PLANOS_COMERCIAIS.map(p => [
      { texto: p.nome, negrito: true },
      `${reais(p.mensal)}/mês`,
      `${reais(p.anualPorMes)}/mês`,
      reais(p.anualPorMes * 12)
    ]),
    tamanho: 9
  });
  if (ADICIONAIS_COMERCIAIS.length) {
    pdf.paragrafo(`Adicionais: ${ADICIONAIS_COMERCIAIS.map(a => `${a.nome.toLowerCase()}, ${reais(a.mensal)}/mês`).join('; ')}.`, { tamanho: 8.5, cor: COR.suave });
  }

  pdf.secao('O que vem em cada plano');
  for (const p of PLANOS_COMERCIAIS) {
    pdf.subtitulo(`${p.nome}: ${reais(p.mensal)}/mês ou ${reais(p.anualPorMes)}/mês no anual`);
    pdf.paragrafo(p.resumo, { tamanho: 9, cor: COR.suave });
    pdf.lista(p.inclui, 9);
  }

  pdf.secao('Para o processo de compra');
  const condicoes = [
    'Esta proposta traz os planos e valores para cotação e aprovação interna.',
    'O gestor exporta todos os dados em planilhas (CSV) quando quiser, pela tela Minha conta.',
    'Funciona no navegador, sem instalação. O técnico usa no celular.'
  ];
  if (d.emitimosNotaFiscal) condicoes.push('Emitimos nota fiscal.');
  pdf.lista(condicoes);

  // Sem contato preenchido, a seção não aparece: não há a quem pedir.
  const contatos = [d.emailComercial ? `e-mail ${d.emailComercial}` : '', d.whatsappComercial ? `WhatsApp ${whatsappFormatado(d.whatsappComercial)}` : ''].filter(Boolean);
  if (contatos.length) {
    pdf.secao('Como pedir a proposta formal');
    pdf.lista([
      'Escolha o plano e o período: mensal ou anual.',
      `Fale com a gente por ${contatos.join(' ou ')}, com o nome da instituição e o plano escolhido.`
    ]);
  }

  pdf.finalizar();
  return pdf.blob();
}
