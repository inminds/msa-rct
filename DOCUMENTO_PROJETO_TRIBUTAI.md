# TributAI — Documento de Projeto
## Plataforma de Diagnóstico Tributário Automatizado

**Cliente:** Machado Schütz Advogados  
**Versão do Documento:** 1.0  
**Data:** Abril de 2026  
**Status:** Fase de Demo Aprovada — Em Estruturação para Produção

---

## 1. Contexto e Origem do Projeto

A **Machado Schütz Advogados** atua há anos na área de consultoria tributária, realizando diagnósticos fiscais para seus clientes com base na análise de obrigações acessórias, notas fiscais e escriturações fiscais digitais.

O processo de diagnóstico tributário tradicional é **manual, demorado e sujeito a falhas humanas**:

- Arquivos fiscais (SPED, XML, CSV) precisam ser analisados linha a linha
- Códigos NCM precisam ser identificados manualmente para cada produto
- Alíquotas tributárias (ICMS, IPI, PIS, COFINS) precisam ser consultadas em legislações extensas
- Mudanças na legislação tributária precisam ser monitoradas continuamente

Diante desse cenário, surgiu a necessidade de criar uma solução digital que **automatizasse** essas etapas, reduzindo erros, aumentando a capacidade de atendimento e garantindo conformidade constante com a legislação vigente.

---

## 2. Objetivo do Projeto

O **TributAI** é uma plataforma web de **diagnóstico tributário automatizado** desenvolvida exclusivamente para a Machado Schütz Advogados, com o seguinte objetivo central:

> **Transformar o processo manual de análise tributária em um fluxo digital inteligente, desde o recebimento de arquivos fiscais até a geração do relatório final de diagnóstico.**

### Objetivos Específicos

| # | Objetivo | Resultado Esperado |
|---|---|---|
| 1 | Automatizar leitura de arquivos fiscais | Eliminar horas de trabalho manual na extração de dados |
| 2 | Identificar NCMs automaticamente | Classificar produtos sem intervenção humana |
| 3 | Calcular tributos com precisão | Aplicar alíquotas corretas de ICMS, IPI, PIS e COFINS |
| 4 | Monitorar legislação em tempo real | Garantir que os cálculos reflitam sempre a lei atual |
| 5 | Gerar relatórios exportáveis | Entregar diagnóstico em PDF ou Excel ao cliente final |

---

## 3. Escopo da Solução

### 3.1 O que o TributAI faz

O sistema realiza, de forma automática e integrada, as seguintes operações:

**Processamento de Arquivos Fiscais**
- Recebe e processa três formatos: SPED Fiscal (`.txt`), NF-e em XML (`.xml`) e planilhas CSV
- Extrai automaticamente os produtos, quantidades e códigos NCM de cada arquivo
- Identifica informações complementares como CFOP, CEST, descrição do produto e valor

**Cálculo Tributário Automático**
- Para cada NCM identificado, consulta a base de regras tributárias
- Calcula as alíquotas aplicáveis de acordo com a competência (federal ou estadual):
  - **IPI** — Tabela TIPI
  - **PIS** — Lei 10.637/2002
  - **COFINS** — Lei 10.833/2003
  - **ICMS** — RICMS/SP e demais estados
- Aplica regras de fallback quando o NCM não possui regra específica

**Validação Profissional**
- Os consultores da Machado Schütz podem revisar e validar cada cálculo
- O sistema registra quem validou cada item e quando
- Permite ajustes manuais quando necessário

**Monitoramento de Legislação (RPA)**
- Um robô inteligente monitora portais oficiais de legislação tributária:
  - **Econet Editora** (https://www.econeteditora.com.br)
  - **Receita Federal do Brasil** (https://www.gov.br/receitafederal)
- Detecta automaticamente mudanças em normas, alíquotas e prazos
- Envia alertas classificados por grau de urgência
- Integra as atualizações ao painel de monitoramento em tempo real

**Relatórios e Exportação**
- Geração de três modelos de relatório:
  - **Resumo Tributário** — visão consolidada por tipo de tributo
  - **Detalhe por NCM** — análise produto a produto
  - **Comparativo por Competência** — federal vs. estadual
- Exportação em **PDF** e **Excel**

---

## 4. Fluxo de Uso da Plataforma

O fluxo completo, da entrada do arquivo ao relatório final, ocorre em **6 etapas**:

```
┌──────────────────────────────────────────────────────────────────┐
│  ETAPA 1: Login                                                   │
│  O usuário acessa a plataforma com suas credenciais              │
└─────────────────────────────┬────────────────────────────────────┘
                              │
┌─────────────────────────────▼────────────────────────────────────┐
│  ETAPA 2: Upload de Arquivo                                       │
│  Envio do arquivo SPED, XML ou CSV do cliente                    │
└─────────────────────────────┬────────────────────────────────────┘
                              │
┌─────────────────────────────▼────────────────────────────────────┐
│  ETAPA 3: Processamento Automático                                │
│  Sistema extrai NCMs e calcula tributos automaticamente          │
└─────────────────────────────┬────────────────────────────────────┘
                              │
┌─────────────────────────────▼────────────────────────────────────┐
│  ETAPA 4: Revisão e Validação                                     │
│  Consultor revisa os resultados e valida os cálculos             │
└─────────────────────────────┬────────────────────────────────────┘
                              │
┌─────────────────────────────▼────────────────────────────────────┐
│  ETAPA 5: Monitoramento Legal (automático e contínuo)            │
│  RPA verifica mudanças legislativas e atualiza o sistema         │
└─────────────────────────────┬────────────────────────────────────┘
                              │
┌─────────────────────────────▼────────────────────────────────────┐
│  ETAPA 6: Relatório Final                                         │
│  Geração e exportação do diagnóstico tributário em PDF/Excel     │
└──────────────────────────────────────────────────────────────────┘
```

---

## 5. Módulo RPA Legal Intelligence

O módulo de inteligência legal é um **diferencial estratégico** da plataforma. Trata-se de um robô (RPA) desenvolvido em Python que opera de forma autônoma e contínua.

### Como Funciona

1. O agendador dispara o robô automaticamente (ou pode ser acionado manualmente)
2. O robô acessa os portais de legislação com as credenciais configuradas
3. Extrai o conteúdo das páginas de legislação tributária relevantes
4. Compara com a versão anterior salva no banco de dados
5. Detecta qualquer alteração: novas normas, mudança de alíquotas, novos prazos
6. Classifica a mudança por nível de urgência
7. Envia alertas aos responsáveis e atualiza o painel em tempo real

### Níveis de Alerta

| Nível | Significado | Ação Recomendada |
|---|---|---|
| 🔴 **Crítico** | Mudança imediata em alíquotas ou obrigações | Revisão urgente dos cálculos vigentes |
| 🟠 **Alto** | Norma importante publicada ou alterada | Análise prioritária em até 48h |
| 🟡 **Médio** | Atualização em procedimentos ou formulários | Revisão programada |
| 🟢 **Baixo** | Informativos e publicações de baixo impacto | Monitoramento |

### Dashboard de Monitoramento

O painel RPA exibe em tempo real:
- Status do robô (ativo / em execução / inativo)
- Última execução realizada e próxima execução agendada
- Lista de mudanças detectadas com data, portal e classificação
- Alertas críticos em destaque visual
- Histórico de execuções e taxa de sucesso

---

## 6. Perfis de Acesso

O sistema conta com controle de acesso por papel (role-based):

| Perfil | Quem Usa | O que Pode Fazer |
|---|---|---|
| **Administrador** | Gestores e TI | Acesso total ao sistema, incluindo usuários e configurações |
| **Analista** | Consultores tributários | Upload, análise, validação, relatórios e RPA |
| **Usuário** | Assistentes | Upload e visualização de análises |

---

## 7. Arquitetura Técnica

### Visão Geral

```
                    ┌─────────────────────┐
                    │   Navegador Web     │
                    │  (Interface React)  │
                    └──────────┬──────────┘
                               │ HTTPS
                    ┌──────────▼──────────┐
                    │   API Node.js       │
                    │   (Express)         │
                    └──────────┬──────────┘
                               │
              ┌────────────────┼────────────────┐
              │                │                │
   ┌──────────▼──────┐  ┌──────▼───────┐  ┌────▼────────────┐
   │  PostgreSQL DB  │  │  File Parser  │  │  RPA Python     │
   │  (Neon Cloud)   │  │  (SPED/XML/  │  │  (Selenium +    │
   │                 │  │   CSV)       │  │   BeautifulSoup)│
   └─────────────────┘  └─────────────┘  └─────────────────┘
```

### Tecnologias Utilizadas

**Frontend**
- React + TypeScript (interface moderna e responsiva)
- Tailwind CSS + Shadcn UI (componentes visuais)
- TanStack Query (gerenciamento de dados em tempo real)

**Backend**
- Node.js + Express (API REST)
- Drizzle ORM (banco de dados type-safe)
- PostgreSQL / Neon (banco relacional em nuvem)

**RPA**
- Python 3.11
- Selenium WebDriver (automação de browser)
- BeautifulSoup4 (parsing de HTML)
- APScheduler (agendamento de tarefas)

**Segurança**
- Autenticação via OpenID Connect (OIDC)
- Sessões armazenadas no banco de dados
- Cookies HTTP-only e configuração segura

---

## 8. Formatos de Arquivo Suportados

| Formato | Extensão | Origem Comum | O que é Extraído |
|---|---|---|---|
| SPED Fiscal | `.txt` | ERP / Contador | Produtos, NCMs, CFOP, valores |
| NF-e | `.xml` | Emissão de NF | Produtos, NCMs, volumes, preços |
| Planilha | `.csv` | Exportação manual | Colunas configuráveis de NCM e produto |

---

## 9. Benefícios Quantificáveis

| Antes (Processo Manual) | Depois (TributAI) |
|---|---|
| Horas para analisar um arquivo SPED | Minutos com processamento automático |
| Consulta manual de alíquotas por NCM | Cálculo instantâneo com base de regras |
| Risco de usar alíquotas desatualizadas | Monitoramento contínuo de legislação |
| Relatório feito manualmente | Exportação com um clique |
| Sem rastreabilidade de quem validou | Registro completo de validações por usuário |

---

## 10. Status Atual — Fase Demo

### O que foi entregue e validado

- ✅ Autenticação segura com controle de perfis de acesso
- ✅ Upload e processamento de SPED, XML e CSV
- ✅ Extração automática de NCMs
- ✅ Cálculo automático de ICMS, IPI, PIS e COFINS
- ✅ Dashboard com visão consolidada e gráficos
- ✅ Tela de análise tributária com validação por consultor
- ✅ Módulo RPA configurado para Econet Editora e Receita Federal
- ✅ Sistema de alertas multi-canal (email e webhook)
- ✅ Painel de monitoramento RPA com dados em tempo real
- ✅ Exportação de relatórios

---

## 11. Roadmap — Fase de Produção

### Etapa 1 — Infraestrutura e Configuração (Semanas 1–2)
- Definição do ambiente de produção (cloud ou on-premises)
- Containerização com Docker
- Configuração de CI/CD
- Migração do banco de dados para produção
- Configuração de backup automático

### Etapa 2 — Integrações e Credenciais (Semanas 2–3)
- Configuração das credenciais de acesso ao Econet Editora
- Ativação dos alertas de email em produção
- Expansão do monitoramento para portais estaduais (SEFAZ por UF)
- Conexão real dos dados RPA (substituição de dados de demonstração)

### Etapa 3 — Usuários e Regras (Semanas 3–4)
- Cadastro dos usuários iniciais com definição de perfis
- Revisão e validação das regras tributárias com a equipe jurídica
- Ajuste das alíquotas específicas por tipo de produto/cliente
- Treinamento da equipe

### Etapa 4 — Testes e Homologação (Semana 5)
- Testes com arquivos fiscais reais
- Validação dos cálculos com a equipe tributária
- Ajustes e correções
- Homologação final

### Etapa 5 — Go Live (Semana 6)
- Lançamento em produção
- Monitoramento intensivo das primeiras semanas
- Suporte à equipe no uso do sistema

---

## 12. Pontos de Atenção e Decisões Pendentes

Os itens abaixo precisam ser definidos pelo time da Machado Schütz Advogados antes do início da fase de produção:

| # | Ponto | Responsável | Prazo Sugerido |
|---|---|---|---|
| 1 | Definir infraestrutura de cloud (Azure / AWS / on-premises) | TI / Gestão | Semana 1 |
| 2 | Fornecer credenciais de acesso ao Econet Editora | Equipe jurídica | Semana 2 |
| 3 | Definir lista de usuários e perfis de acesso | Gestão | Semana 2 |
| 4 | Validar base de regras tributárias por NCM | Equipe tributária | Semana 3 |
| 5 | Definir destinatários dos alertas legislativos por email | Gestão | Semana 2 |
| 6 | Definir UFs prioritárias para monitoramento de ICMS | Equipe tributária | Semana 3 |

---

## 13. Glossário

| Termo | Significado |
|---|---|
| **NCM** | Nomenclatura Comum do Mercosul — código de 8 dígitos que classifica mercadorias |
| **SPED** | Sistema Público de Escrituração Digital — arquivo de obrigação fiscal |
| **NF-e** | Nota Fiscal eletrônica em formato XML |
| **ICMS** | Imposto sobre Circulação de Mercadorias e Serviços (estadual) |
| **IPI** | Imposto sobre Produtos Industrializados (federal) |
| **PIS** | Programa de Integração Social (federal) |
| **COFINS** | Contribuição para o Financiamento da Seguridade Social (federal) |
| **CFOP** | Código Fiscal de Operações e Prestações |
| **TIPI** | Tabela de Incidência do Imposto sobre Produtos Industrializados |
| **RPA** | Robotic Process Automation — automação de processos por robôs de software |
| **RICMS** | Regulamento do ICMS por estado |

---

*Documento elaborado para apresentação ao cliente — Machado Schütz Advogados*  
*TributAI © 2026 — Plataforma de Diagnóstico Tributário Automatizado*
