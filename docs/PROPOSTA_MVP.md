# Proposta de MVP — Gestão de Ativos, Chamados e Contratos

## Resumo do que foi entendido

A partir dos PDFs de escopo e orçamento, o projeto é uma **plataforma de gestão de manutenção** que conecta três pilares:

1. **Ativos** — equipamentos, instalações e locais que precisam de manutenção.
2. **Chamados** — solicitações de serviço abertas pelos solicitantes ou técnicos.
3. **Contratos** — acordos com fornecedores, com itens contratados e saldo disponível.

O coração do primeiro módulo é o **laço OS ↔ Saldo de Contrato**: toda Ordem de Serviço (OS) consome itens de um contrato, e o saldo é calculado automaticamente a partir das OS aprovadas — nunca digitado à mão.

---

## MVP sugerido para apresentação ao cliente

Foco no **Módulo 1 — escopo fechado**, que entrega valor operacional rápido:

### Funcionalidades incluídas no MVP

| Módulo | O que entrega |
|--------|---------------|
| **Login e papéis** | Autenticação simples com três perfis: quem abre chamado, técnico e gestor do contrato que aprova. |
| **Cadastro de contratos** | Fornecedores, contratos com vigência e itens com quantidade contratada. |
| **Ativo simples** | CRUD enxuto: nome, número de série, descrição e local em texto. Guarda identificador para migração futura. |
| **Chamado como entrada da OS** | O chamado vira porta de entrada da OS. |
| **Importação de planilha** | Carga inicial de contratos/itens via planilha. |
| **OS com trava de saldo** | Item zerado não pode ser selecionado; validação transacional no servidor. Reserva de saldo na geração da OS. |
| **Aprovação do gestor** | Fila de aprovação: aprovar, alterar quantidades ou rejeitar (devolve saldo reservado). |
| **Painel de saldo e filas** | Quanto resta de cada item, o que está reservado e o que já foi consumido. Alerta de item crítico. |
| **Publicação e piloto** | Sistema no ar para o time de manutenção usar. |

### O que fica fora do MVP (módulos 2 e 3)

- Automação de status do ativo.
- Cadastro completo de ativos (unidades, departamentos, colaboradores, posse, histórico).
- Vistoria como etapa separada (o diagnóstico fica dentro da própria OS).
- Integração com API do Protheus/TOTVS.
- Dashboard analítico completo.
- Funcionamento offline.
- Permissões por unidade.
- Aplicativo mobile nativo.

---

## Referências de prazo e investimento (dos orçamentos lidos)

| Cenário | Esforço | Prazo | Investimento |
|---------|---------|-------|--------------|
| Módulo 1 escopo fechado | 644 h | 10 semanas | R$ 35.420 |
| MVP completo — solo + IA | 940 h | ~33 semanas (30 h/semana) | R$ 135.096 |
| MVP completo — dupla | 640 h | 13 semanas | R$ 45.338 |
| MVP completo — equipe 5 pessoas | 1.604 h | 21 semanas | R$ 197.915 |

> Valores são referências dos documentos. A proposta firme depende de discovery de 1–2 semanas para fechar pontos em aberto.

---

## Estrutura do projeto criado

```
projeto-gestao-manutencao/
├── backend/          # Node.js + Express + TypeScript
│   ├── src/
│   │   ├── app.ts
│   │   ├── index.ts
│   │   └── routes/
│   ├── package.json
│   └── tsconfig.json
├── frontend/         # Angular 19 + Angular Material
│   ├── src/app/
│   │   ├── login/
│   │   ├── layout/
│   │   ├── dashboard/
│   │   ├── contratos/
│   │   ├── ordens-servico/
│   │   ├── nova-os/
│   │   └── painel-saldo/
│   ├── angular.json
│   └── package.json
└── PROPOSTA_MVP.md
```

### Telas criadas para demonstração

1. **Login** — tela de entrada da aplicação.
2. **Dashboard** — indicadores de OS abertas, pendentes, itens críticos e ativos em manutenção.
3. **Contratos** — lista de contratos vigentes com saldo e status.
4. **Ordens de Serviço** — lista de OS com filtros por status.
5. **Nova OS** — formulário de criação de OS com seleção de itens do contrato e trava de saldo.
6. **Painel de Saldo** — visualização do saldo por item de contrato, com barra de utilização e alertas.

---

## Como rodar

### Backend

```bash
cd backend
npm install
npm run dev
```

### Frontend

```bash
cd frontend
npm install
npm run start
```

---

## Próximos passos sugeridos

1. Validar com o cliente a proposta de MVP e o corte de escopo.
2. Responder as decisões em aberto:
   - A OS nasce de um chamado ou o técnico cria direto?
   - Onde o saldo do contrato é controlado hoje? (planilha, Protheus, papel)
   - Quem aprova a OS? O valor muda quem aprova?
   - A OS precisa apontar para um ativo cadastrado ou descrição em texto basta?
   - Quantos contratos vigentes e itens em cada?
3. Refinar os dados mockados das telas para cenários reais do cliente.
4. Iniciar o discovery detalhado para fechar orçamento e cronograma firmes.
