# Plano de ação do Zella (13/10/2026)

Feito a partir de dois estudos:
- o painel de 50 compradores simulados (`founder/RELATORIO-PAINEL.md`);
- o teste do agente anônimo com os quatro perfis no ambiente local (`docs/ux-anonimo-zella.md`, rodadas 1 e 2).

Conferido no código em 13/10/2026.

## O que os dois estudos dizem juntos

- **O preço cabe; a adoção não.** O Essencial (R$ 199) fica abaixo do "caro demais" para todos os 50, e o Profissional (R$ 449) para 43. Ninguém compraria no primeiro mês.
- **"O técnico não vai usar no celular"** é a objeção número 1 do painel. O anônimo mostra por quê:
  - a OS não leva ao técnico o defeito que a funcionária descreveu;
  - no celular a lista esconde a situação;
  - não há filtro "minhas OS".
- **O saldo do contrato é o que atrai, e é o que está quebrado.** Os compradores querem prestar contas à diretoria. O anônimo viu contas que não fecham. Pelo menos parte vem do seed (`functions/src/seed.ts` cria itens com 1000 = 750 + 50 + 0).
- **Implantação e compra:**
  - cadastrar equipamentos e colar QR assusta;
  - instituições compram por cotação, com proposta, CNPJ e nota fiscal;
  - quem guarda o histórico quer garantia de exportar tudo.
- **Quem pede e quem executa foram encaixados depois.** A funcionária cai no painel de gestão e nunca é avisada. A prestadora não consegue orçar o que fez de verdade.

## Pré-requisito

O faturamento do projeto `gestao-manutencao-app` está desligado: a conta 0143DC-0D366B-264840 foi encerrada em 29/09. Pelo plano de 13/10, o projeto passa para a conta do Procera. Nada abaixo chega a produção antes disso.

Esforço: **P** até 1 dia · **M** 2 a 5 dias · **G** 1 a 3 semanas.

## Fase 0: defeitos que quebram a confiança (1 a 2 semanas)

| # | O que fazer | Por quê | Esforço | Pronto quando |
|---|---|---|---|---|
| Z0.1 | **Saldo que fecha:** corrigir o seed e conferir a regra contratado = disponível + reservado + consumido em todas as telas. "Utilização %" com fórmula visível; "Unidades disponíveis" não soma un com kg | Explicação número 2 do anônimo; motivo de existir do produto | M | os números do contrato, do Painel de Saldo e do aditivo batem com o seed |
| Z0.2 | **Histórico vazio:** chamado e OS mostram "Nenhuma ação registrada" depois do fluxo inteiro, embora as functions gravem `logs`. Investigar a consulta por `alvoId`/`alvoPaiId` e as regras de leitura por perfil | Explicação número 6 do anônimo | M | a linha do tempo mostra aberto, OS criada, orçamento, aprovação, execução e encerramento |
| Z0.3 | **Uma máquina de situações:** chamado e OS com o mesmo vocabulário; "Em vistoria" se divide em "Aguardando orçamento" e "Aguardando sua aprovação"; impedir "Aprovada" sem orçamento | Explicação número 4 do anônimo | M | cada situação diz quem age agora |
| Z0.4 | **Papéis certos:** o técnico não recebe "Envie o orçamento" quando quem orça é a prestadora; o técnico da lista aparece no detalhe da OS; a lista de técnicos na Nova OS é filtrada pela contratada | Anônimo | P | |
| Z0.5 | **Login:** mensagem de perfil que diga que a senha está certa e dê um contato; "Conferindo seu cadastro..." depois de 5 segundos; "Primeiro acesso" pede confirmação antes de enviar o link, com os rótulos "Enviando link..." e "Não foi possível enviar o link" | Anônimo, rodada 1: três itens de gravidade alta | P | |
| Z0.6 | **Formatos e nomes crus:** "R$ 220.00", "OS OS-...", plurais, "Gestor_contratado", "Tecnico", a empresa errada no perfil da prestadora e os campos do histórico (`proximaExecucao`, datas ISO) | Anônimo | P | |
| Z0.7 | **Layout e botões mortos:** o formulário de Contratadas estoura a tela; o erro de validação encolhe a janela; "Ver contrato" não faz nada para a solicitante; "Novo chamado" aparece para a prestadora | Anônimo | P | |

## Fase 1: linguagem (1 semana)

O sistema fala a língua do fiscal de contrato. A lista completa está em `ux-anonimo-zella.md`.

| # | O que fazer | Esforço |
|---|---|---|
| Z1.1 | **Nomes de perfil e de objeto:** "Cliente" vira "Solicitante"; "Gestor contratado" vira "Responsável da contratada"; "Ativo" vira "Equipamento"; "Ata" vira "Contrato"; "Ordem de serviço (OS)" na primeira menção | P |
| Z1.2 | **Saldo em palavras comuns:** "Separado / Usado / Livre", com legenda de uma linha e a conta escrita ("Contratado 1000 = Usado 0 + Separado 50 + Livre 950") | P |
| Z1.3 | **Botões que dizem o efeito:** "Converter em OS" vira "Enviar para a empresa contratada"; "Salvar orçamento" vira "Enviar orçamento para aprovação"; "Executar tudo" vira "Registrar serviço feito"; "Gerar agora" vira "Abrir agora os chamados que estão vencendo" | P |
| Z1.4 | **Siglas de unidade (SAM, TAG, GAM, SOB) com o nome inteiro,** inclusive na plaqueta do QR, que fica exposta; "PAT-0021" vira "Patrimônio nº 0021" | P |
| Z1.5 | **Painel gerencial:** "Chamados criados no período", o prazo do atraso visível, "p.p." por extenso e cards clicáveis que abrem a lista filtrada | M |
| Z1.6 | **Apresentação (landing):** frase fixa no título; faixa de recursos parada; legenda no cartão de exemplo e na barra de saldo; rótulo nos botões de pausa e de tema; menu do celular com fundo | P |
| Z1.7 | **Importar contratos:** "Baixe o modelo, preencha no Excel e salve como CSV" no lugar da lista de colunas | P |

## Fase 2: cada perfil fazendo o seu (3 a 4 semanas)

Ataca a objeção número 1 do painel: o técnico e a solicitante usando de verdade.

| # | O que fazer | Por quê | Esforço |
|---|---|---|---|
| Z2.1 | **"Pedido original" dentro da OS:** descrição, local, solicitante e foto do chamado | Explicação número 1 do anônimo | P |
| Z2.2 | **Técnico no celular:** cartões com equipamento e situação, filtro "Minhas OS para executar", e fechar a OS em 2 ou 3 toques com foto | Painel: a virada mais pedida; explicação número 8 do anônimo | M |
| Z2.3 | **Solicitante:** tela "Meus pedidos" com botão grande; local e urgência no pedido; confirmação ao enviar; aviso a cada etapa (as notificações já aceitam `paraUsuarioId`); resumo do serviço no pedido encerrado | Explicação número 5 do anônimo | M |
| Z2.4 | **Equipamentos no menu:** o cadastro existe, mas fica escondido em Unidades > sala. Tela "Equipamentos" em Cadastros e lista com busca no "Novo chamado" | Explicação número 10 do anônimo | M |
| Z2.5 | **Encerrar com resumo** (OS, técnico, observação, itens, custo) e "Confirmar encerramento"; mensagem de sucesso em criar, orçar, aprovar e executar; itens do orçamento antes do botão Aprovar | Anônimo, gravidade alta | P |
| Z2.6 | **Notificações que abrem o item exato,** e prazo do chamado visível na lista e no detalhe | Anônimo | P |
| Z2.7 | **QR:** "Copiar link" e "Abrir prévia" para testar sem celular | Anônimo | P |
| Z2.8 | **Primeira vez de cada perfil:** uma tela curta "O que você faz aqui" ("Peça um conserto e acompanhe", "Suas OS para executar") | Anônimo | P |

## Fase 3: implantação, compra e oferta (em paralelo à Fase 2; decisões suas)

| # | O que fazer | Por quê | Esforço |
|---|---|---|---|
| Z3.1 | **Importar equipamentos por planilha e imprimir etiquetas QR em lote** (PDF A4 pronto para colar) | Painel: "importe minha planilha e me entregue as etiquetas" | M |
| Z3.2 | **Relatório mensal em PDF:** saldo de cada contrato, serviços feitos e preventivas, para diretoria, conselho ou vistoria. Também o histórico de preventiva por equipamento | Painel: pedido por gestores, síndicos e prestadoras | M |
| Z3.3 | **Exportação completa** (planilha e PDF por equipamento) a qualquer momento, inclusive no plano grátis e depois de cancelar, com a promessa escrita no site e no contrato | Painel: 11 recusas por confiança | M |
| Z3.4 | **Kit de compra:** proposta em PDF com CNPJ, plano anual de valor fixo e nota fiscal; página "Para compras e licitação" | Painel: 6 recusas por prazo de compra (cotação e diretoria) | P + processo |
| Z3.5 | **Orçamento com item fora do contrato:** item avulso marcado como "fora do contrato", que a gestora aprova à parte (e que pode virar aditivo) | Explicação número 3 do anônimo; prestadoras no painel | M |
| Z3.6 | **Decidir o saldo do contrato no Essencial:** o recurso que mais atrai só existe no plano de R$ 449, e síndicos e gestores menores pediram no de R$ 199 | Painel | decisão |
| Z3.7 | **Decidir a duração do teste:** pediram 30 dias, para cobrir um fechamento de mês | Painel | decisão |

## Fase 4: recursos novos de maior porte (depois de medir)

| # | O que fazer | Por quê | Esforço |
|---|---|---|---|
| Z4.1 | **Modo prestadora:** vários clientes numa conta; o QR do equipamento do cliente abre chamado direto para a equipe dela; o cliente vê o saldo por um link. Plano para prestadoras de até 10 técnicos (o painel sugeriu cerca de R$ 150) | Painel: 13 prestadoras dizem que o produto é do lado do cliente delas | G |
| Z4.2 | **Estoque de peças ligado à OS,** ou integração com o estoque do ERP | Painel: 4 recusas por falta disso | G |
| Z4.3 | **Técnico sem sinal:** registrar a execução offline e sincronizar depois | Painel | G |

## Decisões que são suas

1. **Saldo do contrato no Essencial (R$ 199)** ou só no Profissional.
2. **Teste:** 7, 14 ou 30 dias.
3. **Prestadoras:** são público do Zella (Fase 4, com plano próprio) ou só convidadas do cliente.
4. **Implantação com importação e etiquetas:** grátis como bônus ou cobrada por volume de equipamentos.

## Como medir

- **No fim de cada fase:** rodar o anônimo de novo, localmente, com os quatro perfis, e comparar a lista das 10 explicações.
- **Antes de rodar:** subir os emuladores com `FUNCTIONS_DISCOVERY_TIMEOUT=120` e corrigir o seed (Z0.1); sem isso o teste mede o seed, não o produto.
- **Depois das fases 2 e 3:** painel rápido de 20 compradores com o anúncio novo (importação, relatório mensal, garantia de dados, kit de compra).
- **No mundo real:** piloto com 2 ou 3 instituições, um prédio cada, medindo quantas OS o técnico fecha pelo celular sem ser cobrado.

## Andamento

**Fase 1 concluída em 13/10/2026.** O build passou, e as telas foram conferidas no navegador com o emulador: apresentação, login, Início, Painel gerencial (cartões abrindo a lista filtrada, com o total batendo), Painel de Saldo e plaqueta do QR.
- **Peças novas no front:**
  - `shared/rotulos.ts`, o mapa central de rótulos de perfil, unidade e patrimônio;
  - `shared/legenda-saldo`;
  - `shared/chamado-prazo.ts`, a regra de atraso usada pelo painel e pela lista.
- **A lista de chamados agora aceita filtros pela rota:** `periodo`, `atraso`, `fechados`, `origem` e `status`.
- **Defeitos novos para a Fase 0:**
  - "Em atraso" conta também chamados cancelados com prazo vencido;
  - o "Histórico de uso" do detalhe do saldo é uma tabela fixa no código (OS-2026-0095 etc.), não dados reais;
  - "Quantidade livre" ainda soma un com kg.
- **Textos antigos nas functions**, para uma próxima passada:
  - `aditivos.ts` ("reservado(s) ou consumido(s)", "saldo reservado");
  - `orcamentos.ts` ("disponível X", e o "R$ 220.00" do Z0.6);
  - `chamados.ts` ("Cliente só abre chamado...");
  - `contratos.ts` (validação da importação em linguagem técnica);
  - `ordensServico.ts` ("Envie o orçamento", do Z0.4).
- **Tela de laboratório:** `/lab/skeuomorfismo` ainda usa os termos antigos.
- **Commit:** as mudanças estão por cima de alterações sem commit que já existiam no repositório.

**Defeitos da Fase 0 e Fase 2 implementados em 13/10/2026** (build das functions e do front passando; testes escritos, ainda não rodados nos emuladores).
- **Saldo que fecha:**
  - o seed (`functions/src/seedDados.ts`) calcula separado e usado a partir das próprias OS e orçamentos;
  - executar e cancelar não criam mais saldo quando o item tem menos separado que o orçado;
  - o aditivo recalcula o livre pela conta;
  - aprovar ou recusar orçamento de OS cancelada é recusado;
  - o aditivo de encerramento grava a contratada antes e depois.
- **Telas de saldo:** "Itens com saldo baixo: X de Y" no lugar da soma de unidades, fórmula da utilização em dica, conta escrita no Painel de Saldo e no detalhe do item, e histórico de uso real.
- **"Em atraso"** não conta mais chamado cancelado.
- **Fase 2:** Z2.1 a Z2.8 entregues. Os campos novos são todos opcionais: `local`, `urgencia` e `equipamentoId` no chamado; `dataAprovacao` no orçamento; a coleção `preferencias/{usuarioId}`.
- **Testes novos:** `seed.test.mjs`, `saldo.test.mjs`, `solicitante.test.mjs` e `rules3.test.mjs`.

**Fase 3 (itens de código Z3.1 a Z3.5) implementada em 13/10/2026.** Build das functions e do front passando; testes puros rodados; testes com emulador escritos, ainda não rodados (portas ocupadas por outro projeto). Z3.6 e Z3.7 continuam como decisões suas.
- **Z3.1 Equipamentos:**
  - "Importar planilha": modelo CSV, conferência linha a linha com erros em português e gravação pelo mesmo caminho do cadastro (`salvarBloco`, `salvarSala`, `salvarEquipamento`). Com erro em qualquer linha, nada é gravado. Bloco e sala que faltam são criados, e a conferência avisa;
  - "Imprimir etiquetas": PDF A4 com 9 plaquetas QR por folha e linha de corte. O desenho e o QR saíram de `qrcode-detalhe` para `shared/plaqueta.ts`, usado pelos dois;
  - campos novos e opcionais no equipamento: `fabricante` e `modelo`.
- **Z3.2 Relatórios:**
  - "Relatório do mês" em PDF no Painel gerencial e em Contratos, com mês e contrato opcional: saldo no fim do mês com a conta escrita (refeito pelas OS, orçamentos e aditivos), serviços feitos com custo, preventivas previstas e feitas, chamados em aberto e em atraso;
  - "Histórico de manutenção" em PDF na lista de Equipamentos;
  - cada perfil recebe só o que já lê.
- **Z3.3 Exportação:** "Exportar todos os dados" em Minha conta (gestor). É um .zip com um CSV por coleção, datas em pt-BR e nomes no lugar dos ids. O CSV de equipamentos volta pela importação.
- **Z3.4 Kit de compra:** página pública `/compras`, linkada da apresentação, com "Baixar proposta em PDF". Os dados da empresa ficam em `frontend/src/app/shared/comercial.config.ts`, vazios; nota fiscal só aparece com `emitimosNotaFiscal: true`.
- **Z3.5 Item fora do contrato:** `itensForaContrato` no orçamento e `itensForaContratoExecutados` na OS, validados em `functions/src/foraContrato.ts`. A gestora aprova ou recusa cada um. Nada mexe em saldo.
- **Dependências novas no front:** `jspdf` 4.2.1 (PDF) e `fflate` 0.8.3 (zip; o jsPDF já depende dela). As duas carregam sob demanda.
- **Testes novos:** `functions/test/foraContrato.test.mjs` (puro, passou) e `functions/test/foraContrato-fluxo.test.mjs` (emulador).
- **Regras:** sem mudança. O que é novo é escrito pelas functions (orçamento, OS) ou cabe na regra de equipamento, que já é do gestor.

**Fase 0 concluída em 13/10/2026** (Z0.2 a Z0.7; Z0.1 já estava feito). `npm test` passando com os emuladores (81 de 81) e os builds das functions e do front passando. As telas não foram conferidas no navegador nesta passada.
- **Z0.2 Histórico vazio.** Causa: o painel lia só `logs`, e de dois jeitos errados.
  - Só a gestão lê `logs` (rules). Para técnico e contratada a consulta voltava "permission-denied", o `LogService` engolia o erro e a tela mostrava "Nenhuma ação registrada".
  - Cada painel consultava só o próprio id. Orçamento, aprovação e execução são gravados com o id da OS (`alvoPaiId` = OS), e abertura e encerramento com o do chamado. O chamado não via metade do fluxo, e a OS não via a outra metade.
  - Os chamados do seed não têm log nenhum.
  - Correção: `shared/historico.ts` monta a linha do tempo dos próprios registros (chamado, OS, orçamentos), que todo perfil já lê. Para a gestão, o log do chamado, da OS e do orçamento (consulta com `in`, mesmos índices) substitui cada marco e traz hora e autor. Chamado e OS mostram a mesma linha do tempo. As rules de `logs` continuam só da gestão: o log guarda preço e motivo.
- **Z0.3 Uma máquina de situações:** `shared/situacao.ts`, usada em Chamados (lista, grupos, filtro e quadro), painel do chamado, Ordens de serviço (lista, cartões e quadro), detalhe da OS, contrato, Painel gerencial e relatórios. Valores gravados sem mudança.
  - "Em vistoria" vira "Aguardando orçamento" ou "Aguardando aprovação da gestão" ("Aguardando sua aprovação" para a gestora).
  - "Orçamento aprovado" e "A ser finalizado" viraram uma situação só: "Aprovado, aguardando o serviço".
  - "Serviço feito, aguardando encerramento" e "Encerrado" ganharam a frase da diferença.
  - Na callable: aprovar só o orçamento atual da OS (que passa a gravar `orcamentoId`), e registrar serviço exige orçamento aprovado. O seed já não criava OS aprovada sem orçamento; o teste do seed confere que chamado e OS caem na mesma situação.
- **Z0.4 Papéis certos:**
  - "Envie o orçamento" só vai ao técnico quando a contratada não tem responsável cadastrado; com responsável, o técnico recebe "Sua empresa manda o orçamento...". A recusa também só avisa o técnico nesse caso.
  - `criarOS` recusa técnico de outra contratada (como `atribuirTecnicoOS`).
  - A Nova OS lista só técnicos da contratada do contrato, com técnico opcional. Saíram os campos "Equipamento" e "Diagnóstico Técnico", que não eram enviados. A Fase 2 não tinha resolvido isso.
  - O detalhe da OS mostra o técnico por nome, como a lista, e avisa quando ele é de outra contratada.
- **Z0.5 Login:** etapa própria para "Criar ou trocar a senha", com confirmação antes de enviar. "Conferindo seu cadastro..." e "Cancelar" depois de 5 s. O erro de perfil diz que a senha está certa e que a falha é do sistema, com o contato de `comercial.config.ts` (vazio hoje, então só pede para tentar em alguns minutos). E "Use só se o gestor cadastrou seu e-mail do Google".
- **Z0.6 Textos:**
  - "OS OS-..." saiu das functions (`rotuloOS`) e é limpo na tela nos avisos já gravados.
  - Histórico de ações com detalhes em português, datas em dd/mm/aaaa, selo "Automático" e ícone no lugar do "MP".
  - Plurais "(s)" trocados no front e nas functions.
  - "livre X kg" no saldo insuficiente.
  - Validação da importação em linguagem de planilha.
  - O menu da prestadora mostra a empresa dela e o cliente atendido.
  - `aditivos.ts` e `chamados.ts` já estavam no vocabulário novo.
- **Z0.7 Layout e botões:**
  - Contratadas com tabela rolando de lado.
  - Novo chamado com grade `minmax(0, 1fr)`, erro que quebra a linha e foco sem rolar a moldura.
  - "Novo chamado" e "Adicionar chamado" só para a gestão, e `criarChamado` recusa contratada e técnico (o QR continua aberto a todos).
  - "Ver contrato" só para gestão e contratada, e só com o contrato carregado.
  - Cartão da apresentação com texto curto no celular.
  - `/lab/skeuomorfismo` com Usado, Separado e Livre e "Patrimônio nº".
- **Testes novos:** `functions/test/historico.test.mjs` (fluxo inteiro e leitura pelas rules como cada perfil), `functions/test/fase0.test.mjs` (Z0.3, Z0.4, Z0.6, Z0.7) e `functions/test/textos.test.mjs` (puro). `seed.test.mjs` ganhou a conferência de situação.
- **Índices:** nenhum novo; a consulta com `in` usa `alvoPaiId + data` e `alvoId + data`, que já estão em `firestore.indexes.json`. Conferir se foram publicados antes de liberar a linha do tempo em produção.
