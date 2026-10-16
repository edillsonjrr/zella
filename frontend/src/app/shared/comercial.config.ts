/**
 * Dados comerciais da página "Para compras e licitação" (/compras) e da
 * proposta em PDF (Z3.4). Arquivo único: preencha aqui.
 *
 * Campo vazio não aparece em lugar nenhum: nem na página, nem no PDF.
 * Nada aqui foi inventado; os campos começam vazios de propósito.
 */
export const DADOS_COMERCIAIS = {
  razaoSocial: '',
  cnpj: '',
  emailComercial: '',
  // Só números, com DDI e DDD. Ex.: 5511999999999.
  whatsappComercial: '',
  // Mude para true só se a empresa emite nota fiscal. Com false, a página e
  // a proposta não falam de nota fiscal.
  emitimosNotaFiscal: false
};

export interface PlanoComercial {
  nome: string;
  // Preço por mês, por empresa.
  mensal: number;
  // Preço por mês no plano anual.
  anualPorMes: number;
  resumo: string;
  inclui: string[];
  destaque?: boolean;
}

/**
 * Planos e preços da seção 3.3 de estrategia-teste-e-free.md (05/10/2026).
 * Se a decisão do saldo no Essencial (Z3.6) mudar, ajuste a lista aqui.
 */
export const PLANOS_COMERCIAIS: PlanoComercial[] = [
  {
    nome: 'Essencial',
    mensal: 199,
    anualPorMes: 159,
    resumo: 'Para um prédio ou poucas unidades começarem a organizar os pedidos.',
    inclui: [
      '1 gestor e 4 técnicos',
      'Solicitantes e abertura por QR Code sem limite de pessoas',
      'Até 3 unidades',
      'Até 300 equipamentos com QR Code',
      'Ordens de serviço sem limite',
      'Até 1.000 chamados por QR Code por mês',
      'Até 25 planos de manutenção preventiva',
      'Até 3 fotos por OS',
      '1 empresa contratada',
      'Painel gerencial'
    ]
  },
  {
    nome: 'Profissional',
    mensal: 449,
    anualPorMes: 359,
    resumo: 'Para quem precisa controlar o saldo do contrato de manutenção.',
    destaque: true,
    inclui: [
      '3 gestores e 12 técnicos',
      'Solicitantes e abertura por QR Code sem limite de pessoas',
      'Unidades sem limite',
      'Até 3.000 equipamentos com QR Code',
      'Ordens de serviço e chamados sem limite',
      'Planos de manutenção preventiva sem limite',
      'Até 3 fotos por OS',
      'Empresas contratadas sem limite',
      'Contratos, orçamentos e painel de saldo',
      'Painel gerencial'
    ]
  },
  {
    nome: 'Empresa',
    mensal: 990,
    anualPorMes: 790,
    resumo: 'Para redes com muitas unidades e equipes grandes.',
    inclui: [
      '10 gestores e 40 técnicos',
      'Tudo do Profissional',
      'Equipamentos com QR Code sem limite'
    ]
  }
];

export const ADICIONAIS_COMERCIAIS: { nome: string; mensal: number }[] = [
  { nome: 'Técnico a mais', mensal: 35 },
  { nome: '500 equipamentos a mais', mensal: 29 }
];

/** O que é o Zella, em frases curtas, para a página e a proposta. */
export const O_QUE_E_O_ZELLA: string[] = [
  'O Zella é um sistema de gestão de manutenção predial que funciona no navegador do computador e do celular, sem instalação.',
  'Quem precisa de um conserto abre o pedido pela tela ou pelo QR Code colado no equipamento ou na sala.',
  'O gestor envia o pedido para a empresa contratada, que manda o orçamento com os itens do contrato. A aprovação separa o saldo do contrato; o serviço feito conta como usado.',
  'O saldo de cada item é calculado, nunca digitado: Contratado = Usado + Separado + Livre.',
  'A manutenção preventiva abre os chamados sozinha, na data certa. O técnico registra o serviço com foto pelo celular.'
];

/* Formatação dos contatos -------------------------------------------------- */

/** "5511999999999" vira "+55 (11) 99999-9999". */
export function whatsappFormatado(numero: string): string {
  const d = numero.replace(/\D/g, '');
  const m = /^55(\d{2})(\d{4,5})(\d{4})$/.exec(d);
  return m ? `+55 (${m[1]}) ${m[2]}-${m[3]}` : d ? `+${d}` : '';
}

export function linkWhatsapp(numero: string, texto: string): string {
  const d = numero.replace(/\D/g, '');
  return d ? `https://wa.me/${d}?text=${encodeURIComponent(texto)}` : '';
}

export function linkEmail(email: string, assunto: string): string {
  return email.trim() ? `mailto:${email.trim()}?subject=${encodeURIComponent(assunto)}` : '';
}

export function precoBr(valor: number): string {
  return valor.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', minimumFractionDigits: 0, maximumFractionDigits: 2 });
}
