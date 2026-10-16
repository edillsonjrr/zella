import type { Orcamento, OrdemServico } from './models';

/**
 * O que foi usado no serviço feito de uma OS, com preço: itens do contrato
 * e itens fora do contrato (Z3.5), cada um marcado.
 *
 * Fonte única para o encerramento, o relatório do mês e o histórico do
 * equipamento, para o custo sair igual nos três.
 *
 * - Itens do contrato: `itensExecutados` da OS; o preço vem do orçamento.
 *   OS antiga sem `itensExecutados` conta o aprovado inteiro, que é o que a
 *   execução sem itens consome.
 * - Fora do contrato: `itensForaContratoExecutados` da OS (sem preço, de
 *   propósito); o preço vem do orçamento. Sem o registro, conta o aprovado.
 */
export interface LinhaServico {
  nome: string;
  unidade: string;
  aprovado: number;
  usado: number;
  precoUnitario: number;
  foraDoContrato: boolean;
}

export interface CustoServico {
  contrato: number;
  foraContrato: number;
  total: number;
}

export function linhasDoServico(
  os: OrdemServico,
  orcamento: Orcamento | undefined,
  unidadeDoItem: (itemContratoId: string) => string = () => ''
): LinhaServico[] {
  const aprovado = orcamento?.situacao === 'Aprovado' ? orcamento : undefined;
  const preco = new Map((orcamento?.itens ?? []).map(i => [i.itemContratoId, i.precoUnitario]));

  const contrato: LinhaServico[] = os.itensExecutados?.length
    ? os.itensExecutados.map(i => ({
        nome: i.nome,
        unidade: unidadeDoItem(i.itemContratoId),
        aprovado: i.orcado,
        usado: i.executado,
        precoUnitario: preco.get(i.itemContratoId) ?? 0,
        foraDoContrato: false
      }))
    : (aprovado?.itens ?? []).map(i => ({
        nome: i.nome,
        unidade: unidadeDoItem(i.itemContratoId),
        aprovado: i.quantidade,
        usado: i.quantidade,
        precoUnitario: i.precoUnitario,
        foraDoContrato: false
      }));

  const propostos = new Map((orcamento?.itensForaContrato ?? []).map(i => [i.id, i]));
  const fora: LinhaServico[] = os.itensForaContratoExecutados?.length
    ? os.itensForaContratoExecutados.map(i => ({
        nome: i.descricao,
        unidade: i.unidade,
        aprovado: i.aprovado,
        usado: i.executado,
        precoUnitario: propostos.get(i.id)?.precoUnitario ?? 0,
        foraDoContrato: true
      }))
    : (aprovado?.itensForaContrato ?? [])
        .filter(i => i.decisao === 'Aprovado')
        .map(i => ({
          nome: i.descricao,
          unidade: i.unidade,
          aprovado: i.quantidade,
          usado: i.quantidade,
          precoUnitario: i.precoUnitario,
          foraDoContrato: true
        }));

  return [...contrato, ...fora];
}

export function custoDoServico(linhas: LinhaServico[]): CustoServico {
  const centavos = (v: number) => Math.round(v * 100) / 100;
  const contrato = centavos(linhas.filter(l => !l.foraDoContrato).reduce((s, l) => s + l.usado * l.precoUnitario, 0));
  const foraContrato = centavos(linhas.filter(l => l.foraDoContrato).reduce((s, l) => s + l.usado * l.precoUnitario, 0));
  return { contrato, foraContrato, total: centavos(contrato + foraContrato) };
}

/** Total dos itens fora do contrato de um orçamento; com `soAprovados`, só os aprovados. */
export function totalForaDoContrato(orcamento: Orcamento | undefined, soAprovados = false): number {
  return (orcamento?.itensForaContrato ?? [])
    .filter(i => !soAprovados || i.decisao === 'Aprovado')
    .reduce((s, i) => s + i.quantidade * i.precoUnitario, 0);
}

/** A OS teve o serviço registrado. Encerrada só vem depois de Executada. */
export function servicoFeito(os: Pick<OrdemServico, 'situacao'>): boolean {
  return os.situacao === 'Executada' || os.situacao === 'Encerrada';
}
