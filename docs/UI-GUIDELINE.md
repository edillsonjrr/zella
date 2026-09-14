# UI Guideline — Gestão de Manutenção

> Inspirado na arquitetura e nos padrões do ClickUp. Foco em estrutura, tamanhos, jornada e tema escuro. Os valores são pontos de partida e podem ser ajustados conforme a identidade da solução evoluir.

---

## 1. Estrutura geral da tela

Layout em **3 colunas** (padrão "app shell"), sem scroll horizontal na navegação:

| Região | Largura | Função |
|---|---|---|
| **Rail de ícones** (nível 1) | ~64px | Navegação global entre módulos principais |
| **Sidebar** (nível 2) | ~250–260px, colapsável | Navegação contextual: atalhos, filtros, agrupamentos |
| **Área de conteúdo** | flexível | Header da página + toolbar + conteúdo principal |

### Topbar global

- Altura: **48–50px**, fixa no topo.
- Conteúdo: seletor de workspace/empresa (esquerda), busca central, ícones de utilidades + avatar (direita).
- Fundo: `--bg-secondary`, borda inferior `--border-default`.

### Rail de ícones (nível 1)

- Largura: **60–64px**.
- Itens verticais empilhados: ícone (~20px) + label abaixo (~10–11px).
- Item ativo: fundo em pill arredondado + cor de destaque (`--primary-500`).
- Ordem: navegação de produto no topo → ações de conta embaixo.
- Exemplo de itens para este projeto: Dashboard, Contratos, Chamados, OS, Painel.

### Sidebar (nível 2)

- Largura: **250–260px**, colapsável.
- Cabeçalho: título da seção + botão primário "+ Criar" (pill, canto superior direito).
- Lista de itens: ícone (~16px) + texto, altura de linha **32–36px**, padding horizontal **12px**.
- Agrupamento por seções com título pequeno (ex: "Meus chamados", "Espaços", "Contratos").
- Item ativo/selecionado: fundo `--primary-50`, cantos arredondados **6–8px**, borda esquerda `--primary-500`.
- Botão de colapsar a sidebar (chevron no canto superior).

### Área de conteúdo

- Fundo: `--bg-primary`.
- Padding: **24px**.
- Composta por: breadcrumb + abas de visão + toolbar + conteúdo principal.

---

## 2. Header da página

- **Breadcrumb** compacto: ícone do tipo de item + "/" + título da página.
- Fonte: **13px**, cor `--text-tertiary` para níveis anteriores, `--text-primary` em negrito para o atual.
- Ícones de contexto ao lado do título: cadeado, estrela, etc. (~14–16px).
- Botões de ação no canto direito: compartilhar, automação, filtros — botões circulares/pill de **28–32px**.

---

## 3. Sistema de abas (visões)

- Abas horizontais abaixo do breadcrumb: ex. "Lista", "Quadro", "+ Visualização".
- Altura da aba: **36–40px**.
- Texto: **13–14px**.
- Aba ativa: sublinhado inferior **2px** na cor `--primary-500` + ícone colorido.
- Aba inativa: cor `--text-tertiary`.
- Botão "+" ao final da lista de abas, indicando que visões são extensíveis.

---

## 4. Toolbar da visão

Uma única linha de **~32–40px** de altura, com duas zonas alinhadas nas extremidades:

- **Esquerda:** controles de configuração da visão — Agrupar, Subtarefas, Colunas — como chips/botões pequenos (ícone + texto, ~28px altura, cantos arredondados, borda sutil).
- **Direita:** ações rápidas — ordenar, filtrar, busca, configurações, botão primário "+ Criar" com chevron — ícones circulares de **28–32px**, espaçados **4–8px**.

---

## 5. Visão em Lista (tabela)

- Cabeçalho de colunas: texto **12–13px**, cor `--text-tertiary`, altura **32–36px**.
- Colunas padrão dependem do contexto:
  - **Chamados:** Número, Equipamento, Solicitante, Data, Situação, Ações.
  - **OS:** Número, Ativo, Contrato, Técnico, Status, Data.
  - **Contratos:** Número, Fornecedor, Vigência, Itens, Saldo, Status.
- Linha "Adicionar" sempre fixa no topo da lista — **criação inline**, sem modal.
- Altura de linha: **36–40px**.
- Estado vazio: a própria linha de "adicionar" ocupa o lugar da lista vazia — nunca uma tela em branco.
- Hover da linha: fundo `--bg-elevated`.

---

## 6. Visão em Quadro (kanban)

- Colunas por status, largura fixa **270–280px** cada, com scroll horizontal.
- Cabeçalho de coluna: bolinha/dot de status + nome em caixa alta (**12px**, bold) + contador + menu "...".
- Botão "+ Adicionar" fixo no topo de cada coluna (criação inline).
- Cards: fundo `--bg-tertiary`, borda `--border-default`, cantos arredondados **8px**.
- Cards usam a cor do status como acento (dot ou borda).
- Hover do card: fundo `--bg-elevated`.

---

## 7. Painel lateral de detalhe

Padrão para edição de itens sem sair do contexto:

- Painel desliza da direita, largura **300–320px**, altura total da viewport.
- Cabeçalho: título + ícone de configurações + "X" de fechar (~32px).
- Campo de busca no topo (~36px altura).
- Abas internas no mesmo padrão de sublinhado das abas de visão.
- Listas de opções organizadas em seções com título pequeno, cada item com ícone + label, altura **32–36px**.

Aplicação no projeto:
- Detalhe de OS.
- Detalhe de chamado.
- Configuração de colunas/filtros da lista.

---

## 8. Escala de tamanhos (tokens)

| Token | Valor | Uso |
|---|---|---|
| Ícone pequeno | 14–16px | Inline com texto, breadcrumb, sidebar |
| Ícone padrão | 18–20px | Rail de navegação, toolbar |
| Botão circular/pill (toolbar) | 28–32px | Ações de ícone único |
| Altura de input/campo | 32–36px | Busca, formulários |
| Altura de linha (lista/tabela) | 36–40px | Itens de lista |
| Altura de aba/tab | 36–40px | Visões, abas internas |
| Altura da topbar | 48–50px | Barra global |
| Largura da sidebar | 250–260px | Navegação nível 2 |
| Largura do rail | 60–64px | Navegação nível 1 |
| Largura do painel lateral | 300–320px | Detalhe/configuração |
| Largura de coluna kanban | 270–280px | Quadro |
| Raio de borda padrão | 6–8px | Cards, chips, itens de menu |
| Raio de borda (pill/full) | 999px | Status, avatar, botão "Criar" |
| Espaçamento interno | 8 / 12 / 16px | Paddings de componentes |
| Fonte — corpo | 13–14px | Texto padrão |
| Fonte — label/header | 11–12px | Headers de coluna, labels de grupo |
| Fonte — título de página | 15–16px, peso médio/bold | Breadcrumb ativo |

---

## 9. Identidade visual

### 9.0 Tema claro (light mode)

O projeto suporta alternância dark/light (`body.light-mode`). A paleta clara segue a referência `DESIGN.md` (ClickUp — versão clara), com os mesmos nomes de token do tema escuro, valores diferentes:

| Token | Hex | Uso |
|---|---|---|
| `--bg-primary` / `--bg-secondary` | `#FFFFFF` | Canvas, topbar, sidebar |
| `--bg-tertiary` | `#F8F9FA` | Cards, inputs |
| `--bg-elevated` | `#EEEEEE` | Hover, chips neutros |
| `--primary-500` | `#6647F0` | Acento de marca (seleção, links de destaque, badges) — **nunca** como fundo do botão CTA principal |
| `--text-primary` | `#202020` | Títulos, texto principal, fundo do botão primário |
| `--text-secondary` | `#646464` | Corpo |
| `--text-tertiary` | `#838383` | Placeholders, labels |
| `--border-default` | `#E8E8E8` | Bordas padrão |
| `--border-hover` | `#D4D4D4` | Hover de borda |
| `--info-500` | `#0091FF` | Links, ações interativas leves |
| `--success-500` | `#00C07A` | Concluído, ativo |

Diferenças estruturais do tema claro em relação ao escuro:
- Botões, badges e pills usam raio **9999px** (`--button-radius`, `--badge-radius`), em vez de 8px.
- Tipografia de títulos (`h1`, `h2`, `h3`) usa **Plus Jakarta Sans** (peso 600-800, tracking -0.02em); corpo continua em Inter.
- O CTA primário é preenchido em `--text-primary` (#202020), não na cor de marca — a marca (#6647F0) fica reservada a acentos e seleção.

Fonte completa dos tokens, componentes e princípios de motion do tema claro: `DESIGN.md` (raiz do projeto/Downloads).

### 9.1 Paleta (tema escuro)

| Token | Hex | Uso |
|---|---|---|
| `--bg-primary` | `#0D0D0F` | Fundo geral |
| `--bg-secondary` | `#151519` | Topbar, sidebar, rail |
| `--bg-tertiary` | `#1E1E24` | Cards, modais, inputs |
| `--bg-elevated` | `#25252D` | Hover, seleção |
| `--primary-500` | `#7B68EE` | Destaque, botão primário, status ativo |
| `--primary-50` | `rgba(123, 104, 238, 0.12)` | Fundo de itens selecionados |
| `--text-primary` | `#FFFFFF` | Títulos, texto principal |
| `--text-secondary` | `#B0B0B8` | Corpo, descrições |
| `--text-tertiary` | `#6E6E78` | Placeholders, ícones inativos |
| `--border-default` | `#2C2C35` | Bordas e divisores |
| `--border-hover` | `#3D3D48` | Hover de bordas |
| `--success-500` | `#00BFA5` | Concluído, ativo, saldo saudável |
| `--warning-500` | `#FFB300` | Pendente, vistoria, alerta |
| `--danger-500` | `#FF4D4F` | Crítico, rejeitado, erro |
| `--info-500` | `#2196F3` | Aberta, informação |

### 9.2 Tipografia

- **Fonte:** `Inter, Roboto, "Helvetica Neue", sans-serif`.
- **Corpo:** `14px / 400`, cor `--text-secondary`.
- **Títulos de página:** `15–16px / 600`, cor `--text-primary`.
- **Labels/headers:** `11–13px / 500–600`, cor `--text-tertiary`.
- **Números de indicador:** `28px / 700`, cor `--text-primary`.

---

## 10. Componentes

### 10.1 Cards

- Fundo `--bg-tertiary`, raio **8–12px**, borda `1px solid --border-default`.
- Hover: fundo `--bg-elevated`.
- Título: `16px / 600`, `--text-primary`.
- Subtítulo: `13px / 400`, `--text-tertiary`.

### 10.2 Botões

- **Primário:** fundo `--primary-500`, texto branco, raio **8px**, altura **36–40px**.
- **Outline/secundário:** fundo transparente, borda `--border-default`, texto `--text-secondary`.
- **Pill/Circular:** raio **999px**, tamanho **28–32px**, usado na toolbar.
- Hover primário: fundo `--primary-600`.
- Hover outline: fundo `--bg-elevated`, borda `--border-hover`.

### 10.3 Inputs

- Fundo `--bg-tertiary`, borda `--border-default`, raio **8px**, altura **36px**.
- Texto: `--text-primary`.
- Placeholder: `--text-tertiary`.
- Label: `13px / 500`, `--text-secondary`.
- Foco: borda `--primary-500`, glow sutil.

### 10.4 Badges de status

| Status | Fundo | Texto |
|---|---|---|
| Aberta | `rgba(33, 150, 243, 0.15)` | `--info-500` |
| Em vistoria / Em atendimento | `rgba(255, 179, 0, 0.15)` | `--warning-500` |
| Aprovada / Ativo / Concluído | `rgba(0, 191, 165, 0.15)` | `--success-500` |
| Rejeitada / Crítico | `rgba(255, 77, 79, 0.15)` | `--danger-500` |
| Em progresso | `rgba(123, 104, 238, 0.15)` | `--primary-500` |

- Formato pill, padding **4px 10px**, fonte **12px / 600**.
- Sempre combinar cor + ícone/forma para acessibilidade.

### 10.5 Tabelas

- Cabeçalho: `12–13px / 600`, `--text-tertiary`, caixa alta.
- Linha: altura **36–40px**, borda inferior `--border-default`.
- Célula: `14px / 400`, `--text-secondary`.
- Hover: `--bg-elevated`.
- Estado vazio: linha de criação inline em foco.

### 10.6 Modais e drawers

- Fundo `--bg-tertiary`, raio **12px**, borda `--border-default`.
- Overlay: `rgba(0, 0, 0, 0.7)`.
- Entrada: fade-in + scale de `0.98` para `1`.

---

## 11. Padrões por tela

### 11.1 Login

- Fundo `--bg-primary` com glow roxo sutil no topo.
- Card centralizado, máx. **420px**, fundo `--bg-tertiary`, borda `--border-default`.
- Inputs escuros, botão primário em largura total.

### 11.2 Dashboard

- Header com título e CTA primário.
- Grid de indicadores: 4 colunas desktop, 1 coluna mobile.
- Cards de ação rápida abaixo.
- Sugestão futura: gráficos e lista de OS/chamados recentes.

### 11.3 Listas (Contratos, Chamados, OS, Saldo)

- Header com título + CTA.
- Toolbar com filtros e busca.
- Linha de criação inline no topo.
- Tabela dentro de card escuro.
- Coluna de ações alinhada à direita.

### 11.4 Nova OS / Formulários

- Seções separadas por divider.
- Lista de itens como cards verticais.
- Itens sem saldo desabilitados e com opacidade reduzida.
- Ações alinhadas à direita.

### 11.5 Novo Chamado

- Formulário enxuto ou modal/drawer.
- Campos: equipamento, número de série, solicitante, descrição.
- Upload de foto com pré-visualização.
- CTA primário "Salvar chamado".

### 11.6 Importar Contratos

- Área de upload com borda tracejada.
- Pré-visualização em tabela escura.
- Resumo de válidos/inválidos em badges.
- Botão de confirmação bloqueado se houver erro.

### 11.7 Painel de Saldo

- Tabela com contratado, consumido, reservado, disponível, utilização.
- Valores críticos em `--danger-500`.
- Barra de progresso com cor dinâmica.

---

## 12. Jornada do usuário (checklist de UX)

1. **Entrada:** usuário cai no Dashboard — hub com indicadores e ações rápidas, nunca tela vazia.
2. **Navegação:** rail troca de módulo → sidebar troca de contexto → conteúdo reage sem reload.
3. **Criação de item:** preferencialmente inline ou via botão "+ Criar" na toolbar/sidebar.
4. **Edição de detalhes:** painel lateral direito mantendo a lista visível ao fundo.
5. **Troca de visão:** mesmos dados podem ser vistos como Lista ou Quadro, sem perder filtros.
6. **Estado vazio:** sempre acionável — mostra o campo de adicionar em foco.
7. **Ações destrutivas:** escondidas atrás de menus "...", nunca em primeira linha.
8. **Feedback de status:** cor + ícone redundantes, nunca cor apenas.

---

## 13. Animações e microinterações

- **Padrão:** `150ms ease-out`.
- **Entrada:** `200ms cubic-bezier(0.4, 0, 0.2, 1)`.
- **Modal:** fade + scale `0.98 → 1`.
- **Hover:** mudança sutil de fundo/borda, sem movimento excessivo.
- **Reduced motion:** respeitar `prefers-reduced-motion`.

---

## 14. Convenções de código

- Preferir classes utilitárias locais a estilos inline.
- Usar variáveis CSS do `styles.scss` para cores e tamanhos.
- Componentes Angular Material importados de forma granular (standalone).
- Ícones Material Icons.
- Textos em português do Brasil.
- Nunca hardcodear cores claras — sempre usar tokens.

---

## 15. Aplicação no projeto atual

### Estrutura já implementada
- Sidebar + toolbar + conteúdo.
- Tema escuro aplicado no `styles.scss`.

### Evoluções recomendadas
- Adicionar **rail de ícones** (nível 1) para navegação entre módulos.
- Substituir modais por **painel lateral direito** para criação/edição de chamados e OS.
- Adicionar **criação inline** no topo das listas.
- Criar **visão em Quadro (kanban)** para chamados/OS por status.
- Ajustar tamanhos de fonte e inputs para os tokens deste guideline.

---

*Atualizado em 19/08/2026 com base no guideline de referência do ClickUp.*
