# Correções de 15/10/2026 (relatório de UX e estética)

Base: `Codex/relatorio-ux-estetica-2026-10-15.md` (seção Zella) e as notas `zella-estetica.md`.
Guia aplicado: `Codex/its-ui/GUIA-TIPOGRAFIA-ESPACAMENTO.md`. Nada foi publicado nem commitado.

## 0. Demonstração sem login e sem Firebase
- A demo já estava montada (configuração `demo`, `src/app/demo/`, serviços `*.demo.ts`). Conferida de ponta a ponta: abre sem login em `/login`, entra por perfil (Carla gestora, Ana solicitante, Diego gestor da contratada, Eduardo técnico) ou direto por `/login?como=carla`, e troca de perfil pela faixa do topo.
- **Dados coerentes:**
  - o histórico do seed (`functions/src/seedDados.ts`) deixava chamados de abril a agosto parados, e 26 apareciam atrasados. Agora os meses antigos estão fechados, alguns cancelados antes de virar OS, e só dois seguem atrasados de propósito (CH-2026-0228 e CH-2026-0234). O teste de coerência do seed passa (8 de 8);
  - na demo, os chamados em andamento do último mês do histórico passam a ter sido abertos nos últimos dias (`demo/semente.ts`), para não envelhecerem;
  - a descrição "Chamado do histórico de demonstração" virou um texto de pedido de verdade;
  - versão do banco local subiu para 2: quem tinha a demo aberta recomeça com os dados novos.
- Faixa da demo no celular: uma linha só ("Demonstração", "O que tentar", "Trocar de perfil", "Voltar aos dados de exemplo"), com os nomes no `aria-label`.

## 1. Guia de tipografia e espaçamento
- `src/styles/_its.scss` copiado sem edição e importado no `styles.scss`; `includePaths: ["src/styles"]` no `angular.json`.
- `--font-sans` aponta para `--its-fonte` (Inter). Manrope só no logo.
- Escala: h1 24/22 px em 700, h2 18/17, h3 15; margem lateral 32/24/16 px; 24 px do cabeçalho ao conteúdo.
- Cabeçalho de página com título + subtítulo de uma linha (`.page-header-textos`) em Chamados, OS, Painel gerencial, Contratos, Unidades, Equipamentos, Usuários, Preventiva e Novo chamado.
- Cabeçalho de tabela em 12 px peso 600, sem caixa alta; células de 14 px; linhas de 44 px.
- Botões com 40 px (44 no celular) e peso 600 (o 550 saiu).
- Fontes de 9 a 10 px subiram para 12 px. As que continuam pequenas são miniaturas de peças impressas (plaqueta, etiqueta, via da OS) e o fundo decorativo, marcadas com `its-ok` e o motivo.

## 2. Top 5
1. **Chamados em cartões no celular:** abaixo de 768 px cada chamado vira um cartão (nome em até duas linhas, unidade, prazo e uma linha com situação e urgência). A barra de filtros deixou de ter um controle por linha.
2. **Pílulas numa linha e uma tabela de cores:**
   - a pílula usa um texto curto novo (`selo` em `shared/situacao.ts`: "Novo", "Aguardando aprovação", "Aprovado", "Serviço feito"…); o rótulo longo ficou no título do grupo e o "Agora: ..." na dica;
   - altura de 24 px, `nowrap`;
   - "Aprovado" é verde em todas as telas, inclusive em "Meus pedidos" (era âmbar); "Encerrado" é cinza;
   - "Não informada" deixou de ser pílula.
3. **Tabelas que cabem:**
   - OS: sem a coluna do olho, contrato em duas linhas, orçamento curto ("A aprovar") e data só a partir de 1440 px. A tabela termina dentro do cartão (1317 ≤ 1334 px);
   - Equipamentos, Unidades, Usuários, Preventiva e Empresas contratadas: lápis à vista e "⋯" com a lixeira, vermelha, por último;
   - no celular, as tabelas viram lista de cartões (`.app-table--lista` + `data-rotulo`).
4. **Um cabeçalho só:**
   - no computador a barra de topo de 60 px saiu: o sino foi para o topo do menu lateral e o tema para junto da conta. O título subiu de cerca de 148 px para 77 px do topo (com a faixa da demo);
   - a lua ilustrada virou um botão de ícone ("Usar tema claro/escuro");
   - "Criar" virou "Nova OS" e "Novo contrato";
   - saíram os "+ Adicionar chamado…", "Criar nova ordem de serviço…", "Cadastrar novo contrato…" e "Adicionar plano preventivo…" de dentro das listas e quadros.
5. **Tema claro no celular:** sem escolha salva, o celular abre no claro e o computador no escuro (`index.html` e `ThemeToggleComponent`). Só a escolha da pessoa fica gravada.

## 3. Demais itens do relatório
- **Menu e página iguais:**
  - "Início" virou "Chamados";
  - "Saldo" virou "Saldo dos contratos";
  - "Contratadas" virou "Empresas contratadas";
  - "Preventiva" virou "Manutenção preventiva";
  - "Histórico de ações" virou "Histórico de alterações";
  - "Painel Gerencial" virou "Painel gerencial";
  - textos que citavam "Início" foram trocados;
  - a barra de baixo usa nomes curtos ("Ordens", "Preventiva").
- **Prazos:** só o atrasado fica vermelho; na demo, 2 de 46.
- **Orçamento cortado:** resolvido (ver Top 5, item 3).
- **Equipamentos rolando para o lado:** a grade usa `minmax(0, 1fr)`, e o cabeçalho de página quebra linha no celular. Nenhuma das 28 capturas rola para o lado.
- **Barra de baixo:** some quando há um destino só (solicitante) e usa 12 px em Inter.
- **Técnico:** além do cartão "Registrar serviço feito", a tela mostra "A caminho" (OS esperando orçamento ou aprovação) e "Feitas por você".
- **Painel gerencial:**
  - "180 dias" não quebra;
  - o selo "PG" saiu;
  - as barras e a linha usam o teal da marca.
- **Preventiva:** rótulo em cima e número embaixo, como no Painel gerencial.
- **Saldo:** abre com o primeiro contrato escolhido (antes era um cartão enorme com uma frase).
- **QR Codes:** os botões das linhas viraram secundários.
- **Compras:** o selo do topo não fica mais sob a barra (o foco do `<main>` usa `preventScroll`).
- **Novo chamado (solicitante):**
  - sem título duplicado;
  - largura de 720 px;
  - sem cartão dentro de cartão no celular.
- **Página inicial:** os contadores já vêm com o número final no HTML ("6 etapas com dono", "4 perfis", "3 fotos"); a contagem animada é só enfeite.
- **Tela de entrada:**
  - o fundo decorativo tem `aria-hidden` e `inert`;
  - os emojis de aviso viraram ícones;
  - "Não foi possível entrar com o Google" agora diz o motivo (janela fechada, pop-up bloqueado, sem internet, endereço não liberado, conta desativada, muitas tentativas).
- **Acentos:** "Não foi possível", "Prorrogação de vigência" no importador de contratos.
- **Ícone grudado no nome das abas** Lista/Quadro da OS: corrigido.
- **"Sem técnico":** mostra um ícone, não a letra "S".
- **Ajuda do campo Patrimônio:** fica separada do campo seguinte.

## Como foi verificado
- `node its-ui/scripts/verifica-estilo.mjs src`:
  - antes: 35 erros e 71 avisos;
  - depois: 0 erros e 23 avisos, todos de 11 px em sobretítulo de CAIXA ALTA (permitido pelo guia) ou do laboratório de peças.
- `verifica-pt.mjs src/app`:
  - antes: 5 erros e 2 avisos;
  - depois: 0 erros e 2 avisos (nomes próprios: "Escola Estadual Centro" e "Senai Santa Maria");
  - `../shared` está com 0.
- `ng build --configuration demo` sem erro; `tsc --noEmit` das functions sem erro; teste de coerência do seed (`seed.test.mjs`, rodado com tsx) com 8 de 8.
- Capturas pela demo (build servido na porta 4320, Chrome headless na 9372): 28 telas, de computador (1366 × 768) e de celular (390 × 844). `scrollWidth <= innerWidth`, medido também no contêiner `main.content`: 0 estouros.
- Conferido no DOM:
  - nenhuma pílula com mais de uma linha (0 de 46 em Chamados, 0 em OS);
  - barra de topo oculta no computador;
  - troca de perfil pela faixa (Carla → Eduardo abre "Ordens de serviço").

## Capturas
- Antes:
  - pelo emulador: `scratchpad/estetica/zella/`;
  - pela demo: `scratchpad/estetica/zella-demo-antes/`.
- Depois: `scratchpad/estetica/zella-depois/` (com `medidas.json`).
- Roteiro: `scratchpad/fotos-zella-demo.mjs`.

## Pendente
- **Teste por dentro com o agente anônimo:** pode ser feito agora pela demo (`/login?como=carla|ana|diego|eduardo`), sem login de teste.
- **"Chamados criados no período: 833% a mais":** é efeito do histórico do seed, que começa em abril (não há chamados antes para comparar). Não mexi na fórmula.
- **Telas de detalhe e diálogos** (contrato, orçamento, unidade, bloco, sala): ainda têm a lixeira ao lado de cada linha de formulário. É remoção de linha dentro do formulário, não ação de tabela.
- **Avisos de 11 px em caixa alta (sobretítulos):** ficaram como estão, porque o guia permite.

## Rodada 2 (15/10/2026, à tarde)

Base: `Codex/its-ui/RODADA-2.md` e a seção Zella de `Codex/relatorio-anonimo-pos-correcao-2026-10-15.md`. Nada foi publicado nem commitado. A rodada começou num agente e terminou em outro: as edições que tinham ficado pela metade (cartão de OS com o número do chamado) foram concluídas e conferidas.

### Itens do teste com o anônimo
- **Números do Painel gerencial que não batiam:**
  - a rosca "Chamados por situação" agora conta os cancelados: Total 44, igual a "Chamados criados nos últimos 180 dias" (44), e a fatia "Encerrado" (59%) é a taxa de conclusão (59%);
  - a lista de chamados diz quantos mostra e por quê: "Mostrando 46 de 50 chamados. Os 4 cancelados ficam fora dos grupos";
  - variação em número e com o valor de antes, em vez de porcentagem solta: "▲ 38 a mais · eram 6 nos 180 dias anteriores", "41 pontos a menos · eram 100%". Some o "▲633%" / "833%" (o histórico do seed começa em abril; a fórmula não foi mexida, só a forma de mostrar);
  - porcentagem dos gráficos no padrão brasileiro e inteira ("7.5%" saiu).
- **Filtro "Atrasados (2)"** na lista de chamados.
- **Técnico vê primeiro o prazo que vence antes** (atrasado no topo); "A caminho" virou **"Ainda não liberadas para você"**, com o "(atrasado)" no prazo.
- **Um nome por situação em todos os perfis:** a solicitante vê "Novo", "Aguardando orçamento", "Aguardando aprovação", "Aprovado", "Encerrado" (antes "Recebido", "Com a empresa contratada", "Orçamento em análise", "Concluído"). Glossário atualizado.
- **"Responsável" virou "Com quem está":** mostra quem precisa agir agora (gestão, empresa contratada ou técnico).
- **Saldo também em reais:** Contratado, Usado, Separado e Livre em R$ acima da tabela, o preço de cada item e o livre em R$.
- **Numeração CH × OS:** chamados e OS são numerados em ordem de abertura, cada um na sua sequência (o pedido novo recebe o número seguinte ao último). O chamado diz "virou a OS-…" e o cartão da OS diz "do chamado CH-…". As dicas da demo e os avisos tiram o número dos dados.
- **Dados de exemplo:** cada equipamento do histórico vai para o contrato que cobre o conserto (ar-condicionado na Ar Condicionado Ltda, luz na Elétrica Sul, água na Hidráulica Norte); urgência preenchida. Para a conta do saldo fechar, o "Filtro de ar" do CTR-2026-001 passou de 30 para 60 unidades contratadas. Banco local da demo na versão 3 (quem tinha a demo aberta recomeça).
- **"Orçamento: Não enviada"** → "Não enviado"; **"Top equipamentos"** → "Equipamentos com mais chamados".
- **Visual:**
  - painéis de menu (avisos, troca de perfil, filtro) com fundo cheio, borda e sombra; itens de duas linhas crescem com o texto (0 itens sobrepostos medidos nos três, nos dois temas e no celular);
  - a janela "Pedir um conserto" não rola mais o título para fora (`overflow: clip` na superfície): medido com o formulário rolado até o fim, o título continua visível;
  - ícones do topo no celular com nome: "Dicas", "Trocar perfil", "Recomeçar", "Tema", "Avisos", "Conta".
- **"Outro (descrever)":** o que a pessoa digitou na busca vai para o campo livre (testado: "Ventilador de teto" continua lá).

### Sobras da rodada 1
- "833%": resolvido (ver acima).
- Sobretítulos de 11 px subiram para 12 px fora do laboratório de peças.
- Lixeira por linha nos formulários de detalhe (contrato, orçamento, unidade, bloco, sala): **ficou**. É remover uma linha do formulário, não ação de tabela.

### Problemas comuns aos quatro
- **Contraste AA:** auditoria no DOM (cor do texto com opacidade sobre o fundo real) em 17 telas × 2 temas (34), no computador e no celular.
  - Antes (só computador): 49 textos abaixo de AA e 1 abaixo de 12 px (a dica da foto, 11,7 px), quase todos pílulas e prazos no tema claro (âmbar 2,1:1, verde 2,8:1, vermelho 2,7:1, azul 4,0:1), "Urgente" no escuro (4,1:1), iniciais dos avatares (1,8:1), o botão "Pedir um conserto" no escuro (2,1:1) e o valor de campo travado (2,2:1);
  - ajustes: tons 500 das cores de aviso no tema claro (#11733a, #8f5000, #c0272b, #155fb5), vermelho do escuro #ff7a7c, `--primary-400` claro #17706f, `--text-tertiary` claro #56686e, iniciais e botão com a cor de contraste do tema, ID da empresa e campo travado em `--text-tertiary`. O teal de destaque (500) não mudou;
  - depois: **0 textos abaixo de AA e 0 abaixo de 12 px** nas 34 telas do computador e nas 34 do celular (`contraste-*.txt` na pasta das capturas).
- **Corpo:** 14 px no computador e 15 px no celular (`--its-t-corpo` no `body`), medido em todas as telas.
- **Troca de tela:** saiu o `withViewTransitions` (ele congelava a tela antiga por cima da nova até a nova carregar). Entrada da tela nova em 120 ms, telas pré-carregadas (`PreloadAllModules`), movimento reduzido respeitado. Medido no Chrome headless: a tela antiga sai e a nova entra no mesmo quadro, entre 75 e 125 ms depois do clique, e **nunca as duas juntas**. Totalmente opaca em 240 a 410 ms: o tempo extra é montar a tela (o fade dura 120 ms) num Chrome sem GPU com outros builds rodando.
- **Números animados:** o painel abre com o valor final; só a troca de período anima, em até 350 ms; o leitor de tela lê só o valor final. Na página inicial, a contagem caiu de 1,2 s para 400 ms, com o valor final para o leitor de tela.
- **Clique no menu depois de fechar uma janela:** fechando pelo X ou com Esc, não sobra backdrop nem janela, e o clique em "Ordens de serviço" navega (computador e celular). A causa era a mesma da troca lenta: o clique caía na foto da tela antiga da view transition.

### Como foi verificado
- `verifica-estilo.mjs src`: 0 erros, 4 avisos (todos do laboratório de peças `lab-skeuo`).
- `verifica-pt.mjs src/app`: 0 erros, 2 avisos (nomes próprios); `../shared`: 0.
- `ng build --configuration demo` com a trava: sem erro.
- `npm test` das functions com a trava (emulador): 83 de 83, incluindo os testes novos do seed (número na ordem de abertura, conserto no contrato certo).
- Capturas: build servido na porta 4321, Chrome headless na 9437.

### Capturas
`docs/capturas-2026-10-15-r2/`: computador (1366 × 768) nos dois temas e celular (390 × 844) no claro: chamados, atrasados, filtro, troca de perfil, avisos, detalhe do chamado, painel gerencial e rosca, saldo, Ana (pedidos, janela, janela rolada, "Outro"), Eduardo e Diego. Medições de contraste em `contraste-*.txt`.

### Pendente
- Itens que dependem da dona continuam sem dado: CNPJ, contato de LGPD, preço, WhatsApp da equipe, desconto e nome de plano.
- "▲ 38 a mais" no painel ainda reflete o histórico do seed, que começa em abril (só 6 chamados no período anterior). Mudar isso é decidir o histórico da demo, não a tela.
- Novo teste com o agente anônimo para confirmar os itens acima.

## Rodada 3 (15/10/2026, fim da tarde)

Base: `Codex/its-ui/RODADA-3.md` e a seção "Zella (repetição)" de `Codex/relatorio-anonimo-rodada-2-2026-10-15.md`. Nada foi publicado nem commitado. A rodada foi interrompida no meio e retomada; as edições pela metade foram conferidas no build e nas capturas.

### Decisão 1: a contratada só vê os chamados dos próprios contratos
Aplicada a opção mais segura, escolhida pela coordenação.
- **O app real também vazava.** A regra de `chamados` deixava todo perfil que não fosse solicitante ler todos os chamados da empresa (`perfil() != 'cliente'`), e a consulta da contratada não tinha filtro. Na demo, Diego via 47 de 51 chamados, inclusive os da Hidráulica Norte e da Ar Condicionado Ltda.
- **Correção:**
  - o chamado ganhou o campo `empresaContratadaId`, copiado por `criarOS` e apagado quando o chamado volta a "Aberto" (`reabrirChamado` e encerramento de contrato por aditivo);
  - `firestore.rules`: o gestor lê todos; a solicitante, os da unidade; o responsável da contratada e o técnico, só os que têm `empresaContratadaId` igual ao do token;
  - `data.service.ts`: a consulta da contratada filtra pelo mesmo campo (sem isso, a regra nega a consulta inteira);
  - demo (`data.service.demo.ts` e `demo/fluxo.ts`): o mesmo recorte; banco local na versão 4;
  - seed (`seedDados.ts`): os chamados com OS levam a contratada da OS.
- **Consequências, para manter a coerência:**
  - só o gestor cria OS (`criarOS`, rota `ordens-servico/nova`, botões "Nova OS" e "Enviar para a empresa contratada"). A página inicial já dizia "O gestor transforma o chamado em OS";
  - a contratada não cancela chamado de outra empresa (`cancelarChamado`);
  - só o gestor escolhe o responsável na gestão (`atribuirResponsavelChamado`).
- **Só vale no app real depois do deploy** das regras e das functions. **Antes do deploy, é preciso preencher `empresaContratadaId` nos chamados que já têm OS** (copiar da OS). Sem isso, a contratada deixa de ver os chamados antigos. Não escrevi script de migração, porque ele mexeria em dados de produção.
- Testes novos: regra (`rules.test.mjs`) e callables (`fase0.test.mjs`).
- Conferido na demo: Diego vê "Mostrando 16 de 16 chamados", todos da Elétrica Sul.

### Decisão 2: chamado para uma contratada sem o item no contrato
Não bloqueia, como decidido.
- Na Nova OS, ao escolher um contrato que não parece cobrir o conserto, aparece o aviso "O contrato … parece não cobrir este conserto", com os itens do contrato e a caixa "Enviar mesmo assim: confirmo que este contrato cobre o conserto". Sem a caixa marcada, "Enviar para a contratada" não envia e pede a confirmação.
- Não existe no cadastro um vínculo entre equipamento e item de contrato, então a conferência é uma estimativa (`shared/cobertura-contrato.ts`). O contrato "cobre" quando:
  - o equipamento já teve OS neste contrato;
  - uma palavra dele aparece nos itens ou no nome da empresa;
  - ou os dois caem na mesma família (ar-condicionado; iluminação e elétrica; hidráulica).

  Por isso o aviso diz "parece".
- Conferido:
  - ar-condicionado na Elétrica Sul: aviso;
  - ar-condicionado na Ar Condicionado Ltda: sem aviso;
  - luminária na Elétrica Sul: sem aviso.
- Dica da Carla: o pedido do ar-condicionado vai para a Ar Condicionado Ltda; o caminho com o técnico Eduardo usa o pedido da luminária, na Elétrica Sul.

### "Técnico envia orçamento"
- A regra não mudou: `criarOrcamento` aceita o técnico designado e o responsável da contratada. Na demo, o Eduardo abre a OS-2026-0035 e tem o botão "Criar orçamento" (conferido). A promessa era verdadeira, mas a tela do técnico dizia "Esperam o orçamento da sua empresa".
- Ajuste de texto:
  - "Ainda não liberadas para você" agora diz que o orçamento pode ser dele ("abra a OS e use 'Criar orçamento'");
  - na página inicial, "Envia orçamento da OS dele" e, na etapa Orçamento, "Responsável da contratada ou técnico designado".

### Demais itens
- **Botões citados pela dica:** um nome só por botão, igual no computador, no celular e nas dicas: "Trocar perfil" e "Recomeçar". "Toque em…" virou "Use o botão…" nas dicas, em "Meus pedidos", em "O que você faz aqui" e no aviso de encerramento (também nas functions).
- **"Trocar perfil" falhando no primeiro clique (?):** não se reproduziu. Depois de fechar as dicas com Esc, o menu abriu no primeiro clique, no computador e no celular.
- **Urgência e prazo:** o prazo por urgência não existe no código (o prazo é o da empresa, `slaDias`). Ajustei o texto: "Mostra à gestão o que atender primeiro. A urgência não muda o prazo do pedido."
- **Busca de equipamento:**
  - o exemplo sai do cadastro da unidade ("ar split, projetor, quadro…"). Antes sugeria "bebedouro", que não existe em Santa Maria;
  - a busca sem resultado diz isso e aponta o "Outro (descrever)";
  - "Ar Split 9000" só existe no texto de chamados do histórico, não no cadastro de equipamentos: não mexi nos dados.
- **Pedido repetido:** aviso com o número do pedido em andamento na mesma unidade (mesmo equipamento do cadastro ou mesmo nome) e a confirmação "É outro defeito: enviar mesmo assim". Não bloqueia.
- **Nomes que mudam:**
  - "Responsável da contratada" para o papel (Diego deixou de ser "gestor da empresa contratada");
  - as colunas da página inicial usam os nomes da lista (Novo, Aguardando orçamento, Aprovado, Serviço feito);
  - glossário atualizado.
- **Campos confusos:**
  - a solicitante não digita mais o nome ("Pedido em nome de Ana Souza (você)");
  - "Responsável (gestor): Nenhum" virou "Responsável na gestão (opcional)", com explicação;
  - o detalhe mostra o patrimônio do cadastro e só mostra "Número de série: Não informado" quando não há patrimônio;
  - "Utilização (usado + separado)".
- **Orçamento e encerramento:**
  - a caixa de aprovação avisa que dá para reduzir quantidades;
  - "Registrar serviço feito em parte" virou "Registrar serviço feito, com menos itens";
  - o motivo do ajuste aparece na linha do tempo;
  - a observação do técnico ganha ponto antes do texto do sistema;
  - "reator sem quantidade (?)": não conferido.
- **Exemplo atrasado:** os dois atrasados de propósito (CH-2026-0039 e CH-2026-0041 na demo) ficam com 12 e 9 dias de aberto, e não desde julho.
- **Textos:**
  - "técnicos de Elétrica Sul" virou "Só técnicos da contratada deste contrato (Elétrica Sul)";
  - "Itens do contrato";
  - o título "Nova ordem de serviço (OS)" aparece uma vez só na página;
  - quantidades com ponto de milhar ("1.000 un");
  - "Histórico que ninguém edita nem apaga" nos dois lugares;
  - a dica do Diego cita "Saldo dos contratos".
- **Leitor de tela:**
  - nome explícito nos botões de urgência, em "Pedir um conserto" e nos itens do menu (inclusive recolhido);
  - "contadores lidos em dobro": o contador animado já tem o valor só para o leitor de tela; não reproduzi.
- **Visual:**
  - o rótulo parado de "Onde fica" não tem mais a faixa escura (fundo transparente; ao subir, metade com o fundo do cartão e metade com o do campo);
  - "Importar" no Saldo virou "Importar contratos por planilha" e só aparece para o gestor, porque a rota é só dele.

### Como foi verificado
- `verifica-estilo.mjs src`: 0 erros, 4 avisos (laboratório de peças).
- `verifica-pt.mjs src/app`: 0 erros, 2 avisos (nomes próprios); `../shared`: 0.
- `tsc --noEmit` das functions sem erro; `ng build --configuration demo` com a trava, sem erro.
- `npm test` das functions com a trava (emulador): **85 de 85** (os 83 de antes e 2 novos).
- Capturas pela demo (build servido na 4322, Chrome headless na 9392), com as medições em `medidas-computador.txt` e `medidas-celular.txt`. Nenhuma rola para o lado.

### Capturas
`docs/capturas-2026-10-15-r3/`, computador (1366 × 768) e celular (390 × 844):
- página inicial;
- Diego;
- dica da Carla;
- aviso do contrato sem item e pedido de confirmação;
- Eduardo no detalhe da OS;
- busca sem resultado;
- pedido repetido;
- troca de perfil.

### Pendente
- **Deploy** de `firestore.rules` e das functions, com o preenchimento de `empresaContratadaId` nos chamados antigos antes.
  - Script de migração pronto e testado no emulador: `functions/scripts/migrar-empresa-contratada.js` (`--simular` / `--aplicar` / `--reverter`). Ordem do deploy e reversão em `docs/deploy-chamados-contratada.md`. **Publicado em 15/10/2026:** functions, migração (45 chamados), hosting do `sistema` e regras. Com a regra nova, a contratada lê só os chamados dela (conferido pela API de teste de regras).
- Itens da dona, sem dado: CNPJ, contato de LGPD, preço, WhatsApp da equipe, desconto e nome de plano.
- Novo teste com o agente anônimo.
