# CLAUDE.md — Contexto Completo do Projeto RTC

> Este arquivo é o ponto central de contexto para o Claude Code trabalhar neste repositório.
> Leia-o inteiramente antes de iniciar qualquer tarefa.

---

## 1. Visão Geral do Projeto

**RTC — Revisão da Classificação Tributária/Fiscal** é uma plataforma web full-stack de diagnóstico tributário automatizado, desenvolvida para **Machado Schütz Advogados** — escritório especializado em consultoria jurídico-tributária.

> Nota: o nome interno anterior era "TributAI". O nome oficial e definitivo do produto é **RTC — Revisão da Classificação Tributária/Fiscal**. Usar este nome em todo código, UI, documentação e comunicação.

O sistema transforma um processo manual de análise fiscal (lento, propenso a erros) em um fluxo de trabalho inteligente e digital, cobrindo:

- Leitura e extração de dados de arquivos fiscais (planilhas de NCMs, CSV, SPED, XML de NF-e)
- Varredura automatizada no Econet para buscar tributação por NCM
- Construção incremental de base de dados tributária interna
- Análise e cruzamento de tributos federais (PIS e COFINS) — ICMS estadual é fase posterior
- Monitoramento contínuo de alterações legislativas via RPA
- Geração de relatórios e histórico de validações com vigência

**Status atual:** Demo concluído e validado. A próxima etapa é implementar as funcionalidades reais do MVP (saindo do modo simulado). O sistema atualmente usa dados fictícios/simulados — as credenciais reais da Econet existem mas ainda não estão integradas.

---

## 2. Domínio de Negócio

### Tributos Gerenciados

| Tributo | Tipo | Descrição |
|---------|------|-----------|
| **PIS** | Federal | Programa de Integração Social |
| **COFINS** | Federal | Contribuição para Financiamento da Seguridade Social |
| **ICMS** | Estadual | Imposto sobre Circulação de Mercadorias e Serviços (7–30% por estado) |
| **IPI** | Federal | Imposto sobre Produtos Industrializados |
| **CBS** | Federal | Contribuição sobre Bens e Serviços (reforma tributária 2026) |

### Regras de Negócio Críticas

1. **Sem sobrescrita de dados** — todas as alterações são rastreadas com timestamps (exigência de compliance)
2. **Processamento incremental de NCMs** — NCMs já escaneados não são re-consultados desnecessariamente
3. **Vigência obrigatória** — todas as alíquotas devem ter datas de início e fim de validade
4. **Retenção de 5 anos** — registros históricos mantidos conforme lei tributária brasileira
5. **Controle de custo de tokens** — execuções manuais de RPA requerem aprovação dupla
6. **Alertas por severidade** — alterações legislativas classificadas em LOW / MEDIUM / HIGH / CRITICAL

### Portais Monitorados pelo RPA

1. **Econet Editora** (`https://www.econeteditora.com.br`) — requer credenciais de login, possui CAPTCHA
2. **Receita Federal** (`https://www.gov.br/receitafederal`) — acesso público, legislação federal

---

## 3. Arquitetura do Sistema

O sistema tem 3 camadas independentes:

```
┌─────────────────────────────────────────────┐
│           FRONTEND (React + Vite)           │
│   Shadcn/ui · TanStack Query · Wouter       │
└──────────────────┬──────────────────────────┘
                   │ REST API
┌──────────────────▼──────────────────────────┐
│          BACKEND (Express + Node 20)         │
│   Drizzle ORM · Passport.js · Multer        │
└────────┬──────────────────┬─────────────────┘
         │ PostgreSQL        │ Webhook
┌────────▼────────┐  ┌──────▼──────────────────┐
│  Neon (Postgres)│  │   RPA (Python 3.11)      │
│  Drizzle Schema │  │   Selenium · FastAPI      │
└─────────────────┘  └─────────────────────────┘
```

---

## 4. Stack Tecnológica

| Camada | Tecnologias |
|--------|-------------|
| **Frontend** | React 18, TypeScript, Vite, Tailwind CSS, Shadcn/ui, Radix UI, TanStack Query, React Hook Form, Zod, Wouter, Lucide React, Recharts |
| **Backend** | Node.js 20, Express.js, TypeScript (ES modules), ESBuild |
| **Banco de Dados** | PostgreSQL (Neon serverless), Drizzle ORM, Drizzle Kit (migrations) |
| **Autenticação** | Replit OIDC, Passport.js, Express Sessions (connect-pg-simple) |
| **Upload de Arquivos** | Multer |
| **RPA** | Python 3.11, Selenium WebDriver, BeautifulSoup4, FastAPI, APScheduler |
| **Infraestrutura atual** | Replit (Node 20 + PostgreSQL 16 + Python 3.11) |

---

## 5. Estrutura do Projeto

```
msa-rct/
├── .docs/                          # Documentação do projeto
│   ├── Requisitos.txt              # Requisitos principais (PT-BR)
│   ├── RTC - Revisão da Classificação Tributária.txt
│   ├── ONBOARDING.md               # Guia de setup completo
│   ├── DOCUMENTO_PROJETO_TRIBUTAI.md  # Especificação completa (13 seções)
│   ├── RPA_DELIVERY_REPORT.md      # Relatório de entrega fase 1
│   └── replit.md                   # Docs da plataforma Replit
├── client/
│   └── src/
│       ├── pages/                  # 11 componentes de rota
│       ├── components/             # Componentes UI reutilizáveis
│       ├── api/                    # Funções de cliente da API
│       ├── hooks/                  # Custom React hooks
│       └── lib/                    # Utilitários e helpers
├── server/
│   ├── index.ts                    # Entry point do Express
│   ├── routes.ts                   # 30+ endpoints da API REST
│   ├── db.ts                       # Cliente Drizzle/Neon
│   ├── storage.ts                  # Camada de armazenamento de arquivos
│   ├── services/
│   │   ├── fileProcessor.ts        # Parser de SPED/XML/CSV
│   │   └── taxCalculator.ts        # Cálculo de tributos
│   └── middlewares/
│       └── demoAuth.ts             # Autenticação (demo mode)
├── shared/
│   └── schema.ts                   # Schema Drizzle (tabelas, enums, tipos Zod)
├── rpa_legal_intelligence/         # Módulo RPA Python
│   ├── main.py
│   ├── config.py                   # Configuração dos portais
│   ├── portal_scraper.py           # Selenium + BeautifulSoup
│   ├── diff_engine.py              # Detecção de mudanças semânticas
│   ├── database.py                 # Integração PostgreSQL
│   ├── alert_system.py             # Alertas (Email, Teams)
│   ├── scheduler.py                # APScheduler (3x/dia)
│   ├── logger.py                   # Logging JSON estruturado
│   ├── api_integration.py          # FastAPI REST endpoints
│   ├── rpa_executor.py             # Orquestração principal
│   └── demo_test.py                # Suite de testes
├── attached_assets/                # Mockups de UI
├── run_rpa.py                      # CLI do executor RPA
├── credentials_template.json       # Template de credenciais dos portais
├── package.json
├── pyproject.toml
├── drizzle.config.ts
├── tsconfig.json
├── tailwind.config.ts
├── vite.config.ts
└── .replit
```

---

## 6. Banco de Dados — Tabelas Principais

Definidas em [`shared/schema.ts`](shared/schema.ts):

| Tabela | Descrição |
|--------|-----------|
| `users` | Usuários com papéis: ADMIN, ANALYST, USER |
| `sessions` | Sessões Express (connect-pg-simple) |
| `uploads` | Histórico de uploads (SPED/XML/CSV) |
| `ncm_items` | Códigos NCM extraídos dos uploads |
| `tributes` | Alíquotas calculadas (com histórico de validações) |
| `law_change_logs` | Mudanças legislativas detectadas pelo RPA |
| `rpa_executions` | Histórico e métricas de execuções do RPA |

---

## 7. Rotas Frontend

| Rota | Função |
|------|--------|
| `/` | Landing page / autenticação |
| `/app` | Dashboard (estatísticas, uploads recentes, gráficos) |
| `/uploads` | Interface de upload de arquivos |
| `/ncm-analysis` | Códigos NCM extraídos e produtos |
| `/tax-analysis` | Cálculos de tributos com validação manual |
| `/reports` | Geração de relatórios e exportação (PDF/Excel) |
| `/rpa` | Configuração e monitoramento do RPA |
| `/rpa-dashboard` | Monitoramento em tempo real de mudanças legais |
| `/users` | Gerenciamento de usuários (Admin only) |

---

## 8. Endpoints de API (Principais)

```
POST   /api/uploads                       Upload de arquivo
GET    /api/uploads/:id/ncm-items         NCMs extraídos
GET    /api/ncm-items/:id/tributes        Cálculos tributários
PUT    /api/tributes/:id/validate         Validação manual de tributo
GET    /api/rpa/status                    Status do serviço RPA
GET    /api/rpa/recent-changes            Últimas mudanças legislativas
POST   /api/rpa/execute                   Trigger manual do RPA
POST   /api/rpa/webhook/legal-changes     Webhook receptor (Python → Node)
```

---

## 9. Módulo RPA (Python)

### Modos de Execução

```bash
# Portal único
python run_rpa.py execute econet -u <user> -p <pass>

# Todos os portais
python run_rpa.py execute-all -c credentials.json

# Servidor FastAPI
python run_rpa.py api --host 0.0.0.0 --port 8080

# Agendador automático (3x/dia)
python run_rpa.py scheduler -c credentials.json
```

### Características

- Rate limiting: 2s entre requisições
- Timeout máximo: 15 minutos por execução
- Screenshot automático em erros
- Detecção e pausa para resolução manual de CAPTCHA
- Retry com backoff exponencial
- Logging JSON estruturado

---

## 10. Fluxo de Aprovação (Controle de Custo)

Para execuções manuais de RPA (que consomem tokens de API):

```
Usuário solicita scan
       ↓
Thayssa avalia necessidade (Aprovação 1)
       ↓
Yuri aprova custo/tokens (Aprovação 2)
       ↓
Sistema executa o RPA
```

---

## 11. Papéis e Stakeholders

| Papel | Descrição |
|-------|-----------|
| **ADMIN** | Configuração do sistema, gerenciamento de usuários |
| **ANALYST** | Trabalho diário de análise tributária |
| **USER** | Upload de arquivos e visualização |
| **Thayssa** | Autoridade de aprovação de RPA (avaliação de necessidade) |
| **Yuri** | Autoridade de aprovação de custo/tokens |
| **Alejandro** | Desenvolvedor principal |
| **Vitor** | Desenvolvedor principal |
| **Machado Schütz Advogados** | Cliente/operador da plataforma |

---

## 12. Escopo do MVP — O Que Será Implementado Agora

Esta é a única fase de desenvolvimento ativa no momento. Tudo abaixo sai do modo demo e passa a funcionar de verdade:

### Funcionalidades do MVP (em ordem de prioridade)

| # | Funcionalidade | Detalhe |
|---|---------------|---------|
| 1 | **Dashboard funcional** | Visão geral: status das varreduras, NCMs analisados, pendências |
| 2 | **Upload de arquivos** | Ingestão de planilhas/CSV com lista de NCMs dos clientes |
| 3 | **Varredura no Econet** | Bot (Playwright/Selenium) navega o Econet por NCM → captura HTML → Claude extrai tributação estruturada |
| 4 | **Base incremental de NCMs** | NCMs já existentes não são rebuscados; apenas novos ou desatualizados |
| 5 | **Análise tributária federal** | Foco em PIS e COFINS (excluindo importação, exportação e CST) |
| 6 | **Fluxo de aprovação de mudanças** | Thayssa → Yuri antes de qualquer varredura manual |

### Fora do escopo do MVP (para depois)

- Análise estadual de ICMS (muito complexa — 27 estados)
- Chatbot conversacional da base de dados
- Integração com reforma tributária / CBS 2026

### Arquitetura de Varredura (decisão técnica já tomada)

A abordagem escolhida é **RPA + Claude como interpretador** (Opção 1 do Requisitos.txt):

1. **Playwright** (Python) navega o Econet, faz login com credenciais reais, busca cada NCM e captura o HTML da página
2. **Claude** recebe o conteúdo bruto e extrai as informações tributárias relevantes (alíquotas, condições especiais, vigência) de forma estruturada
3. Os dados extraídos são salvos no banco de dados com data de vigência

**Por que Playwright (e não Selenium):** auto-wait nativo (menos falhas intermitentes), async-first, melhor debug (traces/vídeos/screenshots nativos), mais rápido e menos verboso. O módulo `rpa_legal_intelligence/` existente usa Selenium — mantido por enquanto; o novo scraper de NCMs do MVP usará Playwright. Migração do módulo legado pode ser feita em fase posterior.

> Importante: o Econet não tem API pública. A varredura é via automação web (leitura de HTML), o que consome tokens do Claude — daí o fluxo de aprovação para varreduras não-programadas.

### Mapeamento de Navegação do Econet (PIS/COFINS)

Fluxo completo que o scraper deve reproduzir:

```
1. Acessar home do Econet (econeteditora.com.br)
   └── O login fica NA HOME (não há página própria de login)
   └── ⚠️ reCAPTCHA presente no formulário de login

2. Fazer login com credenciais
   └── Estratégia: reutilização de sessão (salvar cookies após login)
   └── Só resolve CAPTCHA novamente quando a sessão expirar

3. Clicar em "Federal" (menu lateral esquerdo)

4. Navegar para PIS/COFINS (submenu)

5. Clicar em "Busca do Produto" (aba dentro da seção)
   └── A URL NÃO MUDA — a página se transforma internamente (SPA)
   └── Playwright deve aguardar o formulário ficar visível (auto-wait)

6. Preencher campo "Código NCM" com o código a buscar
   └── Selecionar radio button "NCM" (não "Palavra-chave")
   └── Clicar em "Pesquisar"

7. Na tela de resultados, localizar e clicar no NCM correto
   └── O site exibe a HIERARQUIA COMPLETA da árvore NCM (não só o item buscado):
       XVI → 84 → 8448 → 8448.3 → 8448.31.00 → 8448.32.11 → ...
   └── Apenas os itens "folha" (códigos completos) têm radio button para seleção
   └── Lógica do scraper: encontrar o radio button cujo valor/label bate
       exatamente com o NCM buscado (match exato de 8 dígitos, ignorando pontos)
   └── O item correto aparece próximo ao topo da lista (não necessariamente o 1º,
       pois os primeiros podem ser a seção/capítulo sem radio button)
   └── ⚠️ Se nenhum resultado for encontrado, o site exibe "Nenhum Registro Encontrado"
       com um link "voltar" — sem lista, sem radio buttons
   └── Lógica do scraper para NCM não encontrado (em cascata):
       1. Buscar pelo NCM exato de 8 dígitos → se encontrar radio button com match exato, selecionar
       2. Se a lista retornar mas sem match exato: tentar selecionar o NCM mais próximo
          (ex: 6 dígitos coincidentes) e registrar como "correspondência parcial"
       3. Se o sistema conhecer a descrição/nome do produto: tentar busca por Palavra-chave
          usando o radio button "Palavra-chave" do formulário
       4. Se "Nenhum Registro Encontrado": registrar status = "não encontrado no Econet"
          e continuar para o próximo NCM da fila (não interromper o batch)
   └── Comportamento observado: o site busca por similaridade — se o NCM digitado
       tem alguma correspondência parcial na base, retorna a árvore relacionada;
       só exibe "Nenhum Registro Encontrado" quando não há nenhuma relação

8. Extrair dados da aba padrão "Regra Geral"
   └── Esta aba já abre por padrão — não precisa navegar para outras abas no MVP
   └── Outras abas disponíveis: ZFM, Exportação, Importação, Reforma Tributária
   └── Excluir dados de Importação e Exportação (fora do escopo)
```

**Estrutura dos dados extraídos (aba Regra Geral):**

| Campo | Descrição |
|-------|-----------|
| NCM | Código numérico do produto |
| Descrição | Nome/descrição do produto |
| Regime de Tributação | Simples Nacional / Regime Cumulativo / Regime Não Cumulativo |
| PIS (%) | Alíquota de PIS para cada regime |
| COFINS (%) | Alíquota de COFINS para cada regime |
| Dispositivo Legal | Lei/artigo de referência da alíquota |
| CST | Código de Situação Tributária (ignorar no MVP) |

**Estratégia para o reCAPTCHA:**

- reCAPTCHA aparece **somente no login** — navegação pós-login não exige nova resolução
- **Preferida:** Persistência de sessão — fazer login uma vez, salvar cookies em arquivo, reutilizar nas execuções seguintes. Resolver CAPTCHA só quando a sessão expirar
- **Fallback:** Serviço de resolução automática (ex: 2captcha, ~$2-3 por 1000 resoluções) para execuções totalmente autônomas sem intervenção humana
- **Evitar:** Tentar "burlar" o reCAPTCHA — arriscado e frágil

### Estado Atual do Sistema

- **Autenticação:** ainda não definido o mecanismo de produção; `demoAuth.ts` é placeholder
- **Credenciais Econet:** existem no ambiente, mas não estão integradas ao sistema ainda
- **Cloud/Infraestrutura:** decisão de Azure vs AWS vs on-premises ainda pendente
- **Dados:** 100% simulados no momento
- **Ambientes:** Replit (compartilhado) + ambiente local de desenvolvimento

---

## 14. Como Rodar Localmente

### Backend + Frontend
```bash
npm run dev
```
> Sobe Express na porta 5000 e Vite em modo dev com proxy.

### RPA (Python)
```bash
python run_rpa.py execute-all -c credentials.json
```

### Migrations de banco
```bash
npx drizzle-kit push
```

---

## 15. Roadmap — Fases Futuras

| Fase | Escopo |
|------|--------|
| **Fase 2** | Análise estadual de ICMS (27 estados — alta complexidade) |
| **Fase 3** | Chatbot conversacional para consultas ao banco de dados |
| **Fase 4** | Integração com a reforma tributária CBS (2026) |
| **Fase 5** | Infraestrutura de produção (Docker, CI/CD, cloud) |

### Decisões Pendentes
- Escolha de cloud: Azure vs AWS vs on-premises
- Credenciais reais da Econet para ambiente de produção
- Monitoramento de SEFAZ por estado
- Personalização de regras tributárias por cliente

---

## 16. Limitações Conhecidas

- **CAPTCHA:** Requer intervenção manual quando detectado pela Econet
- **Rate limiting:** Portais podem bloquear scraping agressivo
- **Layout changes:** Scrapers quebram se o HTML do portal muda
- **ICMS estadual:** Não implementado ainda (27 variações)
- **Autenticação demo:** `demoAuth.ts` — produção exige Replit OIDC completo

---

## 17. Variáveis de Ambiente

```
DATABASE_URL         # Connection string PostgreSQL (Neon)
REPLIT_DB_URL        # (se usar Replit DB)
SESSION_SECRET       # Segredo para sessões Express
REPL_ID              # ID do ambiente Replit
ISSUER_URL           # URL do provedor OIDC
CLIENT_ID            # Client ID OIDC
CLIENT_SECRET        # Client Secret OIDC
```

---

## 18. Convenções de Código

- **TypeScript estrito** no frontend e backend; sem `any` desnecessário
- **Drizzle ORM** para todas as queries — sem SQL raw exceto em casos especiais
- **Zod** para validação em boundaries (entrada de API, formulários)
- **TanStack Query** para todo fetching de dados no frontend
- **Shadcn/ui + Tailwind** para estilização — não usar CSS customizado sem necessidade
- **Wouter** para roteamento — não adicionar React Router
- Comentários apenas onde a lógica não é evidente
- Não adicionar tratamento de erro para cenários impossíveis
- Não criar abstrações prematuras — três linhas similares são preferíveis a uma abstração especulativa
