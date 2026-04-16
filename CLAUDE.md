# Econet Editora — Scraper PIS/COFINS por NCM

## Visão Geral
Automação completa para extração de alíquotas PIS/COFINS da plataforma Econet Editora,
buscando por código NCM e gravando os resultados em Excel. Desenvolvido para execução
autônoma agendada (sem interação humana após a primeira execução).

---

## Arquivos do Projeto

| Arquivo | Descrição |
|---------|-----------|
| `econet_scraper.py` | Script principal de automação |
| `bcoDados.xlsx` | Input (coluna A = NCMs) e output (colunas B-I) |
| `session.json` | Sessão Playwright salva após 1º login (gerado automaticamente) |
| `bcoDados_resultado.xlsx` | Fallback quando bcoDados.xlsx está aberto/bloqueado |

---

## Credenciais Econet
- **Usuário:** `onu41041`
- **Senha:** `ms6003`
- **URL:** `https://www.econeteditora.com.br/`

---

## Estrutura do Excel (bcoDados.xlsx)

- **Sheet:** `Plan1`
- **Coluna A:** NCM (input — 5 códigos: 84714190, 39269090, 61091000, 87032110, 22021000)
- **Colunas B-I:** Saída gerada pelo scraper

| Col | Campo |
|-----|-------|
| B | NCM Econet (formatado ex: 8471.41.90) |
| C | Descrição do produto |
| D | PIS Cumulativo (%) |
| E | COFINS Cumulativo (%) |
| F | PIS Não Cumulativo (%) |
| G | COFINS Não Cumulativo (%) |
| H | Regime |
| I | Legislação |

---

## Fluxo de Execução

### 1ª Execução (sem session.json)
1. Abre Chrome **visível**
2. Navega até Econet e preenche usuário/senha automaticamente
3. Tenta resolver reCAPTCHA automaticamente (browser real, não headless)
4. Se reCAPTCHA exigir desafio manual → aguarda o usuário resolver e clicar Entrar
5. Salva sessão em `session.json`
6. Navega: Federal → PIS/COFINS → Busca do Produto
7. Loop pelos 5 NCMs: busca → seleciona → extrai → grava
8. Salva resultados no Excel

### Execuções Seguintes (com session.json)
1. Carrega sessão salva — **sem login, sem reCAPTCHA, headless**
2. Verifica validade da sessão (se expirada, refaz login)
3. Executa loop de NCMs normalmente

---

## Arquitetura Técnica

### Stack
- **Playwright** (async) — automação do browser
- **openpyxl** — leitura e escrita do Excel
- **Python 3.14** no Windows

### Estrutura de iframes do Econet
O conteúdo PIS/COFINS fica em iframes aninhados:
```
Página principal
  └── #alvo (iframe f1)
        └── iframe f2 (pis_cofins.php)
              └── Conteúdo com abas: Regra Geral, ZFM, Exportação...
```

### Filtro de visibilidade
Todas as abas (Regra Geral, ZFM, Exportação, etc.) existem no DOM simultaneamente.
O scraper usa `getComputedStyle` para filtrar apenas linhas visíveis, evitando
capturar dados de abas ocultas (ex: ZFM que tem 0,00%).

### Recarga entre NCMs
Em vez de navegar pela UI para voltar ao formulário, captura-se o `src` do iframe f2
e recarrega diretamente: `f2.src = busca_src`. Isso garante reset confiável entre buscas.

---

## Regimes Detectados

| Regime | Descrição | Exemplo NCM |
|--------|-----------|-------------|
| Cumulativo / Não Cumulativo | Alíquotas separadas por regime | 8471.41.90 (computadores) |
| Monofásico | Alíquota única — detectado por "Monofásico" no body | 8703.21.10 (automóveis) |
| Bebidas Frias (Monofásico) | Tabela de 6 colunas — PIS na col 5, COFINS na col 6 | 2202.10.00 (refrigerantes) |

---

## Resultados Validados

| NCM | Descrição | PIS | COFINS | Regime |
|-----|-----------|-----|--------|--------|
| 8471.41.90 | Computadores | 0,65% | 3,00% | Cumulativo / Não Cumulativo |
| 3926.90.90 | Plásticos | 0,65% | 3,00% | Cumulativo / Não Cumulativo |
| 6109.10.00 | Vestuário | 0,65% | 3,00% | Cumulativo / Não Cumulativo |
| 8703.21.10 | Automóveis | 2,00% | 9,60% | Monofásico |
| 2202.10.00 | Bebidas Frias | 1,86% | 8,54% | Bebidas Frias (Monofásico) |

---

## Como Executar

```bash
# Instalar dependências (uma vez)
pip install playwright openpyxl
playwright install chromium

# Rodar
python econet_scraper.py
```

### Para forçar novo login (apagar sessão)
```bash
# Windows
del session.json

# Linux/Mac
rm session.json
```

---

## Agendamento (Task Scheduler Windows)

Após a 1ª execução (session.json criado), o script roda totalmente headless.
Configurar no Task Scheduler:
- **Programa:** `python`
- **Argumentos:** `econet_scraper.py`
- **Pasta:** `C:\Users\VitorVeloso\OneDrive - InMinds Technology\Documentos\InMinds\core_teste`

---

## Problemas Conhecidos e Soluções

| Problema | Causa | Solução |
|----------|-------|---------|
| `PermissionError` ao ler Excel | Arquivo aberto no Excel | Leitura via cópia temporária com `shutil.copy2` |
| `PermissionError` ao salvar Excel | Arquivo aberto no Excel | Salva em `bcoDados_resultado.xlsx` como fallback |
| reCAPTCHA exige desafio | Google detectou automação | Browser real (não headless) + aguarda interação manual |
| Sessão expirada | Token venceu | Script detecta e refaz login automaticamente |
| `UnicodeEncodeError` no terminal | Windows cp1252 | stdout/stderr redirecionados para UTF-8 no início do script |
