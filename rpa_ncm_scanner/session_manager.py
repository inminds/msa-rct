import json
import logging
from pathlib import Path
from playwright.sync_api import BrowserContext, Page

from .config import SESSION_FILE, ECONET_URL

logger = logging.getLogger(__name__)


def save_cookies(context: BrowserContext) -> None:
    """Salva os cookies da sessão atual em arquivo JSON."""
    cookies = context.cookies()
    SESSION_FILE.parent.mkdir(parents=True, exist_ok=True)
    with open(SESSION_FILE, "w", encoding="utf-8") as f:
        json.dump(cookies, f, ensure_ascii=False, indent=2)
    logger.info(f"Sessão salva em {SESSION_FILE} ({len(cookies)} cookies)")


def load_cookies(context: BrowserContext) -> bool:
    """
    Carrega cookies do arquivo JSON para o contexto do browser.
    Retorna True se carregou com sucesso, False se o arquivo não existe.
    """
    if not SESSION_FILE.exists():
        logger.info("Arquivo de sessão não encontrado — login necessário")
        return False

    try:
        with open(SESSION_FILE, "r", encoding="utf-8") as f:
            cookies = json.load(f)

        if not cookies:
            logger.warning("Arquivo de sessão vazio — login necessário")
            return False

        context.add_cookies(cookies)
        logger.info(f"Sessão carregada: {len(cookies)} cookies restaurados")
        return True
    except (json.JSONDecodeError, KeyError, ValueError) as e:
        logger.warning(f"Falha ao carregar sessão: {e} — login necessário")
        return False


def is_session_valid(page: Page) -> bool:
    """
    Verifica se a sessão ainda está ativa navegando para o Econet.

    ATENÇÃO: O Econet mostra o menu lateral (Federal, Trabalhista, etc.) mesmo
    para usuários NÃO logados. O indicador real de sessão autenticada é a
    AUSÊNCIA do botão "Entrar" no header (que some após login) ou a presença
    de elementos exclusivos da área logada.

    Estratégia: se o botão "Entrar" estiver visível no header → NÃO está logado.
    """
    try:
        page.goto(ECONET_URL, wait_until="domcontentloaded", timeout=30_000)
        import time
        time.sleep(2)

        # Procura o link "Entrar" no header (visível quando NÃO logado)
        entrar_btn = page.get_by_role("link", name="Entrar")
        is_visible = entrar_btn.is_visible()

        if is_visible:
            logger.info("Sessão inválida — botão 'Entrar' ainda visível (não autenticado)")
            return False
        else:
            logger.info("Sessão válida — botão 'Entrar' ausente (autenticado)")
            return True
    except Exception as e:
        logger.info(f"Não foi possível verificar sessão: {e} — assumindo login necessário")
        return False
