# MVP Requirements — Status e Implementações

> Este arquivo deve ser atualizado a cada requisito implementado.
> Descreva o que foi feito, o que foi usado e como foi implementado.

---

## Regra para Agentes

Antes de iniciar qualquer implementação de requisito do MVP:
1. Leia este arquivo para entender o que já foi feito e o estado atual
2. Ao concluir um requisito, atualize a seção correspondente com o detalhamento da implementação
3. Marque o status como ✅ CONCLUÍDO e descreva claramente o que foi alterado

---

## Requisitos do MVP

### ✅ 1. Upload de Arquivos
**Status:** Concluído

**Descrição do requisito:**
Receber planilhas dos clientes com listas de NCMs. O sistema deve fazer ingestão incremental — NCMs já existentes na base não são rebuscados desnecessariamente.

**O que foi implementado:**

O sistema já possuía a estrutura base funcional (Multer, parsers de arquivo, schema do banco), mas todos os métodos de leitura de dados retornavam dados hardcoded/simulados. A implementação substituiu esses dados falsos por queries reais no banco de dados e adicionou a lógica de ingestão incremental.

**Arquivos alterados:**

- **`server/storage.ts`**
  - `getRecentUploads()` — substituído de array hardcoded para query real: busca os uploads mais recentes do banco, enriquece cada um com JOIN em `users` e `COUNT` de `ncm_items` associados
  - `getDashboardStats()` — substituído de números fixos (247, 1834, etc.) para 4 queries paralelas com `COUNT` e `COUNT DISTINCT` reais nas tabelas `uploads`, `ncm_items` e `tributes`
  - `getRecentAnalyses()` — substituído de array hardcoded para query real em `ncm_items` com upload e tributes associados por NCM item
  - `getTaxDistribution()` — substituído de números fixos para `GROUP BY tributes.type` real no banco
  - `getJurisdictionDistribution()` — substituído de números fixos para `GROUP BY tributes.jurisdiction` real no banco
  - `hasExistingTributeData(ncmCode)` — **novo método**: verifica via `INNER JOIN` entre `tributes` e `ncm_items` se um código NCM já possui dados de tributação cadastrados no banco; retorna `boolean`
  - Import de `isNull` e `isNotNull` do drizzle-orm (substituiu `and` e `count` que não estavam sendo usados)

- **`server/routes.ts`** — função `processFileAsync()`
  - Adicionada lógica de **ingestão incremental**: para cada NCM extraído do arquivo, sempre cria o registro `ncm_items` (para rastrear o histórico do upload), mas chama `storage.hasExistingTributeData()` antes de calcular tributos
  - Se o NCM já tem dados de tributação no banco → pula o cálculo (evita re-varredura desnecessária no Econet futuramente)
  - Se o NCM é novo → prossegue com cálculo normalmente

**Tecnologias/bibliotecas usadas:**
- Drizzle ORM: `eq`, `desc`, `sql`, `isNull`, `isNotNull`, `innerJoin`, `leftJoin`
- PostgreSQL aggregate functions via `sql<number>\`cast(count(*) as int)\``
- `Promise.all()` para execução paralela das 4 queries de estatísticas

---

### ✅ 2. Varredura e Construção da Base de Dados (RPA/Bot)
**Status:** Concluído

**Descrição do requisito:**
Claude acessa o Econet de forma automatizada, buscando tributação por NCM (PIS, Cofins, alíquotas, condições especiais — excluindo importação, exportação e CST). A varredura roda em calendário automático. Se alguém quiser disparar uma varredura manual/completa, o fluxo de aprovação entra em ação.

**O que foi implementado:**

**Camada Node.js (backend)**

- **`shared/schema.ts`** — 3 novos campos na tabela `ncm_items`:
  - `econet_status` (VARCHAR, default `'PENDING'`): status da varredura Econet por NCM
  - `econet_scanned_at` (TIMESTAMP): quando foi feito o último scan
  - `econet_matched_ncm` (VARCHAR): código que o Econet efetivamente retornou (pode diferir se match parcial)

- **`server/setup-db.ts`** — migração SQLite segura:
  - Tabela `ncm_items` atualizada com os 3 novos campos no `CREATE TABLE IF NOT EXISTS`
  - Migração incremental via `sqlite.pragma('table_info(ncm_items)')` para adicionar colunas em DBs existentes sem `DROP TABLE`

- **`server/storage.ts`** — 3 novos métodos:
  - `getPendingNCMs()`: retorna NCMs distintos com `econet_status = 'PENDING'` que ainda não possuem dados de tributos (`hasExistingTributeData = false`)
  - `updateNCMEconetStatus(ncmCode, status, matchedNcm?)`: atualiza todos os `ncm_items` com aquele código NCM
  - `saveNCMTributeData(ncmCode, status, regras, matchedNcm?)`: persiste PIS e COFINS como 2 registros `tributes` por regime por NCM item

- **`server/routes.ts`** — 3 novos endpoints:
  - `GET /api/ncm-scan/pending` — lista NCMs pendentes (autenticação normal ou `x-internal-key`)
  - `POST /api/ncm-scan/save` — recebe dados do scraper Python e persiste (apenas `x-internal-key`)
  - `POST /api/ncm-scan/trigger` — dispara o processo Python como filho desacoplado (`detached: true`)
  - Constante `INTERNAL_API_KEY` (env `NODE_API_KEY`, default `"dev-internal-key"`)
  - Helper `isInternalRequest()` verifica header `x-internal-key`

**Camada Python (rpa_ncm_scanner/)**

- **`config.py`** — configurações via env vars: `ECONET_URL`, `NODE_API_URL`, `NODE_API_KEY`, `ANTHROPIC_API_KEY`, `HEADLESS`, `REQUEST_DELAY`
- **`session_manager.py`** — persistência de cookies em JSON; `load_cookies()`, `save_cookies()`, `is_session_valid()`
- **`scraper.py`** — `EconetScraper` (Playwright sync):
  - `login()`: reutiliza sessão; faz login completo com browser visível apenas quando necessário (reCAPTCHA)
  - `_navigate_to_pis_cofins_search()`: Federal → PIS/COFINS → Busca do Produto
  - `_fill_ncm_search_form()`: radio "NCM" + campo + Pesquisar
  - `_select_ncm_from_results()`: match exato → match parcial (≥4 dígitos) → NOT_FOUND; captura HTML da aba Regra Geral
  - `search_ncm(ncm_code)`: API pública retorna `{status, ncm_found, matched_ncm, html_content}`
- **`interpreter.py`** — `extract_tribute_data(html_content, ncm_code)`:
  - Modelo: `claude-opus-4-5`
  - Extrai PIS/COFINS por regime tributário (Simples Nacional, Cumulativo, Não Cumulativo)
  - HTML truncado a 80.000 chars para economizar tokens
  - Retorna `{ncm, descricao, regras: [{regime, pis, cofins, dispositivo_legal}]}`
- **`api_client.py`** — cliente HTTP (httpx): `get_pending_ncms()`, `save_tribute_data()`
- **`main.py`** — CLI completo:
  - `login` → abre browser visível para reCAPTCHA manual, salva sessão
  - `scan [--ncm X]` → busca pendentes na API (ou NCM único), loop com `REQUEST_DELAY`, save na API
  - `ScanSummary` — relatório de found/partial/not_found/error ao final

**Uso:**
```bash
# 1. Fazer login e resolver reCAPTCHA (apenas na primeira vez ou quando sessão expirar)
python -m rpa_ncm_scanner login -u SEU_USUARIO -p SUA_SENHA

# 2. Escanear todos os NCMs pendentes
python -m rpa_ncm_scanner scan -u SEU_USUARIO -p SUA_SENHA

# 3. Escanear NCM específico
python -m rpa_ncm_scanner scan --ncm 85171200 -u SEU_USUARIO -p SUA_SENHA
```

**Variáveis de ambiente necessárias:**
```
ANTHROPIC_API_KEY    # Chave da API Anthropic para o interpreter
NODE_API_URL         # URL da API Node (default: http://127.0.0.1:5000)
NODE_API_KEY         # Chave interna (default: dev-internal-key)
HEADLESS             # "true" para rodar sem UI (default: false)
```

**Pré-requisitos após instalação:**
```bash
pip install playwright
playwright install chromium
```

---

### ⏳ 3. Extração e Análise de NCMs
**Status:** Pendente

**Descrição do requisito:**
Com base nos NCMs dos arquivos subidos, o sistema cruza com a base interna e aponta divergências ou pendências. Foco inicial: tributos federais (PIS e COFINS). ICMS/estadual fica para uma segunda fase.

---

### ⏳ 4. Histórico e Vigência das Informações
**Status:** Pendente

**Descrição do requisito:**
Toda informação de tributação deve ser armazenada com data de início e fim de vigência. Prazo de retenção: 5 anos. Mudanças não sobrescrevem — ficam registradas com o marco temporal para permitir análise retroativa.

**Nota:** O schema já possui campos `effectiveFrom` e `effectiveTo` na tabela `tributes`. A implementação consistirá em garantir que esses campos sejam sempre preenchidos pelo scraper do Econet e que o sistema nunca sobrescreva registros existentes.

---

### ⏳ 5. Fluxo de Aprovação para Varredura Manual
**Status:** Pendente

**Descrição do requisito:**
Solicitação de nova varredura vai primeiro para Thayssa (avalia necessidade) → se aprovada, vai para Yuri (aprovação final de custo) → só então executa. Existe para controlar consumo de tokens do Claude.

---

### ⏳ 6. Alertas de Mudança em NCMs
**Status:** Pendente (infraestrutura base existe)

**Descrição do requisito:**
Monitoramento dos sites (Receita Federal, Confaz, Sefaz, Econet) para detectar alterações de legislação/alíquota/classificação. Ao detectar mudança, dispara alerta e, idealmente, atualiza automaticamente as tabelas internas.

**Nota:** O módulo `rpa_legal_intelligence/` (Python, Selenium) já implementa parte disso em modo demo. O webhook `/api/rpa/webhook/legal-changes` já existe mas ainda não persiste no banco.

---

### ⏳ 7. Dashboard
**Status:** Parcialmente concluído (dados reais conectados no Req 1)

**Descrição do requisito:**
Visão geral do sistema: status das varreduras, NCMs analisados, alertas pendentes, etc.

**Nota:** As estatísticas do dashboard agora retornam dados reais do banco (implementado no Req 1). O que ainda falta é popular o banco com dados reais via scraper do Econet (Req 2).

---

### ⏳ 8. Gestão de Usuários
**Status:** Pendente

**Descrição do requisito:**
Controle de quem pode fazer o quê: analisar, aprovar, exportar, etc. Papéis: ADMIN, ANALYST, USER.

---

### ⏳ 9. Exportação de Relatórios
**Status:** Pendente

**Descrição do requisito:**
PDF, Excel, e possibilidade de conexão direta com o Excel do cliente (sem precisar exportar/colar manualmente todo mês).
