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
    Verifica se a sessão ainda está ativa navegando para o Econet e
    checando se há elemento que só aparece quando o usuário está logado.

    O Econet exibe um menu ou área de usuário após login bem-sucedido.
    Quando não logado, exibe o formulário de login na home.
    """
    try:
        page.goto(ECONET_URL, wait_until="domcontentloaded", timeout=30_000)

        # Após login, o menu lateral com "Federal", "Estadual" etc. fica visível.
        # Tenta localizar o link/botão "Federal" que só existe na área logada.
        # Ajuste o seletor conforme o HTML real do Econet.
        federal_link = page.locator("text=Federal").first
        federal_link.wait_for(state="visible", timeout=8_000)
        logger.info("Sessão válida — usuário já está logado")
        return True
    except Exception:
        logger.info("Sessão inválida ou expirada — login necessário")
        return False
