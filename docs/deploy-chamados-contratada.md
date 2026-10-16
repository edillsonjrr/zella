# Deploy da correção de vazamento de chamados (rodada 3)

Preparado em 15/10/2026 para o projeto `gestao-manutencao-app`. O que já rodou em produção está em "Situação". Cada passo marcado com ⚠️ grava em produção e precisa do OK da dona antes.

## Situação
- 15/10/2026: **passo 2 (functions) feito**. As 24 functions foram atualizadas, sem erro de faturamento. Desde então, `criarOS` grava o campo no chamado.
- 15/10/2026: **passo 3 (simulação) feito**, só leitura. Só a empresa `demo` tem chamados (52), e as outras 4 têm zero. Resultado: 45 chamados a alterar, 7 sem OS e 0 problemas.
- 15/10/2026, 19:41: **passo 4 (migração aplicada) feito**. 45 chamados da empresa `demo` receberam o campo: c1 14, c2 16, c3 13 e `pTsXC0RkbgBjLAczv96E` (Fornecedor Teste) 2. Os 7 sem OS ficaram sem o campo, e foram gravados 45 logs. O `--simular` seguinte deu "0 a alterar". Cópia para reverter, fora do repositório: `C:\Users\edils\Documents\zella-copias\migracao-empresaContratadaId-prod-20261015-194129.json`.
- **Ordem trocada:** o app que estava no ar (`main-UJ62KLWO.js`) consultava `chamados` sem filtro para a contratada. Com a regra nova, a consulta inteira seria negada. Como o app novo funciona com a regra antiga, o hosting subiu antes das regras.
- 15/10/2026, ~19:47: **passo 6 (hosting) feito**, só o site `sistema` (`main-RID3DJZZ.js`). O app `chamado` não mudou desde 18/09 e não foi publicado de novo. A tela de entrada abre sem erro no console.
- 15/10/2026, 19:48: **passo 5 (regras) feito**. O ruleset novo é `dc47cf4a-d50f-4115-b44a-06aa05c25d08`; o anterior, para reverter, é `c73c9ba7-a4ca-4ddc-b89d-6e01ce7b0497`. Conferido com `functions/scripts/conferir-regras-chamados.js`, que usa a API de teste de regras sobre os 52 chamados reais:

  | Quem | Regra antiga | Regra nova |
  |---|---|---|
  | Diego (responsável, Elétrica Sul) | 52 de 52 (36 de outras empresas ou sem OS) | 16 de 52, todos da Elétrica Sul |
  | Eduardo (técnico, Elétrica Sul) | 52 de 52 | 16 de 52, todos da Elétrica Sul |
  | Responsável simulado da Ar Condicionado | 52 de 52 | 14 de 52, todos dele |
  | Gestora | 52 de 52 | 52 de 52 |

- **Todos os passos estão feitos.** Falta entrar no app como a contratada, para ver a lista na tela. Isso precisa da senha dela e não foi feito.

## O que entra
- **Regra nova de `chamados`** (`firestore.rules`): a contratada (responsável e técnico) só lê o chamado cujo `empresaContratadaId` é o dela. Antes, todo perfil que não fosse solicitante lia todos os chamados da empresa.
- **Functions:** `criarOS` grava `empresaContratadaId` no chamado. `reabrirChamado` e `encerrarContrato` apagam o campo quando o chamado volta a "Aberto".
- **App (hosting):** a consulta da contratada filtra por `empresaContratadaId`.
- **Migração** (`functions/scripts/migrar-empresa-contratada.js`): preenche o campo nos chamados que já têm OS, copiando da OS ligada (ou, se a OS não tiver o campo, do contrato da OS). Chamado sem OS fica sem o campo.

## Por que a ordem importa
- **Sem a migração**, a regra nova e o app novo escondem da contratada os chamados antigos dela.
- **Sem as functions novas**, a OS criada depois do deploy não grava o campo no chamado. Com a regra nova, a contratada não vê esse chamado. Com o app novo, ela também não o vê, mesmo com a regra antiga, porque a consulta já filtra.

Por isso a ordem é: functions → migração → regras → hosting. **Se as functions não subirem** (faturamento desligado), pare depois do passo 2. Não publique regras nem hosting até elas subirem. Se publicar mesmo assim, rode a migração de novo todo dia até as functions subirem (veja "Plano B").

## Antes de começar
1. Firebase CLI logado na conta dona do projeto: `firebase login:list`.
2. Projeto certo: `firebase use` deve mostrar `gestao-manutencao-app`.
3. Faturamento (Blaze) ligado no projeto, para as functions: console do Firebase → Uso e faturamento.
4. Testes verdes no emulador (com a trava):
   ```bash
   cd functions
   bash /c/Users/edils/Documents/Codex/its-ui/scripts/trava.sh rodar zella npm test
   ```
   Esperado: 91 de 91 (os 85 da rodada 3 e os 6 da migração em `test/migracao.test.mjs`).
5. Anote a hora. A cópia de segurança dos valores sai no passo 3.

## Passo a passo

### 1. Ensaio no emulador (opcional, sem risco)
Com o emulador aberto (`firebase emulators:start --only firestore`, com a trava) e o seed carregado:
```bash
cd functions
FIRESTORE_EMULATOR_HOST=127.0.0.1:8080 node scripts/migrar-empresa-contratada.js --simular
```
O seed atual já grava o campo, então o ensaio mostra "0 a alterar". O caso com chamados antigos está no teste `test/migracao.test.mjs`.

### 2. ⚠️ Functions
```bash
firebase deploy --only functions
```
Confira que `criarOS`, `reabrirChamado`, `cancelarChamado`, `atribuirResponsavelChamado` e `encerrarContrato` aparecem como atualizadas. Se der erro de faturamento, **pare aqui**.

### 3. Migração simulada (só lê produção)
Na pasta `functions`, **sem** `FIRESTORE_EMULATOR_HOST` definido:
```bash
node scripts/migrar-empresa-contratada.js --simular --producao=gestao-manutencao-app
```
O script não roda em produção sem `--producao=` escrito por extenso. Leia a saída:
- `MUDARIA CH-…: (sem campo) -> <contratada>`: o que vai ser gravado;
- `PROBLEMA`: chamado com OS que o script não resolve (OS apagada, ou OS e contrato sem contratada). Esses ficam sem o campo, e só o gestor os vê. Resolva à mão ou aceite;
- `AVISO`: OS e contrato com contratadas diferentes (vale a da OS), ou chamado sem OS com o campo (não é mexido).

Para olhar uma empresa só: `--empresa=<id>`.

### 4. ⚠️ Migração aplicada
```bash
node scripts/migrar-empresa-contratada.js --aplicar --producao=gestao-manutencao-app
```
- Antes de gravar, o script salva a cópia `migracao-empresaContratadaId-<data>.json` na pasta atual (ou em `--copia=<arquivo>`), com o valor anterior de cada chamado alterado. **Guarde esse arquivo** fora do repositório: é ele que permite reverter.
- Grava só o campo `empresaContratadaId` e um log `chamado.editar` por chamado (autor "Migração da contratada no chamado (script)"), que aparece no histórico do chamado.
- Rode o `--simular` de novo: deve dar "0 a alterar". Rodar a migração duas vezes não muda nada.

### 5. ⚠️ Regras
```bash
firebase deploy --only firestore:rules
```

### 6. ⚠️ Hosting
```bash
cd frontend && npm run build
cd ../chamado && npm run build
cd .. && firebase deploy --only hosting
```
Os builds pesam: rode cada um com a trava (`bash /c/Users/edils/Documents/Codex/its-ui/scripts/trava.sh rodar zella npm run build`).

### 7. Conferência em produção
- Entre como responsável de uma contratada. A lista de chamados mostra só os chamados das OS dos contratos dela, inclusive os antigos.
- Entre como gestor: continua vendo todos.
- Crie uma OS de teste: o chamado aparece para a contratada do contrato. Se não aparecer, as functions não estão atualizadas: volte ao passo 2.
- Console do navegador: nenhum `permission-denied` na tela de chamados da contratada.

## Como reverter

### Regras e app (o vazamento volta, mas ninguém perde acesso)
A regra antiga ignora o campo, então voltar a regra não depende de desfazer a migração. **Volte as regras antes do hosting.** O app antigo consulta os chamados sem filtro, e a regra nova nega essa consulta.
1. **Regras:** no console do Firebase → Firestore → Regras → Histórico, publique a versão anterior (ruleset `c73c9ba7-a4ca-4ddc-b89d-6e01ce7b0497`, de 13/10/2026). Ou, pelo repositório, recupere o `firestore.rules` de antes da rodada 3 e rode `firebase deploy --only firestore:rules`.
2. **Hosting:** no console → Hosting → histórico de versões do site `gestao-manutencao-app` (e `zella-chamado`), use "Reverter" na versão anterior. Leva segundos e não precisa de build.
3. **Functions:** não precisa voltar. As novas só gravam ou apagam o campo, que a regra antiga ignora. Se precisar, faça o deploy das functions a partir do código anterior.

### Dados da migração (raramente necessário)
O campo extra não atrapalha a regra antiga, então desfazer a migração só é preciso se o valor estiver errado. Com a cópia salva no passo 4:
```bash
node scripts/migrar-empresa-contratada.js --reverter=<cópia.json> --simular --producao=gestao-manutencao-app
node scripts/migrar-empresa-contratada.js --reverter=<cópia.json> --aplicar --producao=gestao-manutencao-app
```
- Volta cada chamado ao valor de antes, ou tira o campo se ele não existia.
- Não mexe em chamado que mudou depois da migração (OS nova, reabertura), para não apagar o que as functions gravaram. Esses aparecem como `IGNORADO`.
- Grava um log "Migração revertida" por chamado.

**Atenção:** com a regra nova no ar, desfazer a migração esconde da contratada os chamados antigos. Volte a regra primeiro.

## Plano B: fechar o vazamento sem as functions novas
Só se for preciso fechar o vazamento antes de o faturamento voltar.
- Faça os passos 3 a 6 (migração, regras **e** hosting juntos). Só a regra, sem o hosting, não serve: o app atual da contratada consulta `chamados` sem filtro, a regra nova nega a consulta inteira, e a lista dela fica vazia.
- A OS criada depois disso não grava o campo no chamado, e a contratada só vê esse chamado depois da próxima migração. Rode o `--aplicar` ao fim de cada dia útil até as functions subirem. Repetir não estraga nada: o que já está certo não muda.
- O chamado reaberto continua com a contratada antiga até a próxima OS. Ela ainda o vê, mas não age nele, porque as callables conferem a OS.
- Avise a contratada do atraso: a OS nova pode levar até um dia para aparecer na lista dela.
