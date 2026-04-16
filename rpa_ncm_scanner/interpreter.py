import json
import logging
import re
from typing import Any

import anthropic

from .config import ANTHROPIC_API_KEY

logger = logging.getLogger(__name__)

CLAUDE_MODEL = "claude-opus-4-5"

EXTRACTION_PROMPT = """\
Você é um especialista em tributação brasileira. Analise o HTML abaixo extraído do portal Econet \
e extraia as informações tributárias de PIS e COFINS para o NCM {ncm_code}.

Retorne SOMENTE um objeto JSON válido, sem markdown, sem explicações, sem texto adicional.
O JSON deve seguir exatamente esta estrutura:

{{
  "ncm": "<código NCM de 8 dígitos>",
  "descricao": "<descrição do produto>",
  "regras": [
    {{
      "regime": "<nome do regime>",
      "pis": <alíquota PIS como número decimal, ex: 0.65>,
      "cofins": <alíquota COFINS como número decimal, ex: 3.00>,
      "dispositivo_legal": "<lei/artigo de referência ou string vazia>"
    }}
  ]
}}

Regimes possíveis: "Simples Nacional", "Regime Cumulativo", "Regime Não Cumulativo".
Se um regime não estiver presente nos dados, não o inclua na lista.
Se as alíquotas estiverem em formato percentual (ex: "0,65%"), converta para decimal (0.65).
Se não conseguir extrair os dados, retorne: {{"ncm": "{ncm_code}", "descricao": "", "regras": []}}

HTML do Econet:
{html_content}
"""


def extract_tribute_data(html_content: str, ncm_code: str) -> dict[str, Any]:
    """
    Envia o HTML bruto do Econet para o Claude e extrai dados estruturados
    de PIS/COFINS para o NCM informado.

    Args:
        html_content: HTML da aba Regra Geral do Econet
        ncm_code: Código NCM para referência no prompt

    Returns:
        dict com ncm, descricao e lista de regras.
        Retorna dict vazio se Claude não conseguir extrair.
    """
    if not ANTHROPIC_API_KEY:
        logger.error("ANTHROPIC_API_KEY não configurada")
        return {}

    if not html_content or not html_content.strip():
        logger.warning(f"HTML vazio para NCM {ncm_code} — nada a interpretar")
        return {}

    # Trunca HTML muito longo para economizar tokens (Claude suporta ~200k mas
    # para extração de tabelas de alíquotas, os dados relevantes ficam no início)
    max_html_chars = 80_000
    if len(html_content) > max_html_chars:
        logger.debug(
            f"HTML truncado de {len(html_content)} para {max_html_chars} chars"
        )
        html_content = html_content[:max_html_chars]

    prompt = EXTRACTION_PROMPT.format(
        ncm_code=ncm_code,
        html_content=html_content,
    )

    try:
        client = anthropic.Anthropic(api_key=ANTHROPIC_API_KEY)
        message = client.messages.create(
            model=CLAUDE_MODEL,
            max_tokens=2048,
            messages=[
                {
                    "role": "user",
                    "content": prompt,
                }
            ],
        )

        response_text = message.content[0].text.strip()
        logger.debug(f"Resposta do Claude para NCM {ncm_code}: {response_text[:200]}...")

        # Extrai JSON da resposta (pode vir com ```json ``` mesmo pedindo sem)
        json_text = _extract_json_from_response(response_text)
        if not json_text:
            logger.warning(f"Claude não retornou JSON válido para NCM {ncm_code}")
            return {}

        data = json.loads(json_text)

        # Validação básica da estrutura
        if not isinstance(data, dict):
            logger.warning(f"Resposta do Claude não é um objeto para NCM {ncm_code}")
            return {}

        if "regras" not in data:
            data["regras"] = []

        logger.info(
            f"NCM {ncm_code}: extraídas {len(data.get('regras', []))} regras tributárias"
        )
        return data

    except json.JSONDecodeError as e:
        logger.error(f"JSON inválido retornado pelo Claude para NCM {ncm_code}: {e}")
        return {}
    except anthropic.APIError as e:
        logger.error(f"Erro na API Anthropic para NCM {ncm_code}: {e}")
        return {}
    except Exception as e:
        logger.error(
            f"Erro inesperado ao interpretar NCM {ncm_code}: {e}", exc_info=True
        )
        return {}


def _extract_json_from_response(text: str) -> str:
    """
    Extrai o bloco JSON de uma resposta do Claude.
    Lida com respostas que envolvem o JSON em markdown (```json ... ```).
    """
    # Remove bloco de código markdown se presente
    markdown_match = re.search(r"```(?:json)?\s*([\s\S]+?)\s*```", text)
    if markdown_match:
        return markdown_match.group(1).strip()

    # Tenta encontrar JSON diretamente (começa com { e termina com })
    json_match = re.search(r"\{[\s\S]+\}", text)
    if json_match:
        return json_match.group(0).strip()

    return text.strip()
