# Pontas soltas da plataforma

Levantamento feito em 14/09/2026 a partir do código (frontend Angular, Cloud Functions, Security Rules) e do build de produção.
Marque `[x]` conforme for resolvendo. Itens com **(em andamento)** já têm código sendo escrito nesta semana.

Legenda de prioridade: **P0** compromete saldo ou segurança · **P1** trava o fluxo do usuário · **P2** qualidade e operação · **P3** decisão de produto.

---

## 1. Integridade do saldo de contrato

- [x] **P0** `encerrarChamado` sem pré-condição. Encerrar com OS só aprovada deixava a reserva presa para sempre. Feito em 14/09: só encerra a partir de "Executado" e só o gestor; quem não vai executar cancela. Testado no emulador.
- [x] **P0** `criarOrcamento` não conferia a situação da OS. Feito em 14/09: só em Aberta, Em vistoria ou Rejeitada; orçamento pendente reenviado vira "Substituído". Testado.
- [x] **P0** `criarOrcamento` aceitava `precoUnitario` e `itemContratoId` do navegador. Feito em 14/09: o servidor copia nome e preço do item do contrato e recusa item de outro contrato. A tela manda só item e quantidade. Testado.
- [x] **P0** Rules deixavam `gestor_contratado` alterar contrato e `quantidadeContratada`. Feito em 14/09: contratada só lê; quantidade contratada, saldo e vigência ficam imutáveis para o app (só Cloud Functions). Formulário de item mostra a quantidade como leitura na edição.
- [x] **P0** `gestor_contratado` aprovava o próprio orçamento. Feito em 14/09: aprovar e rejeitar é só do gestor, no backend, no painel da OS e no quadro Kanban.
- [x] **P1** OS "Rejeitada" não aceitava novo orçamento. Feito em 14/09: aceita, e o botão passa a dizer "Novo orçamento". Testado.
- [x] **P1** Fluxo de aditivo de contrato. Feito em 14/09: Cloud Function `aditivarContrato` (gestor), registro em `contratos/{id}/aditivos`, log, botão "Registrar aditivo" no painel do contrato. Testado: vigência estendida e quantidades alteradas com o disponível acompanhando.
- [x] **P1** Técnico não conseguia montar orçamento: as rules não deixavam ele ler contratos, itens e orçamentos, então o formulário abria vazio. Feito em 14/09: leitura liberada para a contratada inteira (gestor contratado e técnico).
- [x] **P2** Botão "olho" da lista de contratos não fazia nada. Corrigido em 14/09.
- [x] **P2** Painel da OS mostrava o retrato de quando abriu; depois de aprovar ou orçar continuava com o status antigo. Corrigido em 14/09 (lê do signal).
- [x] **P2** Contratada via "Criar contrato" e técnico via "Criar OS", ações que as rules negam. Escondidos em 14/09.
- [ ] **P0** Deploy das functions e rules acima em produção. Depende de autorização e de `firebase deploy`.
- [ ] **P0** Script de verificação de dados em produção: itens com reserva presa por chamados encerrados sem execução e OS aprovadas com mais de um orçamento. Só leitura primeiro; correção caso a caso com autorização.
- [ ] **P2** Testar o arrastar do quadro Kanban com cada perfil depois das novas regras (só verificado por código).
- [ ] **P1** Execução parcial. Não há como executar quantidade menor que a orçada. O consumido do contrato fica errado na prática.
- [ ] **P1** Encerramento formal de contrato com devolução de reservas pendentes.

## 2. Estado e modelo de dados

- [ ] **P2** Chamado tem dois campos de estado (`situacao` e `status`) atualizados à mão em cada function. Definir uma fonte única ou derivar um do outro.
- [ ] **P2** Status "Crítico" de contrato existe no tipo e no seed, mas nada o calcula. Painel gerencial filtra por ele em vão. Calcular por saldo ou vigência, ou remover.
- [ ] **P2** `functions/src/types.ts` e `frontend/src/app/shared/models.ts` são cópias manuais e já divergem. Extrair pacote compartilhado ou gerar um a partir do outro.
- [ ] **P2** `getOrcamentoByOS` devolve o primeiro que encontrar. Com mais de um orçamento por OS precisa seguir o `orcamentoId` da OS.

## 3. Funcionalidade incompleta

- [ ] **P2** "Ver OS" no painel do contrato abre só a primeira OS do contrato. Precisa listar todas.

- [ ] **P1** Importação de contratos: a tela tem `TODO` e nunca chama `importarContratos`. O botão só mostra sucesso. Backend existe e está órfão.
- [ ] **P1** Alterar quantidades na aprovação (prometido no MVP) não existe. Aprovação é tudo ou nada.
- [ ] **P1** Chamado "Executado" só é encerrável pelo quadro Kanban arrastando. Painel de detalhe precisa do botão (em andamento junto com o item de encerrar).
- [ ] **P2** SLA: `dataVencimento` só é preenchido pela preventiva. Chamado manual não tem prazo, então "atrasado" só vale para preventiva.
- [ ] **P2** Técnico designado é decorativo: a OS guarda `tecnicoId`, mas qualquer técnico da contratada vê e executa qualquer OS dela.
- [ ] **P2** Nenhuma notificação (e-mail ou aviso) ao abrir chamado, orçamento pendente ou aprovado. Tudo depende de alguém abrir a tela.

## 4. Segurança de dados

- [ ] **P1** Coleção `usuarios` legível por qualquer perfil da empresa. Cliente e técnico enxergam e-mail de todo mundo. Restringir ou projetar só nome.
- [ ] **P2** Administradores da plataforma são dois e-mails pessoais fixos no código (`perfis.ts`).
- [ ] **P2** `functions/scripts/gestor-demo.js` escreve em produção com o refresh token do Firebase CLI local, sem trilha nem revisão. Remover ou transformar em callable auditada.
- [ ] **P2** A pasta `public/` inteira vai para o Hosting: screenshots, JSONs de especificação, checklists internos e este arquivo. Mover material interno para fora de `public/` antes do próximo deploy.

## 5. Qualidade e operação

- [ ] **P1** Nenhum commit. O frontend está em `master` sem histórico e a raiz do projeto não é repositório git. Fazer commit inicial e colocar a raiz sob controle de versão.
- [ ] **P1** Zero testes reais. Só o spec padrão do `AppComponent`. Prioridade: testes das Cloud Functions de fluxo (saldo) e das Security Rules com o emulator.
- [ ] **P2** Bundle inicial estoura o budget em 218 kB (1,72 MB contra 1,5 MB). `qrcode` entra como CommonJS.
- [ ] **P2** `migrarDadosRaiz`, `seed.ts` e a empresa `demo` seguem no código publicado. A própria migração se declara temporária.
- [ ] **P2** Tratamento de erro no frontend usa `alert`, `prompt` e `confirm` nativos. `data.service.ts` não tem nenhum `catch`.
- [ ] **P2** Sem monitoramento nem alerta de falha da preventiva agendada. Sem backup configurado do Firestore.
- [ ] **P2** Pasta `backend/` (Express) está morta e confunde a proposta com a implementação. Remover.
- [ ] **P3** README ainda é o padrão do Angular CLI com duas linhas de contexto.

## 6. Decisões de produto pendentes

- [ ] **P3** Alçada de aprovação por valor. Hoje é só perfil.
- [ ] **P3** Multiempresa comercial: plano, limite, cobrança. Desativar empresa hoje só bloqueia login.
- [ ] **P3** Perguntas do discovery sem resposta registrada: onde o saldo é controlado hoje, OS nasce só de chamado, integração com Protheus.
- [ ] **P3** Nome do produto: "Zella" no título da página, "Gestão de manutenção" no README, "Senai DF (demonstração)" na empresa demo.

---

## Como testar antes do deploy

O app aponta sempre para o Firebase real. Para testar functions e rules novas localmente:

1. `cd functions && npm run build`
2. Na raiz: `firebase emulators:start --only auth,firestore,functions,storage`
3. `cd functions && npm run seed` (usuários de teste com senha `senai123`: carla@senai.br gestor, diego@eletricasul.com.br gestor contratado, eduardo@eletricasul.com.br técnico, ana@senai.br cliente)
4. `cd frontend && npm start`, abra `http://localhost:4200`, no console do navegador rode `localStorage.setItem('gm-emulador','1')` e recarregue.

## Decisões já tomadas (14/09/2026)

1. Encerrar chamado só depois de "Executado".
2. Preço do orçamento é leitura, copiado do contrato pelo servidor. Contratada não edita contrato nem itens.
3. Orçamento novo só em OS Aberta, Em vistoria ou Rejeitada. Trocar orçamento aprovado exige rejeitar ou cancelar antes.
4. Aprovar e rejeitar orçamento é só do gestor do cliente.
5. Aditivo de contrato é a única forma de mudar quantidade contratada e vigência.
