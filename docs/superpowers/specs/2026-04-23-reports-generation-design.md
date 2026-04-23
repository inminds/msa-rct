# Design: Geração de Relatórios Tributários
**Data:** 2026-04-23  
**Status:** Aprovado

## Objetivo
Implementar a tela de Relatórios com geração real de arquivos (Excel e PDF), histórico persistido no banco, preview em modal e download.

## Relatórios disponíveis
| ID | Nome | Fonte de dados |
|----|------|---------------|
| `tax-summary` | Resumo Tributário | Excel bcoDados.xlsx |
| `ncm-analysis` | Análise Detalhada de NCMs | Excel bcoDados.xlsx |
| `trend-analysis` | Análise de Tendências | Tabela `ncm_changes` (SQLite) |
| `jurisdiction-report` | Por Competência | **Desabilitado (em breve)** |

## Banco de dados
Nova tabela `reports` no SQLite:
```sql
CREATE TABLE IF NOT EXISTS reports (
  id VARCHAR PRIMARY KEY,
  name TEXT NOT NULL,
  type VARCHAR NOT NULL,
  format VARCHAR NOT NULL,       -- 'xlsx' | 'pdf'
  status VARCHAR NOT NULL DEFAULT 'pending',  -- 'pending' | 'completed' | 'error'
  file_path TEXT,
  created_by VARCHAR,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  error_message TEXT
)
```

## Backend

### Novo serviço: `server/services/reportService.ts`
- `generateReport(id, type, format, rows)` — gera arquivo e salva em `.data/reports/<id>.<ext>`
- Conteúdo por tipo:
  - **tax-summary**: stats gerais + tabela NCM | Descrição | PIS Cum | COFINS Cum | Regime
  - **ncm-analysis**: tabela completa com todas as 8 colunas do Excel
  - **trend-analysis**: tabela ncm_changes — NCM | Campo | Antes | Depois | Data | Status

### Novos endpoints em `server/routes.ts`
| Método | Rota | Descrição |
|--------|------|-----------|
| `POST` | `/api/reports/generate` | Cria registro pending, dispara geração async |
| `GET` | `/api/reports` | Lista histórico (metadados) |
| `GET` | `/api/reports/:id/download` | Serve o arquivo |
| `GET` | `/api/reports/:id/preview` | Retorna JSON para modal |

## Frontend (`client/src/pages/Reports.tsx`)
- **Stats**: lidas de `/api/reports` (contagem real)
- **Botão "Gerar"**: abre `GenerateModal` (escolhe formato xlsx/pdf + nome) → chama POST → polling até completed
- **Botão "Visualizar"**: chama `/preview` → abre `PreviewModal` com tabela
- **Tabela histórico**: dados reais de `/api/reports`
- **Download**: botão chama `/download`
- Remover todos os dados mockados (`recentReports`, stat `247`)

## Formato dos arquivos
- **Excel**: `exceljs` — cabeçalho azul, linhas alternadas, auto-width nas colunas
- **PDF**: `pdfkit` — cabeçalho com nome do relatório e data, tabela com bordas, rodapé com paginação
