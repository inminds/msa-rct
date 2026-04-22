# Design: Agendamento Automático de Varredura de NCMs

**Data:** 2026-04-22  
**Status:** Aprovado  
**Contexto:** App Express + React com SQLite (dev) / PostgreSQL (prod). O scraper `econet_scraper.py` já roda headless via `session.json`.

---

## 1. Banco de Dados

Tabela `scan_schedule` no schema Drizzle existente (`shared/schema.ts`). Sempre terá no máximo uma linha (`id = 1`).

| Coluna | Tipo | Descrição |
|---|---|---|
| `id` | integer PK | sempre 1 |
| `enabled` | boolean | agendamento ativo ou não |
| `frequency` | text | `'weekly'` ou `'monthly'` |
| `day_of_week` | integer | 0–6 (Dom=0 … Sáb=6), usado quando `frequency = 'weekly'` |
| `day_of_month` | integer | 1–28, usado quando `frequency = 'monthly'` |
| `hour` | integer | 0–23 |
| `minute` | integer | 0–59 |
| `mode` | text | `'incompletos'` ou `'todos'` |
| `updated_at` | timestamp | última vez que o usuário salvou |

A tabela funciona identicamente em SQLite e PostgreSQL via Drizzle ORM.

---

## 2. Backend

### 2.1 `server/services/schedulerService.ts`

Serviço singleton com três funções exportadas:

**`initScheduler()`**
- Chamada uma única vez na inicialização do servidor (`server/index.ts`), após o banco estar pronto.
- Lê a linha `id = 1` da tabela `scan_schedule`.
- Se `enabled = true`, chama `applySchedule(config)`.

**`applySchedule(config)`**
- Cancela o job `node-cron` ativo (se existir).
- Monta a expressão cron:
  - Semanal: `"<minute> <hour> * * <day_of_week>"`
  - Mensal: `"<minute> <hour> <day_of_month> * *"`
- Registra novo job que chama `spawn(PYTHON, ['econet_scraper.py', ...args])` igual ao trigger manual.
- Exporta o job ativo em variável de módulo para cancelamento futuro.

**`cancelSchedule()`**
- Cancela o job ativo sem alterar o banco.

### 2.2 Endpoints em `server/routes.ts`

| Método | Rota | Comportamento |
|---|---|---|
| `GET` | `/api/ncm-scan/schedule` | Retorna config atual do banco (ou `null` se não configurado) |
| `POST` | `/api/ncm-scan/schedule` | Valida payload, persiste no banco (upsert `id=1`), chama `applySchedule()` se `enabled`, ou `cancelSchedule()` se `enabled = false` |
| `DELETE` | `/api/ncm-scan/schedule` | Define `enabled = false` no banco e chama `cancelSchedule()` |

Todos os endpoints requerem `isAuthenticated`.

### 2.3 `server/index.ts`

Adiciona `await initScheduler()` após a inicialização do banco e antes de `registerRoutes()`.

---

## 3. Frontend

### 3.1 Botão de acesso

Botão **"Agendar Varredura"** com ícone `Calendar` (lucide-react), adicionado na barra de filtros de `NCMAnalysis.tsx`, ao lado dos botões existentes.

### 3.2 Modal `ScheduleModal.tsx`

Novo componente em `client/src/components/ScheduleModal.tsx`.

**Campos:**
- **Toggle ativo/inativo** — desabilita todos os outros campos quando inativo
- **Frequência** — Select: `Semanal` / `Mensal`
- **Dia** — Select condicional:
  - Semanal: dias da semana (Domingo … Sábado)
  - Mensal: número 1–28
- **Horário** — dois Selects: hora (00–23) e minuto (00, 15, 30, 45)
- **Modo** — Select: `Buscar Pendentes` / `Buscar Todos`
- **Próxima execução** — texto calculado localmente com base nos campos, ex: "Seg 14/07 às 08:00"

**Comportamento:**
- Ao abrir: `GET /api/ncm-scan/schedule` para pré-preencher campos. Se `null`, abre com toggle desligado e campos em branco.
- Ao salvar: `POST /api/ncm-scan/schedule` com o payload completo → toast "Agendamento salvo!" ou erro.
- Toggle desligado + Salvar: envia `enabled: false` → job cancelado no servidor.
- Minutos limitados a 00, 15, 30, 45 para simplificar UX.

---

## 4. Dependências a Instalar

```bash
npm install node-cron
npm install --save-dev @types/node-cron
```

---

## 5. Fluxo Completo

```
Servidor inicia
  └─ initScheduler()
       └─ lê scan_schedule do banco
            ├─ enabled=true → applySchedule() → job registrado
            └─ enabled=false / sem registro → nenhuma ação

Usuário abre modal → GET /api/ncm-scan/schedule → pré-preenche campos
Usuário configura e salva → POST /api/ncm-scan/schedule
  └─ banco atualizado
  └─ applySchedule() cancela job antigo e registra novo

Cron dispara no horário configurado
  └─ spawn(PYTHON, ['econet_scraper.py', ...]) — idêntico ao trigger manual
```

---

## 6. Fora de Escopo

- Histórico de execuções agendadas (pode ser adicionado futuramente)
- Múltiplos agendamentos (uma configuração única é suficiente)
- Notificação por e-mail ao concluir
