import logging
from typing import Any

import httpx

from .config import NODE_API_URL, NODE_API_KEY

logger = logging.getLogger(__name__)

# Timeout padrão para chamadas à API Node.js local
_DEFAULT_TIMEOUT = 30.0

_HEADERS = {
    "Content-Type": "application/json",
    "x-internal-key": NODE_API_KEY,
}


def get_pending_ncms() -> list[dict[str, str]]:
    """
    Busca NCMs pendentes de varredura na API Node.js.

    GET /api/ncm-scan/pending

    Retorna lista de dicts com:
        - code: str  — código NCM (ex: "85171200")
        - description: str — descrição do produto (pode ser vazia)

    Em caso de erro, retorna lista vazia e loga o problema.
    """
    url = f"{NODE_API_URL}/api/ncm-scan/pending"
    try:
        with httpx.Client(timeout=_DEFAULT_TIMEOUT) as client:
            response = client.get(url, headers=_HEADERS)
            response.raise_for_status()
            data = response.json()

            if isinstance(data, list):
                logger.info(f"API retornou {len(data)} NCMs pendentes")
                return data
            elif isinstance(data, dict) and "items" in data:
                items = data["items"]
                logger.info(f"API retornou {len(items)} NCMs pendentes")
                return items
            else:
                logger.warning(f"Formato inesperado da API: {type(data)}")
                return []

    except httpx.HTTPStatusError as e:
        logger.error(
            f"Erro HTTP ao buscar NCMs pendentes: {e.response.status_code} — {e}"
        )
        return []
    except httpx.RequestError as e:
        logger.error(f"Erro de conexão com API Node.js ({url}): {e}")
        return []
    except Exception as e:
        logger.error(f"Erro inesperado ao buscar NCMs pendentes: {e}", exc_info=True)
        return []


def save_tribute_data(
    ncm_code: str,
    status: str,
    regras: list[dict[str, Any]],
    matched_ncm: str | None = None,
    descricao: str = "",
) -> bool:
    """
    Envia os dados tributários extraídos para a API Node.js salvar no banco.

    POST /api/ncm-scan/save

    Args:
        ncm_code: Código NCM original buscado
        status: "FOUND" | "NOT_FOUND" | "PARTIAL" | "ERROR"
        regras: Lista de regimes tributários com alíquotas de PIS/COFINS
        matched_ncm: Código efetivamente encontrado no Econet (pode diferir se PARTIAL)
        descricao: Descrição do produto extraída pelo Claude

    Returns:
        True se salvo com sucesso, False em caso de erro.
    """
    url = f"{NODE_API_URL}/api/ncm-scan/save"
    payload = {
        "ncmCode": ncm_code,
        "status": status,
        "matchedNcm": matched_ncm,
        "descricao": descricao,
        "regras": regras,
    }

    try:
        with httpx.Client(timeout=_DEFAULT_TIMEOUT) as client:
            response = client.post(url, headers=_HEADERS, json=payload)
            response.raise_for_status()
            logger.info(f"NCM {ncm_code} ({status}) salvo com sucesso na API")
            return True

    except httpx.HTTPStatusError as e:
        logger.error(
            f"Erro HTTP ao salvar NCM {ncm_code}: {e.response.status_code} — "
            f"{e.response.text[:200]}"
        )
        return False
    except httpx.RequestError as e:
        logger.error(f"Erro de conexão com API Node.js ({url}): {e}")
        return False
    except Exception as e:
        logger.error(f"Erro inesperado ao salvar NCM {ncm_code}: {e}", exc_info=True)
        return False
