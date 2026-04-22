# Design: Workflow de Aprovação de Varredura de NCMs

**Data:** 2026-04-22
**Status:** Aprovado

---

## Visão Geral

Usuários com role `USER` não podem disparar varreduras de NCM diretamente. Em vez disso,
enviam uma solicitação que passa por dois aprovadores fixos em sequência:
**Thayssa** (1ª aprovação) → **Yuri** (2ª aprovação). Somente após a aprovação do Yuri
a varredura é disparada automaticamente. Qualquer um dos dois pode rejeitar, encerrando
o fluxo. O usuário solicitante acompanha o status em tempo real.

---

## Fluxo Completo

```
USER solicita
     │
     ▼
status: pending_thayssa
     │
     ├── Thayssa rejeita → status: rejected (fim)
     │
     └── Thayssa aprova
              │
              ▼
         status: pending_yuri
              │
              ├── Yuri rejeita → status: rejected (fim)
              │
              └── Yuri aprova
                       │
                       ▼
                  status: approved → scan disparado automaticamente
```

---

## Banco de Dados

Tabela `scan_requests` criada via SQL direto (mesmo padrão de `scan_schedule`, sem drizzle-kit push).

| Coluna | Tipo | Descrição |
|---|---|---|
| `id` | INTEGER PRIMARY KEY AUTOINCREMENT | |
| `requested_by` | TEXT NOT NULL | ID do usuário solicitante |
| `mode` | TEXT NOT NULL | `incompletos` ou `todos` |
| `status` | TEXT NOT NULL DEFAULT `pending_thayssa` | Estado atual do pedido |
| `rejected_by` | TEXT | ID do aprovador que rejeitou (`thayssa` ou `yuri`) |
| `rejection_note` | TEXT | Motivo opcional informado ao rejeitar |
| `created_at` | TEXT NOT NULL | |
| `updated_at` | TEXT NOT NULL | |

**Valores válidos de `status`:** `pending_thayssa` | `pending_yuri` | `approved` | `rejected`

**Regra de unicidade:** Um usuário só pode ter um pedido ativo por vez (status `pending_thayssa` ou `pending_yuri`). O backend bloqueia nova criação se já existir pedido ativo do mesmo usuário.

---

## Backend

### Endpoints

| Método | Rota | Middleware | Descrição |
|---|---|---|---|
| `POST` | `/api/scan-requests` | `isAuthenticatedLocal` | Cria novo pedido de varredura |
| `GET` | `/api/scan-requests/mine` | `isAuthenticatedLocal` | Retorna pedido mais recente do usuário logado |
| `GET` | `/api/scan-requests/pending` | `isAdmin` | Lista pedidos pendentes para o admin logado |
| `POST` | `/api/scan-requests/:id/approve` | `isAdmin` | Aprova pedido (avança status ou dispara scan) |
| `POST` | `/api/scan-requests/:id/reject` | `isAdmin` | Rejeita pedido com motivo opcional |

### Lógica de Aprovação

**`POST /api/scan-requests/:id/approve`**
- Busca o pedido pelo `id`
- Verifica se o `req.user.id` corresponde ao aprovador esperado:
  - `status === "pending_thayssa"` → só `thayssa` pode aprovar → avança para `pending_yuri`
  - `status === "pending_yuri"` → só `yuri` pode aprovar → avança para `approved` e dispara scan
- Se o `req.user.id` não bate com o aprovador esperado → retorna 403
- O disparo do scan reutiliza exatamente o mesmo fluxo do botão manual (execFile + setActivePid)

**`POST /api/scan-requests/:id/reject`**
- Aceita body `{ note?: string }`
- Qualquer admin pode rejeitar se for o aprovador atual (mesma regra de verificação de ID)
- Salva `rejected_by` e `rejection_note`, atualiza status para `rejected`

**`GET /api/scan-requests/pending`**
- Filtra pedidos onde o admin logado é o aprovador atual:
  - `thayssa` → retorna pedidos com `status = "pending_thayssa"`
  - `yuri` → retorna pedidos com `status = "pending_yuri"`
- Retorna array vazio se não houver pendências

### Script de criação da tabela

Criado via Node.js script direto (mesmo padrão de `scan_schedule`):

```sql
CREATE TABLE IF NOT EXISTS scan_requests (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  requested_by TEXT NOT NULL,
  mode TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending_thayssa',
  rejected_by TEXT,
  rejection_note TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
```

---

## Frontend

### Para usuários USER (tela NCMs Extraídos)

- Os botões "Buscar Pendentes" e "Buscar Todos" são substituídos por:
  - **"Solicitar — Pendentes"** (amber)
  - **"Solicitar — Todos"** (blue)
- Se o usuário já tem um pedido ativo (`pending_thayssa` ou `pending_yuri`), ambos os botões ficam desabilitados
- Abaixo dos botões, um **card de status** exibe o estado do pedido mais recente:

| Status | Exibição |
|---|---|
| `pending_thayssa` | 🟡 Aguardando aprovação da Thayssa |
| `pending_yuri` | 🟠 Aguardando aprovação do Yuri |
| `approved` | 🟢 Aprovado — varredura em andamento |
| `rejected` | 🔴 Rejeitado por [nome] — [motivo] + botão "Novo Pedido" |

- O card é atualizado via polling a cada 10s (integrado ao poll de status de scan existente)
- Quando status muda para `approved`, o banner de "varredura em andamento" já existente é exibido

### Para usuários ADMIN (tela NCMs Extraídos)

- Botões de varredura direta continuam sem alteração
- Aparece painel **"Solicitações Pendentes"** logo abaixo dos botões, **somente se `GET /api/scan-requests/pending` retornar ao menos 1 item**
- Cada linha exibe: nome do solicitante, tipo (`Pendentes` / `Todos`), data/hora do pedido, botões **Aprovar** e **Rejeitar**
- Ao clicar em Rejeitar: abre um pequeno campo de texto opcional para motivo antes de confirmar
- O painel é atualizado via polling a cada 10s

---

## Arquivos a Criar / Modificar

| Arquivo | Ação |
|---|---|
| `scripts/create-scan-requests-table.js` | Novo — cria tabela via SQLite |
| `server/routes.ts` | Modificar — adiciona 5 endpoints |
| `client/src/pages/NCMAnalysis.tsx` | Modificar — lógica condicional USER vs ADMIN + card de status + painel de aprovações |

---

## Casos de Borda

| Situação | Comportamento |
|---|---|
| USER tenta criar 2º pedido com pedido ativo | Backend retorna 409, frontend mantém botões desabilitados |
| ADMIN errado tenta aprovar | Backend retorna 403 |
| Scan já em andamento quando Yuri aprova | Backend verifica `getActivePid()` — se ocupado, retorna 409 e mantém status `approved` para retry |
| Pedido aprovado mas scan falha | Status permanece `approved`; o banner de scan mostrará erro normalmente |
