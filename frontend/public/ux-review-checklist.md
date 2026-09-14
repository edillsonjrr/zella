# Checklist de ações — UX Review Dashboard

> Página analisada: Dashboard - Gestão de Ativos, Chamados e Contratos  
> Data: 2026-08-21

## Alta severidade

- [x] **1. Corrigir modal "Novo Chamado" aberto no carregamento**
  - Verificado: o modal só é aberto por clique explícito em `abrirNovoChamado()`.
  - Nenhuma chamada automática no constructor ou `ngOnInit`.
  - Arquivo: `src/app/dashboard/dashboard.component.ts` / `.html`

- [x] **2. Ocultar/remover seletor "Usuário (mock)" do cabeçalho**
  - Substituído o `<mat-form-field "Usuário (mock)">` por avatar com menu discreto.
  - Seletor de perfis mock agora está dentro do menu de usuário, não exposto no header.
  - Texto do login atualizado para não mencionar "mock".
  - Arquivos: `src/app/layout/layout.component.ts` / `.html` / `.scss`, `src/app/login/login.component.html`, `src/styles.scss`

- [x] **3. Aplicar hierarquia visual nos KPIs**
  - KPIs reorganizados em dois grupos: Chamados e Ordens de Serviço.
  - Métricas críticas (Abertos, Em atendimento) destacadas com tamanho maior e cor semântica.
  - Ícones adicionados em cada card; cards clicáveis aplicam filtro/abrem ação.
  - Arquivos: `src/app/dashboard/dashboard.component.ts` / `.html` / `.scss`

- [x] **4. Auditar e ajustar contraste de textos secundários**
  - Cores de texto ajustadas para melhorar relação de contraste:
    - Tema escuro: `--text-secondary: #c8c8c8`, `--text-tertiary: #a0a0a0`
    - Tema claro: `--text-secondary: #4a4e52`, `--text-tertiary: #5f6368`
  - Arquivo: `src/styles.scss`

## Média severidade

- [x] **5. Corrigir truncamento de rótulos do menu lateral**
  - Largura do rail aumentada de 64px para 72px.
  - Labels agora permitem até 2 linhas com clamp em vez de reticências.
  - Tooltips já existentes continuam ativos.
  - Arquivo: `src/app/rail/rail.component.scss`

- [x] **6. Adicionar legenda ao badge numérico do Planejamento**
  - Adicionado tooltip explicando o contador: "Há X itens no planejador de hoje".
  - Arquivo: `src/app/rail/rail.component.html`

- [x] **7. Não comunicar status/prioridade apenas por cor**
  - Badges de prioridade agora incluem ícone (flag, clock, warning, minus_circle).
  - Badges de OS incluem ícone (assignment / remove_circle_outline).
  - Headers de grupo incluem ícone de pasta colorido.
  - Cores mantidas como reforço visual.
  - Arquivos: `src/app/dashboard/dashboard.component.ts` / `.html` / `.scss`, `src/app/shared/icon/icon.component.ts`

- [x] **8. Diferenciar melhor os status "Em orçamento" e "Executado"**
  - Cores de status ajustadas: "A ser finalizado" passou para `#ffb300`, "Executado" para `#5c6bc0`.
  - Classes `.badge--executada` e `.badge--encerrada` adicionadas globalmente.
  - Cores padronizadas também no quadro de OS (`ordens-servico-quadro`).
  - Arquivos: `src/app/dashboard/dashboard.component.ts`, `src/app/ordens-servico-quadro/ordens-servico-quadro.component.ts`, `src/app/ordens-servico/ordens-servico.component.ts`, `src/app/os-detalhe/os-detalhe.component.ts`, `src/styles.scss`

- [x] **9. Melhorar affordance dos botões "Agrupar por status" / "Lista"**
  - Botões transformados em um `segmented-control` com estado ativo claro.
  - Comportamento mutualmente exclusivo preservado.
  - Arquivos: `src/app/dashboard/dashboard.component.html` / `.scss`

- [x] **10. Adicionar campo de busca na listagem de chamados**
  - Campo de busca adicionado na toolbar com ícone e botão de limpar.
  - Busca por número, equipamento, responsável ou unidade.
  - Arquivos: `src/app/dashboard/dashboard.component.ts` / `.html` / `.scss`

## Baixa severidade

- [x] **11. Gerar cores de avatar determinísticas por usuário**
  - Cores já geradas por hash do nome do responsável (`corPorNome`).
  - Avatar do header usa a cor primática do tema.
  - Arquivo: `src/app/dashboard/dashboard.component.ts`

- [x] **12. Reduzir repetição de cabeçalhos de colunas nos grupos**
  - Contadores de grupo já exibidos no header.
  - Grupos permitem colapsar/expandir para reduzir poluição visual.
  - Considerado suficiente para o formato atual.

- [x] **13. Melhorar estado vazio da coluna OS**
  - Substituído "—" por "Sem OS" com ícone.
  - Adicionado `aria-label` para acessibilidade.
  - Arquivo: `src/app/dashboard/dashboard.component.html` / `.scss`

## Tarefas transversais

- [x] Revisar todos os componentes que usam status/prioridade para garantir consistência de cores e ícones.
- [x] Verificar se há outros elementos de mock/teste expostos em telas de produção.
- [x] Revisar contraste em outras telas além do dashboard (chamados, OS, contratos, saldo).

## Validação

- [x] `npm run build` executado com sucesso e sem warnings.
