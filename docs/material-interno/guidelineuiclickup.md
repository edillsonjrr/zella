# Guideline de UI — Solução de Gestão de Tarefas (referência: ClickUp)

> Baseado na análise da página "Personal List" do ClickUp (visões Lista e Quadro). Foco em **estrutura, tamanhos e jornada**, não em fonte ou biblioteca específica — os valores abaixo servem como ponto de partida e podem ser ajustados à identidade visual da solução.

---

## 1. Estrutura geral da tela

Layout em **3 colunas fixas** (padrão "app shell"), sem scroll horizontal na área de navegação:

| Região | Largura | Função |
|---|---|---|
| Rail de ícones (nível 1) | ~64px | Navegação global entre módulos (Início, Planejador, IA, Equipes, Mais...) |
| Sidebar (nível 2) | ~250–260px, colapsável | Navegação contextual: atalhos, "Minhas tarefas", lista de Espaços/Projetos |
| Área de conteúdo | flexível (resto da tela) | Header da página + toolbar + conteúdo principal (tabela/quadro) |

Altura de topo (barra global): **~48–50px**, fixa, contém: seletor de workspace (esquerda), busca central, ícones de utilidades + avatar (direita).

### Rail de ícones (nível 1)
- Itens verticais empilhados, ~64px de largura cada botão
- Ícone (~20px) + label abaixo (~10–11px)
- Item ativo: fundo levemente destacado (pill arredondado) + cor de destaque
- Ordem: navegação de produto no topo → ações de conta (Convidar, Upgrade) fixas embaixo

### Sidebar (nível 2)
- Cabeçalho com título da seção + botão primário "+ Criar" (pill, canto superior direito da sidebar)
- Lista de itens de navegação: ícone (~16px) + texto, altura de linha ~32–36px, padding horizontal ~12px
- Agrupamento por seções com título pequeno em caixa alta ou peso médio (ex: "Minhas tarefas", "Espaços")
- Item ativo/selecionado: fundo em destaque sutil, cantos arredondados (~6–8px)
- Botão de colapsar a sidebar inteira (chevron no canto superior)

---

## 2. Header da página (contexto do item aberto)

- **Breadcrumb** compacto: ícone do tipo de item + "/" + título da página, fonte ~13px, cor secundária para os níveis anteriores e cor primária/negrito para o atual
- Ícones de contexto ao lado do título: cadeado (privacidade), estrela (favoritar) — ~14–16px
- Botões de ação no canto direito do header: ícones de compartilhar/copiar link, automação, "IA" (badge com contador) — todos como botões circulares/pill de ~28–32px

## 3. Sistema de abas (visões)

- Abas horizontais logo abaixo do breadcrumb: "Quadro", "Lista", "+ Visualização"
- Altura da aba ~36–40px, texto ~13–14px
- Aba ativa: sublinhado inferior de 2px na cor de destaque + ícone colorido; abas inativas em cinza/texto secundário
- Botão "+" para adicionar nova visão sempre ao final da lista de abas (deixa claro que visões são extensíveis)

## 4. Toolbar da visão (linha de filtros/ações)

Duas zonas, alinhadas nas extremidades opostas da mesma linha (~32px de altura):

- **Esquerda**: controles de configuração da visão atual — Agrupar, Subtarefas, Colunas — como chips/botões pequenos (ícone + texto, ~28px altura, cantos arredondados, borda sutil)
- **Direita**: ações rápidas — ordenar, filtrar, marcar concluído, avatar de "responsável"/filtro de pessoas, busca, configurações (engrenagem), botão primário "+ Criar" com chevron para opções — todos ícones circulares de ~28–32px, espaçados ~4–8px entre si

## 5. Visão em Lista (tabela)

- Cabeçalho de colunas: texto ~12–13px, cor secundária, altura ~32px
- Colunas padrão: Nome (flex/maior), Responsável, Data de vencimento, Prioridade, + botão "Adicionar coluna" ao final (reforça extensibilidade)
- Linha "Adicionar Tarefa" sempre fixa no topo da lista/grupo, com ícone circular vazio (checkbox de status) + campo de texto placeholder — **criação inline**, sem modal
- Altura de linha de tarefa: ~36–40px
- Estado vazio: mesma linha de "adicionar" ocupa o lugar da lista vazia — nunca uma tela em branco

## 6. Visão em Quadro (kanban)

- Colunas por status (Pendente / Em progresso / Concluído), largura fixa ~270–280px cada, com scroll horizontal
- Cabeçalho de coluna: bolinha de status colorida + nome em caixa alta (~12px, bold) + contador numérico + menu "..." + botão "+" para colapsar/config
- Botão "+ Adicionar Tarefa" fixo no topo de cada coluna (mesmo padrão de criação inline da lista)
- Cards (quando existentes) usam a cor do status como acento (borda ou dot), fundo levemente elevado em relação ao fundo da coluna

## 7. Painel lateral de detalhe/configuração (ex.: "Campos")

Padrão usado para edição de propriedades sem sair do contexto:

- Painel desliza da direita, largura ~300–320px, mesma altura da viewport
- Cabeçalho: título + ícone de configurações + "X" de fechar (~32px)
- Campo de busca no topo do painel (~36px altura, ícone de lupa)
- Abas internas (ex.: "Criar novo" / "Adicionar um existente") no mesmo padrão de sublinhado das abas de visão
- Listas de opções organizadas em seções com título pequeno (ex.: "Sugestões da IA", "Popular"), cada item com ícone + label, altura ~32–36px

---

## 8. Escala de tamanhos (tokens sugeridos)

| Token | Valor aproximado | Uso |
|---|---|---|
| Ícone pequeno | 14–16px | inline com texto (breadcrumb, sidebar) |
| Ícone padrão | 18–20px | rail de navegação, botões de toolbar |
| Botão circular/pill (toolbar) | 28–32px | ações de ícone único |
| Altura de input/campo | 32–36px | busca, campos de formulário |
| Altura de linha (lista/tabela) | 36–40px | itens de tarefa |
| Altura de aba/tab | 36–40px | visões, abas internas |
| Altura de barra superior global | 48–50px | topbar |
| Largura da sidebar | 250–260px | navegação nível 2 |
| Largura do rail | 60–64px | navegação nível 1 |
| Largura do painel lateral | 300–320px | detalhe/configuração |
| Largura de coluna kanban | 270–280px | quadro |
| Raio de borda (padrão) | 6–8px | cards, chips, itens de menu |
| Raio de borda (pill/full) | 999px | tabs de status, avatar, botão "Criar" |
| Espaçamento interno padrão | 8 / 12 / 16px | paddings de componentes |
| Fonte — corpo | 13–14px | texto padrão |
| Fonte — títulos de seção/label | 11–12px | headers de coluna, labels de grupo |
| Fonte — título de página | 15–16px, peso médio/bold | breadcrumb ativo |

---

## 9. Padrões de interação / jornada do usuário

1. **Entrada**: usuário abre o workspace → cai em "Início" (hub pessoal): inbox, respostas, tarefas atribuídas — nunca uma tela vazia genérica.
2. **Navegação**: rail (nível 1) troca de módulo → sidebar (nível 2) troca de contexto/lista dentro do módulo → conteúdo principal reage instantaneamente (sem reload de página).
3. **Troca de visão**: mesma lista de dados pode ser vista como Lista ou Quadro via abas — o usuário nunca perde o filtro/agrupamento ao trocar de visão.
4. **Criação de item — sempre inline, nunca modal bloqueante**: botão "+" ou linha fixa "Adicionar Tarefa" abre um campo de texto no próprio local onde o item vai aparecer; Enter confirma, Esc cancela.
5. **Edição de detalhes — painel lateral, não navegação de página**: clicar num item abre um painel/drawer à direita (ou modal expansível) mantendo a lista visível ao fundo, permitindo comparar contexto sem perder o lugar.
6. **Adicionar propriedade/campo — mesmo padrão de painel lateral**, com busca no topo e sugestões (inclusive geradas por IA) para reduzir fricção de configuração.
7. **Estado vazio é sempre acionável**: em vez de "nenhuma tarefa encontrada", mostra o próprio afordance de criação (campo de adicionar) já em foco.
8. **Hierarquia de ações reversível**: ações destrutivas/pesadas (deletar, arquivar) ficam atrás de menus "...", nunca como botão de primeira linha.
9. **Feedback de estado por cor + ícone redundante**: status (pendente/em progresso/concluído) sempre combina cor E ícone/forma do indicador (bolinha vazia, meia-lua, check), não depende só da cor — bom para acessibilidade.

---

## 10. Tema visual (referência, não obrigatório)

- Base escura (dark mode como padrão), fundo em camadas: fundo geral mais escuro → superfícies elevadas (sidebar, cards, painéis) um tom acima → hover/seleção mais um tom acima.
- Uma única cor de destaque (accent) usada com moderação: estados ativos, botão primário, links, ícone de IA — evita poluição visual.
- Cores de status semânticas (ex.: cinza = pendente, roxo/azul = em progresso, verde = concluído), aplicadas de forma consistente em badges, dots e barras.

---

### Como usar este guia
Use a seção 8 (tokens) como ponto de partida para variáveis de espaçamento/tamanho no seu design system, e a seção 9 (jornada) como checklist de UX ao desenhar cada fluxo (criar, editar, filtrar, trocar de visão). A tipografia e os componentes exatos (biblioteca, ícones, fonte) ficam livres para a identidade da sua solução.
