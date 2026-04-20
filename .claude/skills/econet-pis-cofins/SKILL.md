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
- O usuário quer verificar se houve mudanças nas alíquotas de NCMs já cadastrados
- O usuário quer agendar a extração de dados fiscais de forma autônoma

## Funções Disponíveis

A skill expõe **duas funções** que podem ser chamadas diretamente no chat:

### buscar-incompletos
Busca apenas os NCMs que ainda não têm dados preenchidos no Excel (coluna B ou PIS vazios).
**Uso padrão — não sobrescreve dados existentes.**

> Exemplos de como chamar:
> - `/econet-pis-cofins buscar-incompletos`
> - `/econet-pis-cofins` *(sem argumento — comportamento padrão)*
> - `/econet-pis-cofins busque os ncms que estão sem informações`
> - `/econet-pis-cofins preencha os ncms novos`

**Comando executado:**
```bash
python econet_scraper.py
```

---

### buscar-todos
Busca **todos** os NCMs do Excel, incluindo os já preenchidos. Compara os dados retornados
com o que estava salvo e registra qualquer mudança no sheet **Histórico** do `bcoDados.xlsx`.

> Exemplos de como chamar:
> - `/econet-pis-cofins buscar-todos`
> - `/econet-pis-cofins verifique se houve mudanças nas alíquotas`
> - `/econet-pis-cofins atualizar todos os ncms`
> - `/econet-pis-cofins checar atualizações`

**Comando executado:**
```bash
python econet_scraper.py --todos
```

**O que acontece no modo --todos:**
1. Lê snapshot dos dados atuais antes de buscar
2. Busca todos os NCMs no Econet
3. Compara campo a campo com o snapshot anterior
4. Se houver mudança → registra no sheet **Histórico** com: Data/Hora, NCM, Campo, Valor Anterior, Valor Novo
5. Se não houver mudança → informa que tudo está atualizado

---

## Lógica de Decisão para o Assistente

Ao receber um argumento na skill, identifique a intenção:

- Palavras como "incompletos", "sem dados", "novos", "faltando", "preencher" → **buscar-incompletos**
- Palavras como "todos", "atualizar", "verificar mudanças", "checar", "comparar", "histórico" → **buscar-todos**
- Sem argumento ou argumento ambíguo → **buscar-incompletos** (padrão)

---

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
| `econet_scraper.py` | Script principal |
| `bcoDados.xlsx` | Input (col A = NCMs) + Output (cols B-I) + Sheet Histórico |
| `session.json` | Sessão salva após 1º login (gerado automaticamente) |
| `bcoDados_resultado.xlsx` | Fallback quando o Excel original está aberto |

## Fluxo de Execução

**1ª execução (sem `session.json`):**
1. Abre Chrome **visível**
2. Navega até `https://www.econeteditora.com.br/`
3. Preenche usuário e senha automaticamente (digitação humanizada)
4. Tenta resolver reCAPTCHA automaticamente
5. Se reCAPTCHA exigir desafio → aguarda resolução manual
6. Salva sessão em `session.json`
7. Navega: Federal → PIS/COFINS → Busca do Produto
8. Loop pelos NCMs: busca → seleciona → extrai → grava

**Execuções seguintes (com `session.json`):**
- Roda **headless** sem login nem reCAPTCHA
- Ideal para agendamento autônomo

## Estrutura do Excel (bcoDados.xlsx)

### Sheet Plan1 — Dados

| Col | Campo |
|-----|-------|
| A | NCM (input) |
| B | NCM Econet (ex: 8471.41.90) |
| C | Descrição do produto |
| D | PIS Cumulativo (%) |
| E | COFINS Cumulativo (%) |
| F | PIS Não Cumulativo (%) |
| G | COFINS Não Cumulativo (%) |
| H | Regime tributário |
| I | Legislação |

### Sheet Histórico — Mudanças detectadas (modo --todos)

| Col | Campo |
|-----|-------|
| A | Data/Hora da verificação |
| B | NCM |
| C | Campo que mudou |
| D | Valor Anterior |
| E | Valor Novo |

## Credenciais Padrão

```python
ECONET_URL = "https://www.econeteditora.com.br/"
LOGIN      = "onu41041"
SENHA      = "ms6003"
```

> Alterar no topo do `econet_scraper.py` se as credenciais mudarem.

## Regimes Detectados

| Regime | Exemplo |
|--------|---------|
| Cumulativo / Não Cumulativo | Computadores, plásticos, vestuário |
| Monofásico | Automóveis, medicamentos, impressoras |
| Bebidas Frias (Monofásico) | Refrigerantes, cervejas |

## Tratamento de Erros

| Erro | Solução automática |
|------|--------------------|
| `PermissionError` lendo Excel | Lê via cópia temporária |
| `PermissionError` salvando Excel | Salva em `bcoDados_resultado.xlsx` |
| Sessão expirada | Detecta e refaz login automaticamente |
| reCAPTCHA com desafio | Aguarda resolução manual no browser visível |
| NCM retorna dados vazios | Detectado pelo filtro PIS vazio — retentado na próxima execução |

## Agendamento (Windows Task Scheduler)

Após a 1ª execução com `session.json` criado:

- **Programa:** `python`
- **Argumentos:** `econet_scraper.py` ou `econet_scraper.py --todos`
- **Diretório:** caminho completo do projeto
