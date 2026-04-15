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

### ⏳ 2. Varredura e Construção da Base de Dados (RPA/Bot)
**Status:** Pendente

**Descrição do requisito:**
Claude acessa o Econet de forma automatizada, buscando tributação por NCM (PIS, Cofins, alíquotas, condições especiais — excluindo importação, exportação e CST). A varredura roda em calendário automático. Se alguém quiser disparar uma varredura manual/completa, o fluxo de aprovação entra em ação.

**Contexto técnico (ver CLAUDE.md para detalhamento completo):**
- Ferramenta escolhida: **Playwright** (Python)
- Fluxo de navegação: login na home → Federal → PIS/COFINS → Busca do Produto → digitar NCM → selecionar resultado → extrair aba Regra Geral
- reCAPTCHA apenas no login; estratégia: persistência de sessão via cookies
- NCM não encontrado: site exibe "Nenhum Registro Encontrado"
- Fallback se NCM exato não encontrado: tentar NCM mais próximo ou busca por palavra-chave

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
