# Workflow: Padronizar inputs no estilo da tela de login

## Objetivo
Aplicar o estilo visual dos inputs da tela de login (nativos, altura 48px, borda arredondada, label acima, foco com cor primária) em todo o sistema, incluindo os componentes que usam `mat-form-field appearance="outline"` do Angular Material.

## Estilo de referência (login)
- Input com altura de **48px**
- Padding horizontal de **14px**
- Borda de **1px solid var(--border-default)**
- Background **var(--bg-secondary)**
- Texto **var(--text-primary)**
- Placeholder **var(--text-tertiary)**
- Hover: borda **var(--border-hover)**
- Focus: borda **var(--primary-500)** + box-shadow **0 0 0 3px var(--primary-50)**
- Label acima do campo em fonte pequena, sem animação de flutuação

## Passos

### 1. Estilos globais (obrigatório)
Atualizar `frontend/src/styles.scss` para sobrescrever os `mat-form-field` appearance outline, transformando-os no estilo de input nativo do login.

Arquivos a alterar:
- `frontend/src/styles.scss`

### 2. Ajustar componentes com `matSuffix`/`matPrefix`
O Angular Material espera que ícones de suffix/prefix sejam marcados com diretivas `matSuffix`/`matPrefix`. O `app-icon` não carrega essa diretiva automaticamente.

Exemplo de correção:
```html
<!-- Antes -->
<app-icon matSuffix name="email"></app-icon>

<!-- Depois -->
<span matSuffix><app-icon name="email"></app-icon></span>
```

Arquivos a revisar:
- `frontend/src/app/login/login.component.html` ✅
- `frontend/src/app/chamado-detalhe/chamado-detalhe.component.html`
- `frontend/src/app/novo-chamado/novo-chamado.component.html`
- `frontend/src/app/nova-os/nova-os.component.html`
- `frontend/src/app/novo-contrato/novo-contrato.component.html`
- `frontend/src/app/orcamento/orcamento.component.html`
- `frontend/src/app/unidades/unidades.component.html`
- `frontend/src/app/usuarios/usuarios.component.html`
- Outros componentes com `matSuffix`/`matPrefix` + `app-icon`

### 3. Remover estilos locais conflitantes
Verificar em cada componente se há `::ng-deep .mat-mdc-form-field-subscript-wrapper { display: none; }` ou outras regras que possam conflitar com o novo estilo global.

### 4. Testes visuais
Para cada tela do sistema, verificar:
- Altura do input é 48px
- Label está legível e não sobreposta
- Placeholder não conflita com label
- Foco aplica cor primária e glow
- Selects e textareas seguem o mesmo padrão
- Inputs desabilitados e com erro continuam funcionando

### 5. Build
Rodar `npm run build` e corrigir eventuais erros de compilação.

## Critério de aceite
Todos os inputs do sistema devem ter aparência consistente com o input da tela de login, mantendo a acessibilidade e a funcionalidade do Angular Material por baixo.
