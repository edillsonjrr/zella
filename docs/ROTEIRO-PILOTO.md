# Roteiro do teste guiado — Zella

Sessão de 60 a 90 minutos com o cliente, seguindo a ordem do fluxo. Cada bloco diz quem faz, o que clicar e o que conferir. Use uma empresa nova, criada para o piloto, nunca a `demo`.

Perfis envolvidos: **Gestor** (cliente dono dos contratos), **Cliente** (quem abre chamado numa unidade), **Gestor contratado** e **Técnico** (empresa prestadora). Se o cliente não tiver todas as pessoas na sala, o gestor pode fazer os papéis da contratada com um segundo navegador.

## 0. Preparação (antes da sessão, 20 min)

- [ ] Empresa criada em **Admin → Empresas** com o e-mail real do gestor.
- [ ] Gestor entrou (Google ou "Definir ou recuperar senha") e confirmou que recebe e-mail do Firebase.
- [ ] Gestor cadastrou: 1 unidade com 1 bloco, 1 sala e 1 equipamento; 1 empresa contratada; 1 cliente (ligado à unidade), 1 gestor contratado e 1 técnico (ligados à contratada).
- [ ] Contrato importado por CSV (**Contratos → Importar**) com o nome da contratada igual ao cadastro, 2 a 3 itens com preço.
- [ ] QR Code do equipamento impresso (**QR Codes**).
- [ ] Conferido em **Contratos** que o saldo disponível = contratado em todos os itens.

## 1. Abrir chamado (Cliente, 5 min)

1. Entrar como cliente. Ver que só aparecem a própria unidade e as telas Início e OS.
2. **Novo chamado**: equipamento, descrição, foto opcional. Salvar.
3. Conferir: o chamado aparece em "Aberto" com prazo (SLA) de 5 dias; o gestor recebeu notificação no sino.

**Variante QR Code (2 min):** escanear o QR do equipamento com o celular, sem login, preencher nome e descrição, enviar. Conferir que o chamado nasce na unidade certa, com o equipamento preenchido.

## 2. Abrir OS (Gestor, 5 min)

1. Entrar como gestor. Abrir o chamado pelo painel, **Converter em OS**.
2. Escolher o contrato e, se quiser, o técnico. Salvar.
3. Conferir: chamado passa a "Em atendimento"; a OS aparece em **OS** como "Aberta"; o gestor contratado (e o técnico, se designado) recebem notificação.
4. Mostrar o **histórico** no painel do chamado e da OS.

## 3. Orçar (Técnico ou Gestor contratado, 5 min)

1. Entrar como técnico. Abrir a OS. Se estiver designada a outro técnico, mostrar que o botão não aparece.
2. **Criar orçamento**: marcar itens e quantidades. O preço é o do contrato e não se edita.
3. Tentar quantidade acima do saldo: o sistema recusa.
4. Salvar. Conferir: OS "Em vistoria", chamado "Em orçamento", gestor notificado.

## 4. Aprovar com ajuste (Gestor, 5 min)

1. Abrir a OS, **Aprovar orçamento**.
2. Reduzir a quantidade de um item e informar o motivo. Aprovar.
3. Conferir em **Contratos** e **Saldo**: o disponível caiu e o reservado subiu exatamente pelo aprovado, não pelo orçado.
4. Mostrar que o orçamento guarda o original e o ajuste no painel da OS e no histórico.

**Variante rejeitar (2 min):** rejeitar um orçamento e mostrar que a contratada consegue enviar um novo ("Novo orçamento").

## 5. Executar parcialmente (Técnico, 5 min)

1. Entrar como técnico designado. Abrir a OS, **Executar OS**.
2. Informar quantidade executada menor que a aprovada em um item, com observação.
3. Conferir em **Saldo**: consumido subiu pelo executado, reservado zerou, e a diferença voltou ao disponível.
4. Chamado passa a "Executado"; gestor notificado.

## 6. Encerrar (Gestor, 2 min)

1. Abrir o chamado, **Encerrar chamado**. Só aparece depois de executado.
2. Conferir: chamado "Encerrado", OS "Encerrada", histórico completo.

## 7. Cancelamento devolve saldo (Gestor, 5 min)

1. Repetir 1 a 4 com outro chamado (pode ser rápido), até ter uma OS aprovada.
2. **Cancelar chamado** com motivo.
3. Conferir em **Saldo**: o reservado voltou ao disponível. Nada ficou preso.

## 8. Contrato: aditivo e encerramento (Gestor, 5 min)

1. No painel do contrato, **Registrar aditivo**: estender a vigência e aumentar a quantidade de um item. Conferir que o disponível acompanhou.
2. Tentar reduzir um item abaixo do já reservado/consumido: o sistema recusa e diz o mínimo.
3. Mostrar a lista de OS do contrato e o histórico com o aditivo.
4. Opcional: **Encerrar contrato** em um contrato de teste. Se houver OS aprovada, o sistema bloqueia e lista quais.

## 9. Preventiva (Gestor, 5 min)

1. **Preventiva → Novo plano** para o equipamento, periodicidade curta e antecedência que faça vencer hoje.
2. **Gerar agora**. Conferir que o chamado preventivo nasceu com prazo e origem "preventiva", e que a faixa de monitor mostra a execução.

## 10. Visão gerencial (Gestor, 3 min)

- **Gerencial**: chamados por status, atrasados, contratos em atenção.
- **Saldo**: por item, com alerta de crítico.
- **Logs**: quem fez o quê, com filtro por tipo.

## O que anotar durante a sessão

| Momento | Dúvida ou pedido do cliente | Decisão / próximo passo |
|---|---|---|
| | | |

## Perguntas para levar

- Quem, na prática, vai aprovar orçamentos? Uma pessoa ou mais?
- O prazo padrão de 5 dias por chamado está bom? Muda por tipo de chamado?
- A medição para o Protheus é feita por quem e com que frequência? (Ver "Integração com o Protheus" em PONTAS-SOLTAS.md.)
- Precisam de e-mail além do aviso no sino?
