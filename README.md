# Zella — gestão de manutenção

Plataforma multiempresa para gestão de manutenção predial: chamados, ordens de serviço, orçamentos e saldo de contratos, com manutenção preventiva agendada e abertura de chamado por QR Code.

- **Ambiente publicado:** https://gestao-manutencao-app.web.app
- **Projeto Firebase:** `gestao-manutencao-app` (região `southamerica-east1`)
- **Backlog e decisões:** [PONTAS-SOLTAS.md](PONTAS-SOLTAS.md)

## Como funciona

O coração do produto é o laço **OS ↔ saldo de contrato**:

1. Um **chamado** é aberto (pela tela, pelo QR Code de um equipamento ou pela preventiva agendada).
2. O gestor abre uma **OS** a partir do chamado, num contrato de uma empresa contratada.
3. A contratada (técnico ou gestor contratado) envia um **orçamento** com itens do contrato. Nome e preço vêm do contrato; a tela só manda item e quantidade.
4. O **gestor do cliente aprova** (podendo reduzir quantidades). A aprovação **reserva** o saldo dos itens.
5. A contratada **executa** a OS, informando o que foi de fato executado. O executado vira **consumido**; a sobra volta ao **disponível**.
6. O gestor **encerra** o chamado. Cancelar em qualquer ponto antes da execução devolve a reserva.

Saldo de item = `disponível + reservada + consumida = contratada`. Só as Cloud Functions escrevem esses campos; quantidade contratada e vigência mudam só por **aditivo**.

**Situações na tela:** o banco grava `status` no chamado e `situacao` na OS, com os valores de sempre, e a tela traduz os dois por uma máquina só (`shared/situacao.ts`): Novo chamado → Aguardando orçamento → Aguardando aprovação da gestão ("Aguardando sua aprovação" para a gestora) → Aprovado, aguardando o serviço → Serviço feito, aguardando encerramento → Encerrado (ou Orçamento recusado, Cancelado). Cada situação diz quem age agora. "Em vistoria" se divide pelo orçamento pendente; "Orçamento aprovado" e "A ser finalizado" são a mesma etapa.

**Linha do tempo:** o painel do chamado e o da OS mostram a mesma (`shared/historico.ts`), montada dos próprios registros, que todo perfil já lê. Para a gestão, que lê `logs`, cada etapa ganha hora e autor.

**Item fora do contrato:** a contratada pode acrescentar ao orçamento peça ou serviço que não está no contrato (descrição, quantidade, unidade e preço). Ele não mexe no saldo de nenhum item. A gestora aprova ou recusa cada um, com o total à parte, e a execução registra o que foi usado. Campos: `itensForaContrato` no orçamento (com `decisao`) e `itensForaContratoExecutados` na OS (sem preço, porque a solicitante lê a OS). Validação em `functions/src/foraContrato.ts`.

### Relatórios, etiquetas e exportação

Tudo é gerado no navegador, com o que cada perfil já lê: PDFs com jsPDF e o .zip com fflate, os dois carregados só quando usados.

- **Equipamentos** (gestor): "Importar planilha" (CSV, conferência linha a linha antes de gravar), "Imprimir etiquetas" (PDF A4, 9 plaquetas QR por folha) e "Histórico de manutenção" em PDF por equipamento.
- **Painel gerencial e Contratos**: "Relatório do mês" em PDF. A contratada recebe só os contratos e as OS dela.
- **Minha conta** (gestor): "Exportar todos os dados", um .zip com uma planilha CSV por coleção.
- **/compras**: página pública "Para compras e licitação", com a proposta em PDF. Razão social, CNPJ, contatos e nota fiscal ficam em `frontend/src/app/shared/comercial.config.ts`; campo vazio não aparece.

### Perfis

| Perfil | O que faz |
|---|---|
| `gestor` | Cliente dono dos contratos: cadastros, contratos, aditivos, aprova orçamentos, encerra chamados e contratos. |
| `cliente` | Na tela aparece como **Solicitante**. Pede conserto e acompanha os próprios pedidos em "Meus pedidos" (não entra no painel de gestão). |
| `gestor_contratado` | Empresa prestadora: abre OS nos próprios contratos, orça, designa técnicos, executa. Não abre chamado (só pelo QR Code). |
| `tecnico` | Executa as OS designadas a ele (ou sem técnico). Orça quando a contratada não tem responsável cadastrado. Não abre chamado (só pelo QR Code). |
| `admin_plataforma` | Cria empresas clientes. Lista em `configuracaoPlataforma/admins` no Firestore. |
| `convidado` | Sessão anônima de quem escaneou um QR Code; só abre chamado. |

## Estrutura

```
frontend/   Angular 19 + Material (Firebase Hosting)
functions/  Cloud Functions v2 (Node 22): máquina de estados, saldo, importação, preventiva
shared/     Tipos do domínio compartilhados (frontend e functions reexportam daqui)
docs/       Propostas, guias de UI e material interno
firestore.rules, storage.rules, firestore.indexes.json
```

Cada empresa cliente é um documento em `empresasClientes/{id}` e **todas** as coleções de negócio vivem dentro dele. O `empresaId` está no token (custom claim) e as rules só abrem essa subárvore.

## Rodar localmente

Pré-requisitos: Node 22+, Java 21+ (emuladores), Firebase CLI logado no projeto.

```bash
# dependências
cd frontend && npm install
cd ../functions && npm install

# emuladores (auth, firestore, functions, storage) — na raiz
firebase emulators:start --only auth,firestore,functions,storage

# dados de demonstração — na pasta functions, com os emuladores no ar
npm run build && npm run seed
# logins: carla@senai.br (gestor), diego@eletricasul.com.br (gestor contratado),
#         eduardo@eletricasul.com.br (técnico), ana@senai.br (solicitante) — senha senai123
# o saldo de cada item sai das OS e orçamentos do próprio seed (functions/src/seedDados.ts)

# frontend
cd ../frontend && npm start
```

O app fala com o Firebase real por padrão. Para apontar ao emulador, no console do navegador em `localhost`:

```js
localStorage.setItem('gm-emulador', '1'); location.reload();
```

## Testes

```bash
cd functions && npm test
```

Sobe os emuladores e roda os testes de integração das functions (fluxo completo de saldo, aditivo, encerramento, importação, SLA, notificações) e das Security Rules por perfil.

Os testes puros rodam sem emulador, depois de `npm run build`:

```bash
cd functions && node --test test/seed.test.mjs test/foraContrato.test.mjs test/textos.test.mjs
```

## Deploy

```bash
cd frontend && npm run build
cd .. && firebase deploy --only functions,firestore:rules,hosting
```

Scripts de operação (só leitura por padrão), na pasta `functions`:

- `node scripts/verificar-saldos.js` — aponta inconsistências de saldo em produção.
- `node scripts/corrigir-disponivel.js <empresaId> [--aplicar]` — recalcula o disponível de itens com soma errada.
- `node scripts/migrar-empresa-contratada.js --simular|--aplicar [--producao=<projeto>]` — preenche `empresaContratadaId` nos chamados com OS (rodada 3). Passo a passo em `docs/deploy-chamados-contratada.md`.

## Configurações por empresa (documento `empresasClientes/{id}`)

| Campo | Padrão | Efeito |
|---|---|---|
| `slaDias` | 5 | Prazo (dias) dos chamados abertos manualmente. |
| `ativa` | true | Empresa desativada não faz login. |

## Notificações

Eventos do fluxo (chamado aberto, orçamento pendente, aprovado, rejeitado, OS executada, contrato encerrado, falha da preventiva) geram documentos em `notificacoes` e aparecem no sino do topo. Quem abriu o chamado (com cadastro) recebe aviso pessoal (`paraUsuarioId`) quando a OS é criada, o orçamento é aprovado, o serviço é feito e o chamado é encerrado ou cancelado. Clicar na notificação abre o item exato (`?chamado=`, `?os=`, `?pedido=`, `?contrato=`). E-mail ainda não é enviado: ver A20 em PONTAS-SOLTAS.md.


## Procedência de componentes e efeitos

Registro do que veio de catálogo externo, exigido pela skill `pegaComponente`.
Nenhum código foi copiado: os catálogos são React + Tailwind e este projeto é
Angular + SCSS com tokens próprios, então o que atravessa é o mecanismo.

| Onde | Mecanismo | Origem | Licença | O que mudou na tradução |
|---|---|---|---|---|
| `shared/page-loading` | Skeleton loader — brilho que atravessa o bloco | transitions.dev ("Skeleton loader", "pulse to content cross-fade") | **não declarada** — tratado como referência, nada copiado | O brilho passou a andar por `transform: translateX` numa faixa sobreposta, em vez de `background-position` num gradiente de 200%. A versão anterior repintava cada um dos dez blocos a cada quadro; com `transform` o compositor resolve sozinho. Acrescentado o caminho de `prefers-reduced-motion`, em que a faixa some e o bloco fica parado. |
| `dashboard` | Cabeçalho de grupo e de coluna presos na rolagem | mecanismo próprio — shadcn (data-table) não cobre cabeçalho fixo e a página do records-table do beautifului.dev estava fora do ar | — | `position: sticky` empilhado (grupo em `top: 0`, colunas logo abaixo). O impedimento real era `.chamados-table { overflow: hidden }`, que cria contexto de rolagem e desativa `sticky`; trocado por `overflow: clip`, que recorta igual sem criar scroll container. |
