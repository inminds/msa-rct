# econet-pis-cofins

> Extrai alíquotas PIS/COFINS por NCM da Econet Editora e grava no Excel

## Introdução

Automação completa para extração de dados tributários PIS/COFINS da plataforma
**Econet Editora**, desenvolvida para o processo de consulta fiscal por código NCM.

O script realiza login automático (incluindo resolução de reCAPTCHA em browser real),
navega pela plataforma, extrai alíquotas e grava os resultados em Excel formatado.
Após a primeira execução, salva a sessão e roda de forma **totalmente autônoma**,
sem necessidade de interação humana — pronto para agendamento.

## Funcionalidades

- Login automático com credenciais configuráveis
- Resolução automática de reCAPTCHA (browser real, não headless)
- Fallback para reCAPTCHA manual com detecção automática de conclusão
- Persistência de sessão — sem reCAPTCHA nas execuções seguintes
- Filtro de visibilidade CSS para ignorar abas ocultas (ZFM, Exportação)
- Suporte a 3 regimes tributários: Cumulativo/Não Cumulativo, Monofásico, Bebidas Frias
- Tratamento de arquivo Excel bloqueado (arquivo aberto pelo usuário)
- Saída formatada com cabeçalhos coloridos e larguras de coluna ajustadas

## Início Rápido

```bash
# 1. Instalar dependências
pip install playwright openpyxl
playwright install chromium

# 2. Configurar credenciais no topo do script (se necessário)
# LOGIN = "onu41041" / SENHA = "ms6003"

# 3. Garantir que bcoDados.xlsx tem NCMs na coluna A

# 4. Executar
python econet_scraper.py
```

## Documentação Completa

Consulte [SKILL.md](SKILL.md) para o workflow detalhado, tratamento de erros
e instruções de agendamento.

## Licença

CC BY-NC-SA 4.0 — veja [LICENSE.txt](LICENSE.txt)
