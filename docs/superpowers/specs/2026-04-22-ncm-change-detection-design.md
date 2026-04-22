# Design: Detecção e Revisão de Mudanças em NCMs (Varredura Agendada)

**Data:** 2026-04-22
**Status:** Aprovado

---

## Visão Geral

Quando a varredura automática agendada roda e encontra valores diferentes nos NCMs que
já estavam completamente preenchidos no Excel, as diferenças são salvas no banco e
exibidas na tela "Mudanças NCM" (rota `/rpa-dashboard`). A Thayssa (ADMIN) pode aceitar
ou rejeitar cada mudança individualmente, ou aceitar todas de uma vez. Usuários padrão
têm acesso à tela em modo somente leitura.

---

## Fluxo Completo

```
1. Scheduler dispara varredura agendada
2. Node.js lê Excel → salva snapshot dos NCMs já preenchidos (valores atuais)
3. Scraper roda → escreve novos valores do Econet no Excel
4. Processo termina (child.on('exit'))
5. Node.js lê Excel novamente → compara campo a campo com snapshot
6. Diferenças encontradas → INSERT em ncm_changes (status: pending)
7. Thayssa vê as mudanças na tela "Mudanças NCM"
   ├── Aceita → marca accepted, Excel já tem os novos valores (nada a fazer)
   └── Rejeita → restaura valor antigo no Excel via excel_helper.py restore
                  → marca rejected + registra rejected_at
```

**Campos comparados:** `PIS Cumulativo`, `COFINS Cumulativo`, `PIS Não Cumulativo`,
`COFINS Não Cumulativo`, `Regime`

**Critério de NCM "preenchido":** possui ao menos `PIS Cumulativo` ou `PIS Não Cumulativo`
preenchido (mesmo critério da função `isPreenchido()` no frontend).

---

## Banco de Dados

Tabela `ncm_changes` criada via SQL direto (mesmo padrão de `scan_schedule` e `scan_requests`).

| Coluna | Tipo | Descrição |
|---|---|---|
| `id` | INTEGER PRIMARY KEY AUTOINCREMENT | |
| `ncm` | TEXT NOT NULL | Código NCM (ex: `84714190`) |
| `field` | TEXT NOT NULL | Campo que mudou (ex: `PIS Cumulativo`) |
| `old_value` | TEXT | Valor que estava no Excel antes do scan |
| `new_value` | TEXT | Valor novo que o scraper escreveu |
| `status` | TEXT NOT NULL DEFAULT `pending` | `pending` / `accepted` / `rejected` |
| `scan_date` | TEXT NOT NULL | Data/hora da varredura que detectou |
| `resolved_at` | TEXT | Quando Thayssa tomou a decisão |

```sql
CREATE TABLE IF NOT EXISTS ncm_changes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  ncm TEXT NOT NULL,
  field TEXT NOT NULL,
  old_value TEXT,
  new_value TEXT,
  status TEXT NOT NULL DEFAULT 'pending',
  scan_date TEXT NOT NULL,
  resolved_at TEXT
);
```

---

## Backend

### Mudanças em `schedulerService.ts`

- Processo agendado deixa de ser `detached: true` — passa a ser monitorado via `child.on('exit')`
- `setActivePid()` continua funcionando normalmente para o banner do frontend
- Fluxo novo:

```typescript
// 1. Snapshot antes do scan
const snapshot = await readNCMsFromExcel();
const filledSnapshot = snapshot.filter(r => r["PIS Cumulativo"] || r["PIS Não Cumulativo"]);

// 2. Spawn sem detached
const child = spawn(PYTHON, args, { cwd, env, stdio: "ignore" });
if (child.pid) setActivePid(child.pid);

// 3. Ao terminar: comparar e salvar diferenças
child.on("exit", async () => {
  setActivePid(null);
  const after = await readNCMsFromExcel();
  await detectAndSaveChanges(filledSnapshot, after);
});
```

### Novo: `detectAndSaveChanges(before, after)`

Função interna em `schedulerService.ts`:
- Para cada NCM que estava preenchido no snapshot, busca o mesmo NCM no `after`
- Compara os 5 campos
- Para cada diferença encontrada: INSERT em `ncm_changes` com `status = 'pending'`
- Usa `better-sqlite3` direto (mesmo padrão do restante do projeto)

### Novo comando em `excel_helper.py`

```bash
python excel_helper.py restore <NCM> <CAMPO> <VALOR>
```

- Localiza a linha do NCM na coluna A
- Escreve o `VALOR` na coluna correspondente ao `CAMPO`
- Mapeamento de campos para colunas:

| Campo | Coluna Excel |
|---|---|
| PIS Cumulativo | D |
| COFINS Cumulativo | E |
| PIS Não Cumulativo | F |
| COFINS Não Cumulativo | G |
| Regime | H |

### Endpoints em `routes.ts`

| Método | Rota | Middleware | Descrição |
|---|---|---|---|
| `GET` | `/api/ncm-changes` | `isAuthenticated` | Lista mudanças (query: `?status=pending\|accepted\|rejected\|all`) |
| `POST` | `/api/ncm-changes/accept-all` | `isAdmin` | Aceita todas as pendentes de uma vez |
| `POST` | `/api/ncm-changes/:id/accept` | `isAdmin` | Aceita mudança individual |
| `POST` | `/api/ncm-changes/:id/reject` | `isAdmin` | Rejeita e restaura valor antigo no Excel |

**`POST /api/ncm-changes/:id/reject`:**
1. Busca a mudança pelo `id`
2. Chama `excel_helper.py restore <NCM> <CAMPO> <OLD_VALUE>`
3. Atualiza `status = 'rejected'`, `resolved_at = now`

**`POST /api/ncm-changes/accept-all`:**
- Busca todas as mudanças com `status = 'pending'`
- UPDATE em lote: `status = 'accepted'`, `resolved_at = now`
- Excel já tem os novos valores — nenhuma ação no arquivo

---

## Frontend

### `RPADashboard.tsx` — reescrita completa

**Rota:** `/rpa-dashboard` (mantida)
**Menu lateral:** item renomeado para "Mudanças NCM" (ícone: `GitCompareArrows` ou `ArrowLeftRight`)
**Acesso:** todos os usuários autenticados

**Layout:**

1. **TopBar:** "Mudanças em NCMs" / "Mudanças detectadas pela varredura automática agendada"

2. **Cards de resumo (3 cards):**
   - Total Pendentes (amarelo)
   - Total Aceitas (verde)
   - Total Rejeitadas (vermelho)

3. **Barra de ação + filtro** (só para ADMIN):
   - Botão "Aceitar Todas" (verde) — só aparece se houver pendências, abre AlertDialog de confirmação
   - Select de filtro: Pendentes / Aceitas / Rejeitadas / Todas

4. **Tabela de mudanças:**

| NCM | Campo | Valor Anterior | Valor Novo | Detectado em | Status | Ações |
|---|---|---|---|---|---|---|
| 84714190 | PIS Cumulativo | 0,65% | 1,50% | 22/04 14:30 | 🟡 Pendente | ✅ Aceitar · ❌ Rejeitar |
| 87032110 | Regime | Monofásico | Cumulativo | 22/04 14:30 | 🟢 Aceito | — |

   - Linhas `pending`: fundo amarelo claro
   - Linhas `accepted`: fundo verde claro, sem botões
   - Linhas `rejected`: fundo vermelho claro, sem botões
   - Botões Aceitar/Rejeitar visíveis apenas para ADMIN

5. **Estado vazio:** quando não há mudanças, exibe mensagem "Nenhuma mudança detectada pela varredura automática ainda."

6. **Polling:** `refetchInterval: 30_000` (30s) — atualiza automaticamente

---

## Arquivos a Criar / Modificar

| Arquivo | Ação |
|---|---|
| `scripts/create-ncm-changes-table.js` | Novo — cria tabela via SQLite |
| `server/services/schedulerService.ts` | Modificar — processo não-detached + detectAndSaveChanges |
| `server/routes.ts` | Modificar — 4 endpoints novos |
| `excel_helper.py` | Modificar — novo comando `restore` |
| `client/src/pages/RPADashboard.tsx` | Reescrever — UI de mudanças NCM |
| `client/src/components/Sidebar.tsx` | Modificar — renomear item do menu |

---

## Casos de Borda

| Situação | Comportamento |
|---|---|
| Scan agendado em modo `incompletos` | Snapshot/comparação roda mesmo assim — sem mudanças em preenchidos, nenhum registro criado |
| Excel não encontrado na comparação | Log de erro, comparação ignorada silenciosamente |
| `old_value` é vazio (campo nunca tinha valor) | Não gera mudança — só compara NCMs que estavam preenchidos |
| Thayssa rejeita mas `excel_helper.py restore` falha | Retorna 500 com mensagem de erro, status não é alterado |
| Múltiplas varreduras agendadas sem revisão | Acumula registros na tabela — Thayssa vê todos pendentes |
