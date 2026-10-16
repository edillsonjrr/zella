# Glossário do Zella

Um nome para cada coisa, igual em todas as telas. Quando um termo mudar, mude aqui primeiro.
Os valores gravados no banco (status do chamado, situação da OS) não mudam: a tela traduz.

## Telas e menu
O nome no menu é igual ao título da página.

| Menu | Título da página | Barra de baixo (celular) |
|---|---|---|
| Chamados | Chamados | Chamados |
| Meus pedidos | Meus pedidos | (sem barra: um destino só) |
| Ordens de serviço | Ordens de serviço | Ordens |
| Manutenção preventiva | Manutenção preventiva | Preventiva |
| Contratos | Contratos | Contratos |
| Saldo dos contratos | Saldo dos contratos | Saldo |
| Painel gerencial | Painel gerencial | Painel |
| Empresas clientes | Empresas clientes | Empresas |
| Empresas contratadas | Empresas contratadas | Contratadas |
| Histórico de alterações | Histórico de alterações | — |

Não usar "Início" para a lista de chamados.

## Pessoas e empresas
- **Gestor (gestora):** quem administra os contratos e recebe os pedidos.
- **Solicitante:** quem pede o conserto numa unidade (perfil `cliente` no banco).
- **Empresa contratada:** a empresa de manutenção. No texto corrido, "a contratada".
- **Responsável da contratada:** a pessoa da empresa contratada que orça e designa técnicos (perfil `gestor_contratado` no banco). Não usar "gestor da empresa contratada" (rodada 3).
- **Demonstração:** os botões da faixa se chamam "Trocar perfil" e "Recomeçar" no computador, no celular e nas dicas. Nas dicas, "use o botão", não "toque em".
- **Técnico:** quem faz o serviço, da empresa contratada.

## Fluxo
- **Chamado:** o pedido de conserto. Para a solicitante, a tela diz **pedido**.
- **Ordem de serviço (OS):** o chamado enviado a uma empresa contratada. Na primeira menção de cada tela, por extenso.
- **Orçamento:** os itens do contrato que a contratada propõe para a OS.
- **Prazo:** data de abertura + prazo de atendimento da empresa (5 dias, se ninguém mudou). Vermelho só quando atrasado.

## Situação (pílula de status)
Texto curto na pílula; o "Agora: ..." diz quem age. Cor pela tabela única de `styles.scss` (`.badge`).
**O mesmo nome em todos os perfis** (rodada 2): a solicitante não vê mais "Recebido", "Com a empresa contratada", "Orçamento em análise" nem "Concluído".

| Pílula | Cor | Classe |
|---|---|---|
| Novo | azul | `badge--aberta` |
| Aguardando orçamento | âmbar | `badge--vistoria` |
| Aguardando aprovação (na coluna Orçamento da lista de OS: "A aprovar") | âmbar | `badge--vistoria` |
| Orçamento recusado | vermelho | `badge--rejeitada` |
| Aprovado | **verde, sempre** | `badge--aprovada` |
| Serviço feito | teal | `badge--executada` |
| Encerrado | cinza | `badge--encerrada` |
| Cancelado / Não enviado | cinza | `badge--neutra` |

- **Com quem está:** coluna da lista de chamados; quem precisa agir agora (gestão, empresa contratada ou técnico). Substituiu "Responsável", que mostrava a gestora em todos.
- **Ainda não liberadas para você:** OS do técnico que esperam orçamento ou aprovação (era "A caminho").
- **Numeração:** CH e OS são numerados em ordem de abertura, cada um com a sua sequência; o chamado mostra "virou a OS-…" e a OS mostra "do chamado CH-…".

## Saldo
- **Contratado = Usado + Separado + Livre.**
- **Separado:** o que um orçamento aprovado reservou.
- **Usado:** o que o serviço feito consumiu.
- **Livre:** o que ainda pode ser orçado.

## Botões
- Criar é sempre **"Novo X"** (Novo chamado, Nova OS, Novo contrato, Novo usuário, Nova unidade, Novo plano, Novo item).
- Nada de "Criar", "Adicionar" ou "+ Adicionar" repetido dentro da lista.
- Ações da linha: no máximo dois ícones; o resto no "⋯", com **Excluir** por último e em vermelho.
- O seletor de tema diz o que faz: "Usar tema claro" / "Usar tema escuro".
