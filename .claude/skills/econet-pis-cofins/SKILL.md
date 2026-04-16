---
name: econet-pis-cofins
description: Extrai alíquotas PIS/COFINS por NCM da Econet Editora e grava no Excel
license: LICENSE-CC-BY-NC-SA 4.0 in LICENSE.txt
author: Vitor Veloso — InMinds Technology
---

# Econet PIS/COFINS Scraper

Automação completa para extração de alíquotas PIS/COFINS da plataforma Econet Editora,
buscando por código NCM e gravando os resultados em Excel. Execução autônoma após
a primeira configuração — sem interação humana, pronto para agendamento.

## Quando usar esta Skill

- O usuário quer buscar alíquotas PIS/COFINS para um ou mais NCMs
- O usuário menciona "Econet", "PIS/COFINS", "NCM" em conjunto com extração/automação
- O usuário precisa atualizar uma planilha com dados tributários da Econet Editora
- O usuário quer agendar a extração de dados fiscais de forma autônoma

## Pré-requisitos

```bash
pip install playwright openpyxl
playwright install chromium
```

- Credenciais válidas na Econet Editora
- Arquivo `bcoDados.xlsx` com NCMs na coluna A (Sheet: Plan1)
- Python 3.10+

## Arquivos do Projeto

| Arquivo | Descrição |
|---------|-----------|
| `econet_scraper.py` | Script principal — única execução necessária |
| `bcoDados.xlsx` | Input (col A = NCMs) + Output (cols B-I) |
| `session.json` | Sessão salva após 1º login (gerado automaticamente) |
| `bcoDados_resultado.xlsx` | Fallback quando o Excel original está aberto |

## Workflow

### Etapa 1 — Verificar dependências e arquivo Excel
1. Confirmar que `playwright` e `openpyxl` estão instalados
2. Verificar que `bcoDados.xlsx` existe com NCMs na coluna A
3. Se o arquivo não existir, criá-lo com os NCMs informados pelo usuário

### Etapa 2 — Executar o scraper
```bash
python econet_scraper.py
```

**Fluxo da 1ª execução (sem `session.json`):**
1. Abre Chrome **visível**
2. Navega até `https://www.econeteditora.com.br/`
3. Preenche usuário e senha automaticamente
4. Tenta resolver reCAPTCHA automaticamente (browser real, não headless)
5. Se reCAPTCHA exigir desafio → aguarda resolução manual + detecta fechamento do modal
6. Salva sessão em `session.json`
7. Navega: Federal → PIS/COFINS → Busca do Produto
8. Loop pelos NCMs: busca → seleciona → extrai → grava
9. Salva resultados no Excel

**Execuções seguintes (com `session.json`):**
- Roda **headless** sem login nem reCAPTCHA
- Ideal para agendamento autônomo

### Etapa 3 — Verificar resultados
Abrir `bcoDados.xlsx` e confirmar colunas B-I preenchidas:

| Col | Campo |
|-----|-------|
| B | NCM Econet (ex: 8471.41.90) |
| C | Descrição do produto |
| D | PIS Cumulativo (%) |
| E | COFINS Cumulativo (%) |
| F | PIS Não Cumulativo (%) |
| G | COFINS Não Cumulativo (%) |
| H | Regime tributário |
| I | Legislação |

### Etapa 4 — Forçar novo login (se necessário)
```bash
rm session.json   # Linux/Mac
del session.json  # Windows CMD
```
Na próxima execução, o fluxo completo de login será repetido.

## Credenciais Padrão

```python
ECONET_URL = "https://www.econeteditora.com.br/"
LOGIN      = "onu41041"
SENHA      = "ms6003"
```

> Alterar no topo do `econet_scraper.py` se as credenciais mudarem.

## Regimes Detectados

| Regime | Como é detectado | Exemplo |
|--------|-----------------|---------|
| Cumulativo / Não Cumulativo | Linhas com "Cumulativo" e "Não Cumulativo" na tabela | Computadores, plásticos |
| Monofásico | Texto "Monofásico" visível no corpo da página | Automóveis |
| Bebidas Frias (Monofásico) | Texto "Bebidas Frias" + tabela de 6 colunas | Refrigerantes |

## Detalhes Técnicos Importantes

### Estrutura de iframes do Econet
```
Página principal
  └── #alvo (iframe f1)
        └── iframe f2 (pis_cofins.php)
              └── Abas: Regra Geral, ZFM, Exportação...
```

### Filtro de visibilidade
O Econet mantém TODAS as abas no DOM simultaneamente (ZFM, Exportação etc.).
O scraper usa `getComputedStyle` para ignorar linhas ocultas e capturar
apenas dados da aba ativa (Regra Geral).

### Reset entre buscas
Em vez de navegar pela UI para voltar ao formulário, o script captura o `src`
do iframe f2 e recarrega diretamente — reset confiável sem cliques na UI.

## Tratamento de Erros

| Erro | Causa | Solução automática |
|------|-------|-------------------|
| `PermissionError` lendo Excel | Arquivo aberto no Excel | Lê via cópia temporária |
| `PermissionError` salvando Excel | Arquivo aberto no Excel | Salva em `bcoDados_resultado.xlsx` |
| Sessão expirada | Token venceu | Detecta e refaz login automaticamente |
| reCAPTCHA com desafio | Google detectou automação | Aguarda resolução manual no browser visível |
| `UnicodeEncodeError` | Terminal Windows cp1252 | stdout/stderr redirecionados para UTF-8 |

## Agendamento (Windows Task Scheduler)

Após a 1ª execução com `session.json` criado:

- **Programa:** `python`
- **Argumentos:** `econet_scraper.py`
- **Diretório:** caminho completo do projeto
- **Frequência recomendada:** diária ou semanal conforme necessidade do cliente

## Resultados Validados

| NCM | PIS | COFINS | Regime |
|-----|-----|--------|--------|
| 8471.41.90 | 0,65% | 3,00% | Cumulativo / Não Cumulativo |
| 3926.90.90 | 0,65% | 3,00% | Cumulativo / Não Cumulativo |
| 6109.10.00 | 0,65% | 3,00% | Cumulativo / Não Cumulativo |
| 8703.21.10 | 2,00% | 9,60% | Monofásico |
| 2202.10.00 | 1,86% | 8,54% | Bebidas Frias (Monofásico) |
