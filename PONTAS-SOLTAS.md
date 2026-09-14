# Checklist de ações — plataforma de gestão de manutenção

Levantado em 14/09/2026. Ordem = ordem de execução. Marque `[x]` ao concluir.
**P0** saldo/segurança · **P1** trava o usuário · **P2** qualidade/operação · **P3** decisão de produto.

## Feito em 14/09
- [x] Encerrar chamado só após "Executado", só gestor.
- [x] Orçamento só em OS Aberta/Em vistoria/Rejeitada; reenvio vira "Substituído".
- [x] Preço e nome do item copiados do contrato pelo servidor.
- [x] Contratada só lê contrato/itens; quantidade, saldo e vigência imutáveis para o app.
- [x] Aprovar/rejeitar orçamento só gestor (backend, painel, Kanban).
- [x] Fluxo de aditivo (`aditivarContrato`, `contratos/{id}/aditivos`, botão no painel).
- [x] Técnico lê contratos/itens/orçamentos da própria contratada.
- [x] Botão "olho" da lista de contratos, painel da OS ao vivo, botões "Criar" ocultos por perfil.
- [x] Commit inicial no git (raiz, branch `main`).
- [x] Modo emulador opt-in (`localStorage gm-emulador=1`) + script `functions/scripts/verificar-saldos.js`.

## Ações

### Agora (produção)
- [ ] **A1 P0** Publicar functions, rules e hosting: `npx firebase deploy --only functions,firestore:rules,hosting` (raiz). Executado pelo Edilson.
- [ ] **A2 P0** Rodar `node scripts/verificar-saldos.js` (pasta functions) e colar a saída. Só leitura.
- [ ] **A3 P0** Corrigir cada apontamento de A2, um a um, com autorização.

### Esta semana (código)
- [x] **A4 P1** Importação de contratos ligada ao backend (14/09): prévia por linha, erros do servidor por linha, contrato duplicado, fornecedor casado com empresa contratada, colunas opcionais `unidade;preco_unitario`, log por contrato.
- [x] **A5 P1** `usuarios` (com e-mail) só para o gestor (14/09). Espelho `usuariosPublicos` sem e-mail para os demais, mantido por trigger e reconstruído automaticamente quando falta (`reconstruirUsuariosPublicos`).
- [x] **A6 P1** Testes (14/09): `cd functions && npm test` sobe os emuladores e roda 23 testes — fluxo de saldo (orçamento, aprovação, execução, cancelamento, aditivo, importação) e Security Rules por perfil.
- [x] **A7 P2** Limpeza (14/09): material interno movido para `docs/`, `backend/` removido, migração e sua tela removidas, `seed:prod` e `gestor-demo.js` removidos. `public/` só tem favicon e logo. Este arquivo foi para a raiz.
- [x] **A8 P2** Chamado só com `status` (14/09); a fase vem de `shared/chamado-fase.ts`. Documentos antigos com `situacao` seguem lendo normalmente.
- [x] **A9 P2** Status do contrato calculado em `shared/contrato-status.ts` (14/09): Vencido, Crítico (vence em 30 dias ou item com ≤10% de saldo), Ativo, Encerrado. O campo gravado só distingue Encerrado.
- [x] **A10 P2** Tipos compartilhados em `shared/dominio.ts` (14/09); `functions/src/types.ts` e `frontend/.../models.ts` reexportam. Atenção: `functions/package.json` main agora é `lib/functions/src/index.js`.
- [x] **A11 P2** Painel do contrato lista todas as OS (14/09).
- [x] **A12 P2** `alert`/`prompt`/`confirm` substituídos por `DialogoService` (14/09); exclusões com try/catch e feedback.
- [x] **A13 P2** Bundle inicial 1,14 MB (14/09): dashboard lazy, `qrcode` por import dinâmico.
- [ ] **A14 P2** Testar arrastar no Kanban com cada perfil após as novas regras.

### Próximas semanas (produto)
- [ ] **A15 P1** Execução parcial: executar quantidade menor que a orçada. Precisa de decisão.
- [ ] **A16 P1** Encerramento formal de contrato com devolução de reservas pendentes.
- [ ] **A17 P1** Alterar quantidades na aprovação do orçamento (prometido no MVP).
- [ ] **A18 P2** SLA em chamado manual (`dataVencimento` só existe na preventiva).
- [ ] **A19 P2** Técnico designado com efeito real (hoje qualquer técnico da contratada executa qualquer OS).
- [ ] **A20 P2** Notificações por e-mail: chamado aberto, orçamento pendente, aprovado.
- [ ] **A21 P2** Monitoramento da preventiva agendada e backup do Firestore.
- [ ] **A22 P2** Admins da plataforma fora do código (`perfis.ts` tem dois e-mails fixos).
- [ ] **A23 P3** Alçada de aprovação por valor.
- [ ] **A24 P3** Multiempresa comercial: plano, limite, cobrança.
- [ ] **A25 P3** Responder discovery: onde o saldo é controlado hoje, OS só nasce de chamado, Protheus.
- [ ] **A26 P3** Nome do produto (Zella × Gestão de manutenção × Senai DF).
- [ ] **A27 P3** README real.

## Como testar antes do deploy
1. `cd functions && npm run build`
2. Raiz: `firebase emulators:start --only auth,firestore,functions,storage`
3. `cd functions && npm run seed` — senha `senai123`: carla@senai.br (gestor), diego@eletricasul.com.br (gestor contratado), eduardo@eletricasul.com.br (técnico), ana@senai.br (cliente)
4. `cd frontend && npm start`, no console: `localStorage.setItem('gm-emulador','1')` e recarregar.

## Decisões tomadas (14/09/2026)
1. Encerrar só depois de "Executado".
2. Preço do orçamento é leitura, vem do contrato. Contratada não edita contrato.
3. Orçamento novo só em OS Aberta, Em vistoria ou Rejeitada.
4. Aprovar/rejeitar é só do gestor do cliente.
5. Quantidade contratada e vigência só mudam por aditivo.
