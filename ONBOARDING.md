# 📋 TributAI — Documento de Onboarding
**Machado Schütz Advogados**  
**Versão:** 1.0 | **Data:** Abril 2026

---

## 🎯 Visão Geral do Projeto

O **TributAI** é uma plataforma de diagnóstico tributário automatizado desenvolvida exclusivamente para a **Machado Schütz Advogados**. O objetivo é transformar o processo manual de análise tributária em um fluxo digital e inteligente.

### O que o sistema faz?
1. Recebe arquivos fiscais (SPED, XML de NF-e, CSV)
2. Extrai automaticamente os **códigos NCM** dos produtos
3. Calcula os tributos devidos: **ICMS, IPI, PIS e COFINS**
4. Monitora mudanças em legislações tributárias de forma automática
5. Gera relatórios de diagnóstico exportáveis

---

## 🏗️ Arquitetura do Sistema

O projeto é dividido em **três camadas principais** + um módulo independente de RPA:

```
TributAI/
├── client/                  # Frontend React (interface do usuário)
├── server/                  # Backend Node.js (API e regras de negócio)
├── shared/                  # Tipos e schema do banco de dados
└── rpa_legal_intelligence/  # Módulo Python de monitoramento legal
```

### Stack Tecnológica

| Camada | Tecnologia |
|---|---|
| Frontend | React + TypeScript + Vite + Tailwind CSS |
| Backend | Node.js + Express + TypeScript |
| Banco de Dados | PostgreSQL (Neon) + Drizzle ORM |
| Autenticação | Replit Auth (OIDC) + Passport.js |
| RPA / Scraping | Python 3.11 + Selenium + BeautifulSoup4 |
| Agendamento RPA | APScheduler |
| Comunicação RPA↔API | Webhooks REST |

---

## 🖥️ Módulo 1 — Frontend (Interface do Usuário)

### Páginas e Funcionalidades

| Rota | Nome | Descrição |
|---|---|---|
| `/` | Landing Page | Tela de apresentação e login |
| `/app` | Dashboard | Visão geral: estatísticas, uploads recentes, gráficos |
| `/uploads` | Upload de Arquivos | Upload de SPED, XML (NF-e) e CSV |
| `/ncm-analysis` | NCMs Extraídos | Listagem dos produtos e seus códigos NCM identificados |
| `/tax-analysis` | Análise Tributária | Cálculos de ICMS, IPI, PIS e COFINS por item |
| `/reports` | Relatórios | Geração e exportação do diagnóstico tributário |
| `/rpa` | RPA Legislação | Configuração e visão geral do bot de monitoramento |
| `/rpa-dashboard` | Monitoramento RPA | Painel em tempo real das mudanças legais detectadas |
| `/users` | Usuários | Gerenciamento de usuários (somente ADMIN) |

### Componentes Estruturais
- **Sidebar**: Menu lateral de navegação com nome da empresa e dados do usuário logado
- **TopBar**: Barra superior com título da página e subtítulo contextual
- **Layout padrão**: Todas as páginas seguem o padrão `Sidebar` + `TopBar` + conteúdo

---

## ⚙️ Módulo 2 — Backend (API REST)

### Endpoints Principais

#### Autenticação
```
GET  /api/auth/user          → Retorna dados do usuário autenticado
GET  /api/login              → Redireciona para login via Replit Auth
GET  /api/logout             → Encerra a sessão
```

#### Arquivos e NCM
```
POST /api/uploads            → Upload de arquivo (SPED, XML, CSV)
GET  /api/uploads            → Lista todos os uploads
GET  /api/uploads/:id/ncm-items  → NCMs extraídos de um upload
```

#### Tributos
```
GET  /api/ncm-items/:id/tributes  → Tributos calculados para um NCM
PUT  /api/tributes/:id/validate   → Valida manualmente um cálculo tributário
```

#### RPA / Monitoramento Legal
```
GET  /api/rpa/status          → Status atual do serviço RPA
GET  /api/rpa/recent-changes  → Mudanças legislativas recentes detectadas
GET  /api/rpa/critical-changes → Mudanças críticas (precisam de atenção imediata)
GET  /api/rpa/statistics      → Estatísticas de execução do RPA
POST /api/rpa/execute         → Disparo manual do ciclo de scraping
POST /api/rpa/webhook/legal-changes → Recebe alertas do bot Python
```

### Processamento de Arquivos

| Formato | Parser | Extração |
|---|---|---|
| SPED (TXT) | Parser customizado | Registros C170, C100 |
| XML (NF-e) | xml2js | Tags `<prod>`, `<NCM>` |
| CSV | csv-parse | Colunas configuráveis |

---

## 🤖 Módulo 3 — RPA Legal Intelligence (Python)

O módulo RPA é um serviço independente que monitora portais oficiais de legislação tributária e notifica o sistema automaticamente quando detecta mudanças.

### Portais Monitorados

| Portal | URL | Requer Login |
|---|---|---|
| Econet Editora | https://www.econeteditora.com.br | Sim |
| Receita Federal | https://www.gov.br/receitafederal | Não |

### Componentes do RPA

```
rpa_legal_intelligence/
├── config.py          # Configuração dos portais e credenciais
├── main.py            # Ponto de entrada principal
├── portal_scraper.py  # Selenium + BeautifulSoup para extração
├── diff_engine.py     # Detecção inteligente de mudanças (diff)
├── alert_system.py    # Sistema de alertas multi-canal (Email, Teams)
├── scheduler.py       # Agendamento periódico de execução
├── database.py        # Integração com PostgreSQL
└── logger.py          # Logging estruturado
```

### Fluxo de Execução do RPA

```
1. Agendador dispara execução (ou manual via dashboard)
      ↓
2. Scraper acessa portal (com login se necessário)
      ↓
3. Extrai conteúdo HTML das páginas de legislação
      ↓
4. DiffEngine compara com versão anterior salva
      ↓
5. Identifica mudanças e classifica severidade
      ↓
6. Envia alerta por email/webhook se mudança crítica
      ↓
7. Registra no banco e notifica a API Node.js via webhook
```

### Níveis de Severidade das Mudanças

| Nível | Cor | Significado |
|---|---|---|
| `critical` | 🔴 Vermelho | Exige ação imediata (altera alíquotas, prazos) |
| `high` | 🟠 Laranja | Mudança importante para revisar |
| `medium` | 🟡 Amarelo | Atualização a ser monitorada |
| `low` | 🟢 Verde | Informativo, baixo impacto |

---

## 👥 Perfis de Usuário

| Perfil | Permissões |
|---|---|
| **ADMIN** | Acesso total: usuários, validações, configurações |
| **ANALYST** | Upload, análise tributária, relatórios e RPA |
| **USER** | Upload e visualização de análises |

---

## 🗄️ Banco de Dados (Estrutura Principal)

| Tabela | Função |
|---|---|
| `users` | Usuários da plataforma com papel (role) |
| `sessions` | Sessões de autenticação ativas |
| `file_uploads` | Registro de arquivos enviados |
| `ncm_items` | Produtos e códigos NCM extraídos dos arquivos |
| `tributes` | Tributos calculados por item (ICMS, IPI, PIS, COFINS) |
| `law_change_logs` | Histórico de mudanças legislativas detectadas pelo RPA |
| `rpa_executions` | Log de execuções do robô de scraping |

---

## 🚀 Como Rodar o Projeto (Demo)

### 1. Iniciar a aplicação
O workflow `Start application` já está configurado. Basta iniciar no Replit:
```bash
npm run dev
```
Isso sobe simultaneamente:
- **Servidor Express** na porta 5000
- **Vite (Frontend)** servido pelo mesmo servidor

### 2. Acessar
Abra o preview do Replit ou acesse a URL da aplicação. A tela de login aparecerá automaticamente.

### 3. Executar o RPA manualmente
```bash
python run_rpa.py execute all
```

### 4. Rodar os testes de demonstração do RPA
```bash
python rpa_legal_intelligence/demo_test.py
```

---

## 🔐 Variáveis de Ambiente (Secrets)

| Variável | Uso |
|---|---|
| `DATABASE_URL` | String de conexão com o PostgreSQL |
| `PGHOST`, `PGPORT`, `PGUSER`, `PGPASSWORD`, `PGDATABASE` | Credenciais diretas do banco |
| `PRIVATE_OBJECT_DIR` | Diretório privado do Object Storage |
| `PUBLIC_OBJECT_SEARCH_PATHS` | Caminhos do storage público |

> ⚠️ **Nunca** exponha esses valores. Gerenciar sempre via painel de Secrets do Replit.

---

## 📌 Estado Atual da Demo

### ✅ Implementado e Funcionando
- [x] Autenticação com Replit Auth
- [x] Upload e parsing de arquivos SPED, XML e CSV
- [x] Extração de NCM e cálculo automático de tributos
- [x] Dashboard com estatísticas
- [x] Página de análise tributária com validação manual
- [x] Módulo RPA com scraping de 2 portais
- [x] Sistema de alertas por email e webhook
- [x] Dashboard de monitoramento RPA em tempo real
- [x] 6 endpoints REST de integração RPA ↔ TributAI
- [x] Detecção inteligente de mudanças (DiffEngine)
- [x] Suporte a múltiplos perfis de usuário

### 🔜 Próximos Passos (Fase de Produção)
- [ ] Conexão real dos endpoints RPA com banco de dados (substituir dados mock)
- [ ] Configurar credenciais dos portais (Econet login)
- [ ] Ativar alertas de email em produção (SMTP)
- [ ] Definir usuários administradores iniciais
- [ ] Levantar infraestrutura de produção (cloud / Docker)
- [ ] Integrar legislações estaduais (SEFAZ UF)
- [ ] Adicionar suporte a regras fiscais específicas por cliente

---

## 📞 Contato e Próximos Passos

Este documento refere-se à **fase de demo aprovada** do projeto TributAI.  
Para a estruturação da fase de produção, o time deve alinhar:

1. **Infraestrutura**: Definir cloud de destino (Azure, AWS, on-premises)
2. **Usuários**: Levantar lista inicial de usuários e papéis
3. **Credenciais de portais**: Dados de acesso ao Econet Editora
4. **Regras tributárias**: Validar com a equipe jurídica as alíquotas configuradas
5. **Alertas**: Definir destinatários dos emails de mudanças legislativas críticas

---

*Documento gerado para onboarding interno — Machado Schütz Advogados © 2026*
