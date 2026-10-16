# Zella visto por um usuário leigo (agente anônimo, 13/10/2026)

Ambiente: Zella local (http://localhost:4200) ligado aos emuladores com o seed de demonstração (Carla gestora, Diego da prestadora, Eduardo técnico, Ana solicitante). Navegador embutido em 534x602, ou seja, a versão estreita do site.

## Rodada 1: apresentação e login

O agente não conseguiu passar do login. A senha era aceita, mas depois de uns 40 segundos aparecia "Não foi possível carregar seu perfil". A causa estava no ambiente de teste: a máquina estava sem memória (0,2 GB livres, CPU em 100%) e o emulador não conseguia iniciar a function `carregarPerfil` dentro de 30 segundos. Mesmo assim, a falha mostrou problemas reais de texto e de fluxo na tela de entrada.

### Página de apresentação (/)

A promessa ficou clara ("Do chamado à execução, sem estourar o contrato"), mas o vocabulário é de quem fiscaliza contrato, não de quem pede conserto.

- **Jargão sem tradução:** OS, CH, saldo reservado e consumido, trava de saldo, aprovação com ajuste, execução parcial, aditivo, vigência, histórico auditável, CSV, validação linha a linha, notificações por perfil, unidade, preventiva e corretiva, designar, evidência, sino.
- **"Cliente" com dois sentidos:** quem pede o conserto e a empresa ou escola. Sugestão: chamar quem pede de "Solicitante".
- **Barra de saldo:** "Reservado / Consumido / Disponível" aparece antes de qualquer explicação. Sugestão de legenda: "Reservado = aprovado, esperando o serviço. Consumido = serviço feito. Disponível = o que ainda pode ser usado."
- **Cartão de exemplo:** "CH-0142" e um "2" solto, sem legenda. Na largura estreita o texto corta ("CH-/0142", "Ar-co...").
- **Números grandes:** "3 fotos de evidência por execução" não diz se é mínimo, máximo ou obrigatório. "0 números de saldo digitados à mão" parece erro.
- **Frases ambíguas:**
  - "Já nasce com prazo" não diz quem define o prazo.
  - "todo dia às 6h" foi lido como "abre um chamado todo dia".
  - "Encerrar contrato bloqueia se houver reserva pendente" é técnica demais.
- **Movimento:**
  - O título muda sozinho.
  - A faixa de recursos corre e parece clicável.
  - O botão de pausar animações (dois tracinhos, depois um triângulo) parece controle de vídeo.
- **Celular:** o menu de três tracinhos abre por cima do título, sem fundo. O botão de tema claro e escuro some.

### Entrar (/login)

- **Gravidade alta:** "Não foi possível carregar seu perfil. Tente de novo." não diz que a senha está certa, de quem é a falha nem quem procurar.
- **Gravidade alta:** são uns 40 segundos de "Entrando..." sem nenhum sinal de progresso.
- **Gravidade alta:** "Primeiro acesso ou esqueceu a senha?" envia o link na hora para o e-mail digitado, sem confirmar. A explicação só existe para leitor de tela.
- Durante o envio do link, o botão diz "Entrando...", e o erro diz "Não foi possível entrar". O certo seria "Enviando link..." e "Não foi possível enviar o link".
- "Entrar com Google" não diz qual conta serve.
- O subtítulo "Gestão de ativos..." leva a ler "ativos" como dinheiro.
- Falta o "olhinho" para mostrar a senha.
- Os cartões animados ao fundo são lidos 4 vezes pelo leitor de tela antes do nome do sistema.

### As explicações que mais faltaram

1. O erro de perfil deve dizer que a senha está certa, que a falha é do sistema, e dar um contato.
2. A espera longa no login deve mostrar "Conferindo seu cadastro..." e oferecer uma saída.
3. O link de senha precisa de uma etapa própria com confirmação ("Enviar link para ana@senai.br?").
4. Os rótulos do envio do link devem ser "Enviando link..." e "Não foi possível enviar o link".
5. "Cliente" deve virar "Solicitante".
6. A barra de saldo precisa de legenda de uma linha.
7. OS, aditivo, vigência, CSV e unidade devem ser traduzidos na primeira menção.
8. O "2" do cartão e o "3 fotos por execução" precisam de legenda.
9. "Entrar com Google" deve dizer que só serve o e-mail cadastrado pelo gestor.
10. Os botões de pausa e de tema precisam de rótulo, e a faixa de recursos deve ficar parada.

**Impressão geral:** parece feito para quem administra contratos terceirizados com itens e quantidades, típico de órgão público ou rede de escolas. A promessa agrada ao gestor. O medo é que solicitante e técnico não entendam "reserva pendente" e "execução parcial".

## Rodada 2: telas internas com os quatro perfis

Com o emulador reiniciado (`FUNCTIONS_DISCOVERY_TIMEOUT=120`), o agente percorreu o fluxo inteiro: Ana abriu o chamado, Carla converteu em OS, Diego orçou, Carla aprovou, Eduardo executou e Carla encerrou. Ficaram no emulador local, que perde os dados ao reiniciar:
- o plano preventivo "Teste anônimo - limpeza de filtro";
- os chamados CH-2026-0103 e CH-2026-0104;
- a OS-2026-0096.

### As 10 explicações que mais fazem falta

1. **Detalhe da OS (técnico):** a OS não mostra o que a funcionária escreveu (defeito, sala, quem pediu). Incluir um bloco "Pedido original" com descrição, local, solicitante e foto.
2. **Contratos e Painel de Saldo:** Contratado, Reservado, Consumido e Disponível não fecham (1000 - 0 - 50 aparece como 750). "Unidades disponíveis" soma un com kg. Mostrar a conta explícita e corrigir; sem isso o gestor não confia no sistema. Conferido depois: pelo menos parte do erro vem do seed (`functions/src/seed.ts`). Ele cria itens com quantidades que não somam, como a Lâmpada LED 9W, com 1000 contratadas, 750 disponíveis, 50 reservadas e 0 consumidas. Corrigir o seed antes de qualquer demonstração.
3. **Orçamento (prestadora):** só aceita itens do contrato. Um conserto fora da lista, como o de um ventilador, vira orçamento errado. Permitir item avulso ou avisar que o contrato não cobre aquele serviço.
4. **Situações do chamado e da OS:** são dois vocabulários que não batem, e o orçamento enviado aparece como "Em vistoria". Unificar e dizer quem age agora ("Aguardando sua aprovação").
5. **Funcionária sem retorno:** depois do pedido não chega aviso nenhum, e o pedido encerrado não diz o que foi feito.
6. **Histórico:** aparece "Nenhuma ação registrada" no chamado e na OS depois do fluxo inteiro.
7. **Encerrar chamado:** encerra sem mostrar OS, observação do técnico e custo, sem confirmação e sem mensagem de sucesso.
8. **Celular:** a lista corta o nome do equipamento ("CH-2026-0236 ...") e esconde a situação. Faltam cartões e um filtro "Minhas OS" para o técnico.
9. **Siglas e jargão:** SAM/TAG/GAM/SOB, OS, Ativo, Ata, Aditivo, p.p. e PAT, inclusive na plaqueta do QR, que fica exposta para todos.
10. **Equipamentos:** não há tela para cadastrá-los. O chamado aceita texto livre, e o plano preventivo e o QR só listam 2.

### Relato por tela

**Gestora (Carla)**
- **Início ("Dashboard"):**
  - O selo "CM" não tem explicação.
  - Há dois botões "Lista"; o segundo quer dizer "sem agrupar".
  - As siglas das unidades aparecem sem legenda.
  - A coluna OS usa outro vocabulário de situação.
  - Não fica clara a diferença entre "Orçamento aprovado" e "A ser finalizado", nem entre "Executado" e "Encerrado".
  - A coluna Prioridade aparece, mas nenhum formulário pede prioridade.
  - A ordem crescente põe o chamado mais novo no fim.
  - "Adicionar chamado" aparece até no grupo "Encerrado".
- **Painel do chamado:**
  - "Converter em OS" é jargão.
  - "Foto anexada, mas não enviada ao servidor" não diz o que fazer.
  - O histórico fica vazio.
  - Encerrar acontece às cegas.
- **Novo chamado:**
  - O equipamento é texto livre.
  - Falta campo de local e de urgência.
  - Há um espaço vazio no formulário.
  - O erro de validação quebra o layout.
  - "WEBP" não diz nada para leigo.
- **Cabeçalho e sino:**
  - O tema não tem rótulo.
  - Cada notificação reage de um jeito diferente.
  - Há erros de formato: "R$ 220.00", "OS OS-2026-0096", "dia(s)".
  - O prazo só aparece na notificação.
- **Ordens de Serviço:**
  - Há OS "Aprovada" e "Sem orçamento" ao mesmo tempo.
  - O técnico da lista some no detalhe.
  - A numeração do chamado e da OS diverge.
  - Na Nova OS, "Ata", "Ativo" e "Diagnóstico Técnico" são pedidos à gestora, e a lista de técnicos não é filtrada pela contratada.
- **Preventiva:**
  - "Gerar agora" não deixa claro que abre chamados.
  - Duas mensagens contraditórias aparecem juntas.
  - O custo anual não mostra a conta.
  - Editar e excluir ficam escondidos à direita.
  - "Quem paga" vem com texto técnico.
  - Em "48 un" não fica claro se é o saldo ou o total.
- **Contratos:**
  - "Unidades disponíveis" confunde com escola e soma unidades diferentes.
  - Os números do detalhe e do aditivo não fecham.
  - "Itens da ata", "Vigência", "Crítico" e "Encerrar contrato" não são explicados.
- **Painel de Saldo:**
  - As contas não fecham.
  - "Importar" leva para a importação de contratos.
- **Importar contratos:** o texto está em linguagem de programador (CSV com colunas `contrato;fornecedor;...`).
- **Painel gerencial:**
  - "Chamados abertos 45" quer dizer "criados no período".
  - O atraso é medido contra um prazo invisível.
  - "p.p." aparece sem explicação.
  - Os cards não são clicáveis.
  - A linha tracejada do gráfico não tem legenda.
  - O mapa usa siglas.
- **Cadastros:**
  - Em Unidades, o ícone de estrutura parece "compartilhar", e a mesma coisa tem dois nomes ("salas sem bloco" e "salas diretas").
  - Os perfis de usuário não são explicados.
  - O formulário de Contratadas estoura a tela.
  - Não existe tela de equipamentos.
- **QR Codes:**
  - A explicação da tela é boa.
  - A plaqueta mostra "PAT-0021" e a sigla da unidade.
  - Falta um link para testar sem celular.
- **Histórico de ações:** mostra campos crus (`proximaExecucao`, `periodicidadeDias`, datas em formato ISO), um selo "servidor" e um avatar "MP".

**Funcionária (Ana, perfil "Cliente")**
- Cai no painel de gestão. Para ela bastaria "Meus pedidos" com um botão grande.
- Vê chamados automáticos da preventiva, que pode achar que são dela.
- Precisa digitar equipamento e sala juntos.
- Pedem "Número de série", que ela não tem como saber.
- Não há urgência nem confirmação ao salvar.
- "Ver contrato" não faz nada.
- O sino nunca avisa.
- No celular o nome do pedido some.

**Prestadora (Diego, "Gestor contratado")**
- O perfil aparece como "Gestor_contratado", e a empresa como "Senai DF".
- Vê "Novo chamado" e chamados de outras unidades.
- Só pode orçar itens do contrato.
- "Salvar orçamento" não diz que envia, e depois a OS vira "Em vistoria".

**Técnico (Eduardo)**
- Recebe "Envie o orçamento", mas quem orça é a prestadora.
- A OS não traz o defeito descrito.
- "Executar tudo" é ambíguo.
- Não há mensagem de sucesso.
- No celular a situação fica escondida e falta um filtro "Minhas OS".

### O que funciona bem

- O fluxo anda de ponta a ponta.
- As notificações da gestora e da prestadora dizem o próximo passo.
- As janelas de aprovar e de executar explicam o efeito no contrato.
- A tela de QR Codes explica para que serve.
- O plano preventivo é fácil de criar.

### Impressão geral

Parece feito para o gestor de contratos de manutenção de órgão público ou rede de escolas que contrata por ata. Funcionária e técnico parecem encaixados depois: veem as telas do gestor com menos coisas.

O agente usaria o sistema como gestor depois de três correções:
1. Os números de saldo precisam bater.
2. A OS precisa levar a descrição do problema até o técnico.
3. A funcionária precisa saber o que aconteceu com o pedido dela.

O que o faria desistir:
- contas de saldo que não fecham numa auditoria;
- orçamentos aprovados com o item errado;
- funcionários reclamando que pediram e nunca souberam o que aconteceu;
- técnicos que não enxergam as próprias OS no celular.

Este arquivo resume o inventário de elementos (oito tabelas, uma por área) e o plano de melhoria que o agente entregou.
