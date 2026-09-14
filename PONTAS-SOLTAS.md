# Checklist de ações — Zella

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
- [x] **A1 P0** Deploy feito em 14/09: functions (2 novas: `aditivarContrato`, `reconstruirUsuariosPublicos`; `migrarDadosRaiz` apagada), rules e hosting. Runtime Node 20 é descontinuado em 30/10/2026: subir para Node 22 antes disso (ver A28).
- [x] **A2 P0** Verificação rodada em 14/09 (script agora usa a API REST com o token do CLI). Resultado: nenhuma reserva presa, nenhuma OS com orçamento duplicado, nenhum saldo negativo. 6 itens da empresa `demo` com soma ≠ contratada (dados do seed, não de uso real).
- [x] **A3 P0** Corrigido em 14/09 com `scripts/corrigir-disponivel.js demo --aplicar`: 6 itens da `demo` com disponível recalculado, um log por item. Reverificação: 0 apontamentos.

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
- [ ] **A14 P2** Testar arrastar no Kanban com cada perfil após as novas regras. As regras de arrastar estão cobertas por código e testes das functions; o gesto em si ainda não foi validado no navegador (a automação travou duas vezes).

### Próximas semanas (produto)
- [x] **A15 P1** Execução parcial (14/09): `executarOS` aceita quantidade executada por item (≤ orçado); consome o executado e devolve a sobra ao disponível. Diálogo "Executar OS" na tela; `itensExecutados` fica na OS. Testado.
- [x] **A16 P1** Encerramento formal de contrato (14/09): `encerrarContrato` (gestor, com motivo). Bloqueia se houver OS aprovada com reserva (lista quais); cancela OS ainda em orçamento devolvendo o chamado a Aberto; zera o disponível restante (registrado como aditivo de encerramento) e notifica a contratada. Botão no painel do contrato. Testado.
- [x] **A17 P1** Ajuste de quantidades na aprovação (14/09): o gestor reduz itens (ou zera para remover) antes de aprovar, com motivo obrigatório; o orçamento guarda o original. Acima do orçado exige novo orçamento. Testado.
- [x] **A18 P2** SLA em chamado manual (14/09): `dataVencimento` = criação + `slaDias` da empresa (padrão 5). Configurável em `empresasClientes/{id}.slaDias`. Testado.
- [x] **A19 P2** Técnico designado com efeito (14/09): técnico só orça/executa a OS designada a ele (ou sem técnico). Nova function `atribuirTecnicoOS` (gestor e gestor contratado, técnico da mesma contratada); seletor no painel da OS; Kanban respeita. Testado.
- [~] **A20 P2** Notificações (14/09): sino no topo com notificações internas por evento (chamado aberto, orçamento pendente/aprovado/rejeitado, OS designada/executada, contrato encerrado, falha da preventiva), endereçadas por perfil/pessoa/contratada, com "marcar como lida". **E-mail ainda não sai**: falta um provedor (SMTP ou extensão *Trigger Email*). Quando houver, basta um trigger em `notificacoes` que monte a mensagem. Decisão sua: qual provedor/conta remetente.
- [~] **A21 P2** Monitor da preventiva (14/09): cada execução grava `operacao/preventiva`; a tela de Preventiva mostra faixa verde/vermelha e a falha vira notificação ao gestor. **Backup do Firestore** ainda não configurado: precisa de `gcloud firestore backups schedules create --database='(default)' --recurrence=daily --retention=7d` (ou pelo console, Firestore → Backups). Não dá para fazer daqui sem o gcloud.
- [x] **A22 P2** Admins fora do código (14/09): lista lida de `configuracaoPlataforma/admins` ({ emails: [] }) no Firestore, sem acesso pelo app; os dois e-mails do código ficam como fallback se o documento não existir ou estiver vazio. Para alterar: criar/editar o documento pelo console.
- [x] **A23 P3** Alçada por valor: **não faz parte do escopo** (decisão de 14/09). O controle do sistema é de quantidade: a aprovação reserva itens e a trava de saldo recusa o que passa do disponível do contrato. Sem alçada por valor.
- [ ] **A24 P3** Multiempresa comercial: **adiado** (decisão de 14/09). Não é preocupação para o teste guiado.
- [x] **A25 P3** Discovery respondido em 14/09: o saldo hoje é controlado em planilha e no Protheus; a OS sempre nasce de um chamado (já é assim no sistema: `criarOS` exige `chamadoId`). Integração Protheus/TOTVS: viabilidade abaixo (ver "Integração com o Protheus").
- [x] **A26 P3** Nome: **Zella** (decisão de 14/09). Título, README e nomes dos pacotes alinhados. O id do projeto Firebase (`gestao-manutencao-app`) não pode ser renomeado; a URL pode ganhar domínio próprio depois.
- [x] **A27 P3** README real (14/09): fluxo, perfis, estrutura, como rodar, testes, deploy, scripts e configurações.
- [x] **A28 P1** Node 22 (14/09): `functions/package.json` engines = 22; testes passando. Entra em produção no próximo deploy.

### Depois do piloto
- [ ] **A29 P2** Usuário em mais de uma empresa/perfil. Hoje é um e-mail, uma empresa, um perfil: o login usa o primeiro cadastro que achar e o token tem um único `empresaId`/`perfil`. Uma contratada que atende dois clientes não consegue usar o mesmo técnico nos dois, e um gestor não pode ser técnico em outra empresa. Caminho: cadastro global da pessoa com lista de vínculos `{empresaId, perfil}`, seletor de empresa após o login e claim gravado por vínculo escolhido (backend, rules e tela de login). Fazer quando houver contratada atendendo mais de um cliente na plataforma.
- [ ] **A30 P2** E-mail de notificação (continuação da A20): escolher provedor e criar o trigger em `notificacoes`.
- [ ] **A31 P3** Integração Protheus, fase 2 (exportação CSV da medição) e fase 3 (REST), conforme o quadro abaixo e o que o cliente entregar.

## Integração com o Protheus (viabilidade, 14/09/2026)

**O que existe do lado do Protheus.** O ERP expõe integrações por SOAP (legado) e REST/JSON (padrão a partir da versão 2410, obrigatório com o SmartClient web e telas PO-UI). Serviços REST são criados em ADVPL com `WSRESTFUL` no AppServer, ou pela camada TOTVS SmartClient WebService. Porém, segundo a própria central de atendimento da TOTVS, o módulo de Gestão de Contratos (SIGAGCT) **não tem APIs prontas** para integração nem pontos de entrada específicos; o caminho indicado é desenvolver rotinas sobre os `ExecAuto` de Contratos e de Medições.

**O que isso significa para a Zella.**
- Não há um endpoint "saldo do contrato" para consumir. Toda integração depende de desenvolvimento ADVPL do lado do cliente (ou do parceiro TOTVS dele), publicando um serviço REST customizado.
- O ponto natural de encontro é a **medição**: na Zella a execução da OS gera o consumido por item; no Protheus isso equivale a uma medição do contrato (SIGAGCT). A Zella pode enviar a medição (itens executados, quantidades, OS, data) e o Protheus continua sendo a fonte financeira.
- Sentido inverso (Protheus → Zella): carga inicial e aditivos de contratos podem vir por planilha exportada do Protheus (a importação CSV já existe) ou por um serviço REST que a Zella consulte periodicamente.

**Fases sugeridas.**
1. **Sem integração (agora):** Protheus e planilha continuam como fonte; a Zella importa contratos por CSV e o cliente confere o consumido pelo painel de saldo e pelos logs.
2. **Exportação (baixo esforço, só do lado da Zella):** botão/endpoint que exporta as execuções do período em CSV no layout da medição do Protheus, para digitação ou importação pelo time financeiro.
3. **Integração de fato (depende do cliente):** o cliente publica um serviço REST no AppServer (WSRESTFUL sobre ExecAuto de medição) com autenticação; uma Cloud Function da Zella envia cada execução de OS e guarda o retorno (número da medição) na OS, com fila de reenvio em caso de falha.

**O que perguntar ao cliente antes de orçar a fase 3:** versão do Protheus (≥ 2410?), se o AppServer tem REST habilitado e exposto para fora da rede, se já existe parceiro/ADVPL interno, qual o layout da medição no SIGAGCT deles, e se o contrato da Zella corresponde 1:1 ao contrato do Protheus (número, itens e unidades).

Fontes: [Arquitetura REST no Protheus](https://rfbsistemas.com.br/protheus/arquitetura-rest-totvs-protheus-desenvolvimento-erp/), [Central de Atendimento TOTVS — APIs no SIGAGCT](https://centraldeatendimento.totvs.com/hc/pt-br/articles/21181870074647), [Guia para criar serviço REST no Protheus](https://blog.globalgcs.com.br/guia-completo-para-criar-um-servico-rest-no-totvs-protheus-e-integrar-com-apis-externas/), [Integração Protheus com app e site](https://x-apps.com.br/integracao-totvs-protheus-app-site/).

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
