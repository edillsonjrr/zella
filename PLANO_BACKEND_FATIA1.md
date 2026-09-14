# Plano de Execução — Backend da Fatia 1

> Documento de planejamento técnico. Sem código executado neste momento.

## 1. Visão geral

Este plano cobre o backend necessário para as **6 entregas da Fatia 1** (R$ 8.000, 3 semanas). O objetivo é publicar o laço mínimo viável:

```
Contrato com saldo → Chamado → Ordem de Serviço → Reserva/Consumo de saldo
```

Tecnologia base já definida:
- **Runtime:** Node.js
- **Framework:** Express + TypeScript
- **Banco de dados:** PostgreSQL
- **ORM:** Prisma (recomendado) ou TypeORM
- **Upload de arquivos:** Multer
- **Validação:** Zod
- **Autenticação:** JWT simples

---

## 2. Modelagem de dados

### 2.1 Entidades principais

```
Usuario
├── id (UUID)
├── email (único)
├── nome
├── senha_hash
├── perfil (OPERADOR | ADMIN)
├── ativo
└── created_at

Contrato
├── id (UUID)
├── numero (string, único)
├── fornecedor
├── vigencia_inicio (date)
├── vigencia_fim (date)
├── status (ATIVO | VENCIDO | CRITICO)
├── created_at
└── updated_at

ItemContrato
├── id (UUID)
├── contrato_id (FK)
├── nome
├── quantidade_contratada (decimal)
├── quantidade_consumida (decimal, default 0)
├── quantidade_reservada (decimal, default 0)
└── created_at

Chamado
├── id (UUID)
├── numero (string, gerado sequencial)
├── equipamento (texto)
├── numero_serie (texto, opcional)
├── descricao
├── solicitante (texto ou FK para Usuario)
├── situacao (ABERTO | EM_ATENDIMENTO | CONVERTIDO)
├── foto_url (opcional)
├── created_at
└── updated_at

OrdemServico
├── id (UUID)
├── numero (string, gerado sequencial)
├── chamado_id (FK, opcional na modelagem mas obrigatório no fluxo da Fatia 1)
├── contrato_id (FK)
├── equipamento (texto, denormalizado do chamado)
├── tecnico_responsavel
├── diagnostico
├── status (ABERTA | CONSUMIDA | CANCELADA)
├── created_at
└── updated_at

OrdemServicoItem
├── id (UUID)
├── ordem_servico_id (FK)
├── item_contrato_id (FK)
├── quantidade (decimal)
├── created_at
└── updated_at
```

### 2.2 Regras de saldo (core do sistema)

Para cada `ItemContrato`:

```
disponivel = contratado - consumido - reservado
```

- `contratado`: valor vindo do cadastro/importação.
- `consumido`: soma das quantidades de itens em OS com status CONSUMIDA.
- `reservado`: soma das quantidades de itens em OS com status ABERTA.
- Item com `disponivel <= 0` não pode ser selecionado em nova OS.
- Ao cancelar uma OS ABERTA, a reserva deve ser devolvida.

---

## 3. Endpoints por entrega

### Entrega 01 — Acesso e base do sistema

| Método | Rota | Descrição |
|--------|------|-----------|
| POST | `/api/auth/login` | Autentica usuário e retorna JWT |
| GET | `/api/auth/me` | Retorna dados do usuário logado |
| POST | `/api/seed` | Cria usuários iniciais (operador/admin) |
| GET | `/health` | Health check já existe |

**Observação:** perfis iniciais `OPERADOR` e `ADMIN`. A separação completa de permissões (por tela/ação) fica para a Fatia 2.

---

### Entrega 02 — Contratos e saldo

| Método | Rota | Descrição |
|--------|------|-----------|
| POST | `/api/contratos` | Cria contrato com itens |
| GET | `/api/contratos` | Lista contratos com saldo agregado |
| GET | `/api/contratos/:id` | Detalhe do contrato + itens |
| PUT | `/api/contratos/:id` | Edita contrato e itens |
| DELETE | `/api/contratos/:id` | Remove contrato sem OS vinculada |
| GET | `/api/contratos/:id/itens` | Lista itens com saldo calculado |
| GET | `/api/saldo/itens` | Lista todos os itens com saldo (usado no Painel de Saldo) |

**Regras importantes:**
- Não permitir saldo digitado manualmente nos itens.
- Saldo é sempre calculado a partir das OS.
- Status do contrato vira `CRITICO` se algum item estiver perto de acabar (regra de negócio a definir: < 10% ou valor fixo).

---

### Entrega 03 — Carga dos contratos por planilha

| Método | Rota | Descrição |
|--------|------|-----------|
| POST | `/api/contratos/importar/validar` | Recebe arquivo, valida e retorna preview |
| POST | `/api/contratos/importar` | Confirma a importação dos registros válidos |
| GET | `/api/contratos/importar/modelo` | Download do arquivo modelo |

**Layout esperado da planilha (CSV):**

```csv
contrato;fornecedor;vigencia_inicio;vigencia_fim;item;quantidade
CTR-2026-004;Segurança Patrimonial;01/04/2026;31/03/2027;Manutenção de câmeras;24
```

**Validações obrigatórias:**
- Campos obrigatórios preenchidos.
- `vigencia_inicio` < `vigencia_fim`.
- `quantidade` > 0.
- Número do contrato não duplicado (ou regra de reconciliação para reimportação — fica para Fatia 2).
- Nenhum registro é gravado se houver erro de validação (transação atômica).

---

### Entrega 04 — Chamado como entrada

| Método | Rota | Descrição |
|--------|------|-----------|
| POST | `/api/chamados` | Cria chamado com foto opcional |
| GET | `/api/chamados` | Lista chamados com filtros por situação |
| GET | `/api/chamados/:id` | Detalhe do chamado |
| PUT | `/api/chamados/:id` | Atualiza situação ou dados |
| POST | `/api/chamados/:id/convertar` | Marca chamado como CONVERTIDO |
| POST | `/api/upload/foto` | Upload temporário de foto de evidência |

**Regras:**
- Um chamado convertido em OS não pode ser editado.
- Foto limitada a 1 por chamado nesta fatia.
- Extensões permitidas: JPG, PNG, WEBP.
- Tamanho máximo recomendado: 5MB.

---

### Entrega 05 — Ordem de serviço com trava de saldo

| Método | Rota | Descrição |
|--------|------|-----------|
| POST | `/api/ordens-servico` | Cria OS a partir de chamado, reservando saldo |
| GET | `/api/ordens-servico` | Lista OS com filtros |
| GET | `/api/ordens-servico/:id` | Detalhe da OS |
| PUT | `/api/ordens-servico/:id/consumir` | Confirma consumo do saldo (move reserva → consumida) |
| PUT | `/api/ordens-servico/:id/cancelar` | Cancela OS e devolve reserva |
| GET | `/api/itens-contrato/:id/ordens` | Lista OS que consumiram/reservaram determinado item |

**Regras críticas de transação:**

1. Na criação da OS:
   - Verificar se o chamado existe e está `ABERTO`.
   - Para cada item selecionado, verificar se há saldo disponível.
   - Criar OS em status `ABERTA`.
   - Incrementar `quantidade_reservada` do item.
   - Marcar chamado como `EM_ATENDIMENTO`.

2. No consumo:
   - Verificar se OS está `ABERTA`.
   - Decrementar `quantidade_reservada`.
   - Incrementar `quantidade_consumida`.
   - Atualizar OS para `CONSUMIDA`.
   - Marcar chamado como `CONVERTIDO`.

3. No cancelamento:
   - Verificar se OS está `ABERTA`.
   - Decrementar `quantidade_reservada`.
   - Atualizar OS para `CANCELADA`.
   - Voltar chamado para `ABERTO` (se ainda existir).

**Trava de concorrência:**
- Usar transações do PostgreSQL (Prisma `$transaction`) para evitar que duas OS reservem o mesmo saldo simultaneamente.
- Verificação de saldo deve acontecer no banco, não apenas no frontend.

---

### Entrega 06 — Publicação e ajuste

Nenhum endpoint novo. Esta entrega envolve:
- Deploy do backend.
- Configuração do banco PostgreSQL em produção.
- Variáveis de ambiente (DATABASE_URL, JWT_SECRET, PORT, CORS_ORIGIN).
- Testes ponta a ponta chamando os endpoints na sequência:
  1. Importar contrato.
  2. Abrir chamado.
  3. Converter chamado em OS.
  4. Verificar reserva no Painel de Saldo.
  5. Consumir OS.
  6. Verificar saldo consumido.

---

## 4. Ordem recomendada de implementação

1. **Configuração do projeto**
   - Instalar Prisma, Zod, JWT, bcrypt, Multer.
   - Configurar variáveis de ambiente.
   - Criar schema do banco.

2. **Entrega 01 — Autenticação e seed**
   - Tabela `Usuario`.
   - Login e middleware de autenticação.
   - Seed de usuários.

3. **Entrega 02 — Contratos e itens**
   - Tabelas `Contrato` e `ItemContrato`.
   - CRUD de contratos.
   - Endpoint de saldo por item.

4. **Entrega 03 — Importação de planilha**
   - Parser de CSV.
   - Endpoint de validação.
   - Endpoint de importação atômica.

5. **Entrega 04 — Chamados**
   - Tabela `Chamado`.
   - CRUD e upload de foto.
   - Endpoint de conversão.

6. **Entrega 05 — Ordem de serviço com trava de saldo**
   - Tabelas `OrdemServico` e `OrdemServicoItem`.
   - Criação de OS com reserva.
   - Consumo e cancelamento com devolução.
   - Endpoint de consulta por item.

7. **Entrega 06 — Deploy**
   - Build, banco de produção, testes ponta a ponta.

---

## 5. Critérios de aceitação por entrega

| Entrega | Critério de aceite |
|---------|---------------------|
| 01 | Login retorna token JWT; rotas protegidas recusam acesso sem token. |
| 02 | Contrato criado com itens; saldo de item é `contratado - consumido - reservado`; item zerado aparece indisponível. |
| 03 | Planilha inválida retorna erros sem gravar nada; planilha válida grava contratos e itens. |
| 04 | Chamado criado com foto; lista filtra por situação; conversão para OS preenche vínculo. |
| 05 | Duas OS criadas ao mesmo tempo não conseguem reservar o mesmo saldo; cancelamento devolve reserva. |
| 06 | Sistema acessível em produção; fluxo completo executado com sucesso. |

---

## 6. Riscos e cuidados

| Risco | Mitigação |
|-------|-----------|
| Concorrência na reserva de saldo | Usar transações do banco e verificação server-side. |
| Carga de planilha corrompendo saldo | Validar antes de gravar; nunca atualizar saldo manualmente. |
| Foto grande demais | Limitar tamanho, compactar e/ou usar storage externo. |
| Perfis sem separação clara | Nesta fatia, apenas operador/admin; refinamento na Fatia 2. |
| Equipamento como texto solto | Permitir texto livre; migrar para cadastro próprio na Fatia 2. |

---

## 7. Próximos passos (quando começar a codar)

1. Instalar dependências e configurar Prisma.
2. Criar schema inicial com `Usuario`, `Contrato`, `ItemContrato`.
3. Implementar autenticação.
4. Rodar migração e seed.
5. Seguir a ordem de implementação da seção 4.

---

*Plano criado em 19/08/2026. Sujeito a ajustes conforme discovery avançar.*
