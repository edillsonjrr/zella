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

### Perfis

| Perfil | O que faz |
|---|---|
| `gestor` | Cliente dono dos contratos: cadastros, contratos, aditivos, aprova orçamentos, encerra chamados e contratos. |
| `cliente` | Abre e acompanha chamados da própria unidade. |
| `gestor_contratado` | Empresa prestadora: abre OS nos próprios contratos, orça, designa técnicos, executa. |
| `tecnico` | Orça e executa as OS designadas a ele (ou sem técnico). |
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
#         eduardo@eletricasul.com.br (técnico), ana@senai.br (cliente) — senha senai123

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

## Deploy

```bash
cd frontend && npm run build
cd .. && firebase deploy --only functions,firestore:rules,hosting
```

Scripts de operação (só leitura por padrão), na pasta `functions`:

- `node scripts/verificar-saldos.js` — aponta inconsistências de saldo em produção.
- `node scripts/corrigir-disponivel.js <empresaId> [--aplicar]` — recalcula o disponível de itens com soma errada.

## Configurações por empresa (documento `empresasClientes/{id}`)

| Campo | Padrão | Efeito |
|---|---|---|
| `slaDias` | 5 | Prazo (dias) dos chamados abertos manualmente. |
| `ativa` | true | Empresa desativada não faz login. |

## Notificações

Eventos do fluxo (chamado aberto, orçamento pendente, aprovado, rejeitado, OS executada, contrato encerrado, falha da preventiva) geram documentos em `notificacoes` e aparecem no sino do topo. E-mail ainda não é enviado: ver A20 em PONTAS-SOLTAS.md.
