import type { PerfilEmpresa } from '../shared/models';

/**
 * As pessoas de exemplo que o visitante pode ser. Os ids são os do seed
 * (functions/src/seedDados.ts): cada uma vê exatamente o que veria de
 * verdade, porque a sessão é o cadastro dela.
 */
export interface PerfilDemo {
  // Vai na URL (/login?como=carla) para entrar direto, sem clicar.
  chave: 'carla' | 'ana' | 'diego' | 'eduardo';
  usuarioId: string;
  perfil: PerfilEmpresa;
  nome: string;
  papel: string;
  // Uma frase para o cartão de boas-vindas.
  quem: string;
  // O que vale a pena tentar com este perfil, na ordem do fluxo.
  // {ch:id} e {os:id} viram o número do chamado ou da OS nos dados, que é
  // dado na ordem de abertura (functions/src/seedDados.ts, numerarEmOrdem).
  tentar: string[];
}

export const PERFIS_DEMO: PerfilDemo[] = [
  {
    chave: 'carla',
    usuarioId: 'usr3',
    perfil: 'gestor',
    nome: 'Carla',
    papel: 'gestora do contrato',
    quem: 'Você é Carla Dias, gestora dos contratos de manutenção do Senai DF. Os pedidos chegam até você.',
    tentar: [
      'Em Chamados, abra o pedido {ch:ch1}, do ar-condicionado, e envie para a Ar Condicionado Ltda, que tem esse conserto no contrato.',
      'Abra o pedido {ch:ch-ger-41}, da luminária, envie para a Elétrica Sul e escolha o técnico Eduardo.',
      'Aprove o orçamento da {os:os1} e veja o valor ficar separado no saldo do contrato.',
      'Encerre o chamado {ch:ch3}, que já teve o serviço feito, e confira o Painel gerencial.'
    ]
  },
  {
    chave: 'ana',
    usuarioId: 'usr1',
    perfil: 'cliente',
    nome: 'Ana',
    papel: 'solicitante numa unidade',
    quem: 'Você é Ana Souza e trabalha no Senai Santa Maria. Quando algo quebra, é você quem pede o conserto.',
    tentar: [
      'Use o botão "Pedir um conserto" e conte o que quebrou. A foto é opcional.',
      'Em "Meus pedidos", veja em que pé está cada pedido e quem age agora.',
      'Em "Trocar perfil", na faixa do topo, escolha a Carla e veja o seu pedido chegar para ela.'
    ]
  },
  {
    chave: 'diego',
    usuarioId: 'usr4',
    perfil: 'gestor_contratado',
    nome: 'Diego',
    papel: 'responsável da contratada',
    quem: 'Você é Diego Rocha, responsável da Elétrica Sul, a empresa contratada para a parte elétrica. Você vê só os chamados e as OS dos contratos da Elétrica Sul.',
    tentar: [
      'Em "Ordens de serviço", abra a {os:os-ger-28}, que aguarda o orçamento da sua empresa, e envie o orçamento.',
      'Escolha o técnico que vai fazer cada OS.',
      'Em "Saldo dos contratos", acompanhe o que já foi usado do contrato CTR-2026-002.'
    ]
  },
  {
    chave: 'eduardo',
    usuarioId: 'usr5',
    perfil: 'tecnico',
    nome: 'Eduardo',
    papel: 'técnico',
    quem: 'Você é Eduardo Nunes, técnico da Elétrica Sul. As OS aprovadas para você aparecem aqui.',
    tentar: [
      'Abra a {os:os3} (luzes do corredor do Bloco A), que já tem o orçamento aprovado.',
      'Use o botão "Registrar serviço feito". Pode anexar uma foto, se quiser.',
      'Depois, em "Trocar perfil", escolha a Carla e encerre o chamado.'
    ]
  }
];

export function perfilDemoDoUsuario(usuarioId: string | undefined): PerfilDemo | undefined {
  return PERFIS_DEMO.find(p => p.usuarioId === usuarioId);
}
