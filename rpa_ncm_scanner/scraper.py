import logging
import re
from datetime import datetime
from pathlib import Path
from typing import Optional

from playwright.sync_api import sync_playwright, Browser, BrowserContext, Page, Playwright

from .config import (
    ECONET_URL,
    HEADLESS,
    SESSION_FILE,
    SCREENSHOTS_DIR,
)
from .session_manager import load_cookies, save_cookies, is_session_valid

logger = logging.getLogger(__name__)

# Resultado possível de uma busca de NCM
NCM_STATUS_FOUND = "FOUND"
NCM_STATUS_NOT_FOUND = "NOT_FOUND"
NCM_STATUS_PARTIAL = "PARTIAL"


def _normalize_ncm(code: str) -> str:
    """Remove pontos e espaços de um código NCM, retorna apenas dígitos."""
    return re.sub(r"[.\s]", "", code).strip()


class EconetScraper:
    """
    Scraper Playwright para o portal Econet (econeteditora.com.br).

    Responsabilidades:
    - Gerenciar login com persistência de sessão (evita reCAPTCHA desnecessário)
    - Navegar para Federal > PIS/COFINS > Busca do Produto
    - Pesquisar NCMs e extrair HTML da aba Regra Geral
    """

    def __init__(
        self,
        headless: bool = HEADLESS,
        session_file: Path = SESSION_FILE,
    ) -> None:
        self._headless = headless
        self._session_file = session_file
        SCREENSHOTS_DIR.mkdir(parents=True, exist_ok=True)

        self._playwright: Optional[Playwright] = None
        self._browser: Optional[Browser] = None
        self._context: Optional[BrowserContext] = None
        self._page: Optional[Page] = None

    # ------------------------------------------------------------------
    # Ciclo de vida do browser
    # ------------------------------------------------------------------

    def _start_browser(self) -> None:
        """Inicia o Playwright e abre um contexto de browser."""
        self._playwright = sync_playwright().start()
        self._browser = self._playwright.chromium.launch(
            headless=self._headless,
            args=["--disable-blink-features=AutomationControlled"],
        )
        self._context = self._browser.new_context(
            viewport={"width": 1280, "height": 900},
            user_agent=(
                "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
                "AppleWebKit/537.36 (KHTML, like Gecko) "
                "Chrome/120.0.0.0 Safari/537.36"
            ),
        )
        self._page = self._context.new_page()
        logger.debug("Browser iniciado")

    def close(self) -> None:
        """Fecha o browser e encerra o Playwright."""
        if self._context:
            try:
                self._context.close()
            except Exception:
                pass
        if self._browser:
            try:
                self._browser.close()
            except Exception:
                pass
        if self._playwright:
            try:
                self._playwright.stop()
            except Exception:
                pass
        logger.debug("Browser encerrado")

    # ------------------------------------------------------------------
    # Screenshots de erro
    # ------------------------------------------------------------------

    def _screenshot_on_error(self, label: str) -> None:
        """Salva um screenshot para debug quando ocorre um erro."""
        if not self._page:
            return
        try:
            ts = datetime.now().strftime("%Y%m%d_%H%M%S")
            path = SCREENSHOTS_DIR / f"error_{label}_{ts}.png"
            self._page.screenshot(path=str(path))
            logger.warning(f"Screenshot salvo: {path}")
        except Exception as e:
            logger.debug(f"Não foi possível salvar screenshot: {e}")

    # ------------------------------------------------------------------
    # Login e gerenciamento de sessão
    # ------------------------------------------------------------------

    def login(self, username: str, password: str) -> None:
        """
        Faz login no Econet com gerenciamento de sessão persistida.

        Fluxo:
        1. Tenta carregar cookies salvos
        2. Verifica se a sessão ainda é válida
        3. Se inválida: executa o fluxo de login completo (reCAPTCHA manual)
        4. Salva cookies após login bem-sucedido
        """
        if not self._browser:
            self._start_browser()

        # Tenta reutilizar sessão existente
        session_loaded = load_cookies(self._context)
        if session_loaded and is_session_valid(self._page):
            logger.info("Sessão reutilizada com sucesso — login pulado")
            return

        logger.info("Iniciando fluxo de login no Econet...")
        self._do_login(username, password)
        save_cookies(self._context)
        logger.info("Login concluído e sessão salva")

    def _do_login(self, username: str, password: str) -> None:
        """
        Executa o login real no Econet.

        O login está num modal que abre ao clicar no botão "Entrar" no topo direito.
        Após preencher credenciais, o reCAPTCHA pode exigir interação humana.
        """
        page = self._page
        page.goto(ECONET_URL, wait_until="domcontentloaded", timeout=30_000)
        logger.info(f"Acessou {ECONET_URL}")
        
        # Aguarda página carregar (permite JS executar)
        import time
        time.sleep(3)  # Pequeno delay para JS inicializar
        
        # Clica no botão "Entrar" no topo direito para abrir modal de login
        logger.info("Procurando botão 'Entrar' no topo direito...")
        entrar_selectors = [
            "a:has-text('Entrar')",
            "button:has-text('Entrar')",
            "a[href='#']:has-text('Entrar')",
            ".btn-entrar",
            "[class*='Entrar']",
        ]
        
        modal_opened = False
        for selector in entrar_selectors:
            try:
                button = page.locator(selector)
                # Procura especificamente no topo direito (coordenadas estimadas)
                count = button.count()
                if count > 0:
                    # Tenta o último "Entrar" que é provavelmente o do topo direito
                    button.last.wait_for(state="visible", timeout=5_000)
                    logger.info(f"Botão 'Entrar' encontrado, clicando...")
                    button.last.click()
                    modal_opened = True
                    break
            except Exception as e:
                logger.debug(f"Seletor {selector} falhou: {e}")
                continue
        
        if not modal_opened:
            logger.error("Botão 'Entrar' não encontrado!")
            self._screenshot_on_error("login_button_not_found")
            raise RuntimeError("Botão 'Entrar' não encontrado no topo da página")
        
        logger.info("Modal de login deve estar aberto. Aguardando campos...")
        time.sleep(2)  # Aguarda modal aparecer e animar
        
        # Aguarda campos de login ficarem visíveis
        logger.info("Aguardando campos de login ficarem visíveis...")
        try:
            page.locator("input[placeholder*='Código'], input[placeholder*='CPF']").first.wait_for(state="visible", timeout=15_000)
            page.locator("input[placeholder*='Senha'], input[type='password']").first.wait_for(state="visible", timeout=15_000)
        except Exception as e:
            logger.error(f"Erro aguardando campos: {e}")
            self._screenshot_on_error("login_modal_fields_not_visible")
            raise

        # Preenche Código/CPF
        logger.info("Preenchendo código/CPF...")
        page.locator("input[placeholder*='Código'], input[placeholder*='CPF']").first.fill(username)

        # Preenche senha
        logger.info("Preenchendo senha...")
        page.locator("input[placeholder*='Senha'], input[type='password']").first.fill(password)

        logger.info(
            "Credenciais preenchidas. Se o reCAPTCHA aparecer, resolva-o manualmente no browser..."
        )
        
        # Tira screenshot antes de enviar
        self._screenshot_on_error("login_before_submit")
        
        # Tenta resolver reCAPTCHA (pode exigir interação manual)
        logger.info("Procurando reCAPTCHA...")
        try:
            # Tenta clicar no checkbox "Não sou um robô"
            recaptcha_checkbox = page.locator("div[role='img'][aria-label*='recaptcha'], iframe[src*='recaptcha']").first
            if recaptcha_checkbox.count() > 0:
                logger.info("reCAPTCHA detectado. Tentando interação automática...")
                # Clica no checkbox reCAPTCHA
                page.locator("div[role='presentation'] iframe").first.evaluate("el => el.click()")
            
            # Aguarda até 120 segundos para o usuário resolver o reCAPTCHA manualmente
            logger.info("Aguardando resolução do reCAPTCHA (até 2 minutos)...")
            page.wait_for_function(
                """() => {
                    const recaptchaButton = document.querySelector('[aria-label*="não verificado"]');
                    const verificadoSpan = document.querySelector('[aria-label*="verificado"]');
                    return verificadoSpan !== null;
                }""",
                timeout=120_000
            )
            logger.info("✅ reCAPTCHA aparentemente resolvido")
        except Exception as e:
            logger.warning(f"reCAPTCHA check timeout ou erro: {e}. Prosseguindo mesmo assim...")

        # Clica em "Entrar" / "Login"
        logger.info("Procurando botão de envio...")
        submit_selectors = [
            "button:has-text('Entrar')",
            "button[type='submit']",
            "input[type='submit']",
            "button:has-text('Login')",
            ".btn-entrar",
        ]
        
        submit_found = False
        for selector in submit_selectors:
            try:
                buttons = page.locator(selector)
                count = buttons.count()
                if count > 0:
                    # Procura especificamente dentro do modal
                    for i in range(count):
                        button = buttons.nth(i)
                        try:
                            if button.is_visible(timeout=3_000):
                                logger.info(f"Botão de envio encontrado: {selector} (index {i})")
                                button.click()
                                submit_found = True
                                break
                        except Exception:
                            continue
                    if submit_found:
                        break
            except Exception as e:
                logger.debug(f"Erro com seletor {selector}: {e}")
                continue
        
        if not submit_found:
            logger.error("Nenhum botão de envio encontrado!")
            self._screenshot_on_error("login_submit_button_not_found")
            raise RuntimeError("Botão de envio do formulário não encontrado")

        logger.info("Botão clicado. Aguardando resolução do reCAPTCHA (se houver)...")
        
        # Aguarda navegação pós-login: o menu "Federal" deve aparecer
        # Aumentado para 120s pois o reCAPTCHA pode exigir intervenção manual
        try:
            page.wait_for_selector("text=Federal", state="visible", timeout=120_000)
            logger.info("✅ Login bem-sucedido — menu Federal detectado")
        except Exception:
            self._screenshot_on_error("login_failed")
            raise RuntimeError(
                "Login falhou ou timeout aguardando confirmação de login. "
                "Verifique credenciais ou se o reCAPTCHA precisou de resolução manual."
            )

    # ------------------------------------------------------------------
    # Navegação principal
    # ------------------------------------------------------------------

    def _navigate_to_pis_cofins_search(self) -> None:
        """
        Navega para Federal > PIS/COFINS > Busca do Produto.
        A URL não muda (SPA), então usamos wait_for_selector para cada etapa.
        """
        page = self._page

        # 1. Clicar em "Federal" no menu lateral
        page.locator("text=Federal").first.click()
        logger.debug("Clicou em Federal")

        # 2. Aguardar e clicar em PIS/COFINS no submenu
        page.wait_for_selector("text=PIS/COFINS", state="visible", timeout=15_000)
        page.locator("text=PIS/COFINS").first.click()
        logger.debug("Clicou em PIS/COFINS")

        # 3. Aguardar e clicar na aba "Busca do Produto"
        page.wait_for_selector("text=Busca do Produto", state="visible", timeout=15_000)
        page.locator("text=Busca do Produto").first.click()
        logger.debug("Clicou em Busca do Produto")

        # Aguarda o formulário de busca aparecer
        page.wait_for_selector(
            "input[name='ncm'], input[placeholder*='NCM'], input[placeholder*='ncm']",
            state="visible",
            timeout=15_000,
        )
        logger.debug("Formulário de busca de NCM visível")

    def _fill_ncm_search_form(self, ncm_code: str) -> None:
        """
        Preenche o formulário de busca com o código NCM.
        Seleciona o radio button "NCM" e clica em Pesquisar.
        """
        page = self._page
        normalized = _normalize_ncm(ncm_code)

        # Selecionar radio button "NCM" (não "Palavra-chave")
        try:
            ncm_radio = page.locator(
                "input[type='radio'][value='ncm'], input[type='radio'][value='NCM'], "
                "input[type='radio'] + label:has-text('NCM')"
            ).first
            ncm_radio.click()
            logger.debug("Radio button NCM selecionado")
        except Exception:
            # Tenta via label
            try:
                page.locator("label:has-text('NCM')").first.click()
                logger.debug("Radio button NCM selecionado via label")
            except Exception as e:
                logger.warning(f"Não conseguiu selecionar radio NCM: {e}")

        # Preenche o campo de código NCM
        ncm_input = page.locator(
            "input[name='ncm'], input[placeholder*='NCM'], input[placeholder*='ncm'], "
            "input[name='codigo']"
        ).first
        ncm_input.clear()
        ncm_input.fill(normalized)
        logger.debug(f"NCM preenchido: {normalized}")

        # Clica em Pesquisar
        page.locator(
            "button:has-text('Pesquisar'), input[type='submit'][value*='Pesquisar'], "
            "button[type='submit']"
        ).first.click()
        logger.debug("Clicou em Pesquisar")

        # Aguarda os resultados ou a mensagem "Nenhum Registro Encontrado"
        page.wait_for_load_state("networkidle", timeout=20_000)

    def _select_ncm_from_results(self, ncm_code: str) -> dict:
        """
        Após a pesquisa, analisa os resultados e seleciona o NCM correto.

        O Econet exibe a hierarquia completa da árvore NCM.
        Apenas itens folha (8 dígitos completos) têm radio button.

        Retorna:
            dict com keys: status, matched_ncm, html_content
        """
        page = self._page
        normalized_target = _normalize_ncm(ncm_code)

        # Verificar se não há resultados
        page_text = page.inner_text("body")
        if "Nenhum Registro Encontrado" in page_text or "nenhum registro" in page_text.lower():
            logger.info(f"NCM {ncm_code}: Nenhum registro encontrado no Econet")
            return {
                "status": NCM_STATUS_NOT_FOUND,
                "matched_ncm": None,
                "html_content": None,
            }

        # Coletar todos os radio buttons da lista de resultados
        radios = page.locator("input[type='radio']").all()
        if not radios:
            logger.warning(f"NCM {ncm_code}: resultados sem radio buttons")
            return {
                "status": NCM_STATUS_NOT_FOUND,
                "matched_ncm": None,
                "html_content": None,
            }

        # Estratégia 1: match exato de 8 dígitos
        exact_match = None
        best_partial = None
        best_partial_ncm = None
        best_score = 0

        for radio in radios:
            radio_value = radio.get_attribute("value") or ""
            radio_norm = _normalize_ncm(radio_value)

            # Tenta obter o label/texto associado ao radio
            radio_id = radio.get_attribute("id") or ""
            if radio_id:
                label_text = ""
                try:
                    label_text = page.locator(f"label[for='{radio_id}']").inner_text()
                except Exception:
                    pass
                label_norm = _normalize_ncm(label_text)
            else:
                label_norm = radio_norm

            # Verificar match exato (compara value e label)
            candidate = radio_norm or label_norm
            if candidate == normalized_target:
                exact_match = radio
                logger.debug(f"Match exato encontrado: {radio_value}")
                break

            # Calcular score de match parcial (quantidade de dígitos iniciais coincidentes)
            score = 0
            for a, b in zip(candidate, normalized_target):
                if a == b:
                    score += 1
                else:
                    break
            if score > best_score and score >= 4:
                best_score = score
                best_partial = radio
                best_partial_ncm = radio_value or label_text

        if exact_match:
            exact_match.click()
            logger.info(f"NCM {ncm_code}: match exato selecionado")
            matched = ncm_code
            status = NCM_STATUS_FOUND
        elif best_partial:
            best_partial.click()
            logger.info(
                f"NCM {ncm_code}: match parcial selecionado — {best_partial_ncm} "
                f"(score {best_score})"
            )
            matched = best_partial_ncm
            status = NCM_STATUS_PARTIAL
        else:
            logger.info(f"NCM {ncm_code}: sem match adequado na lista")
            return {
                "status": NCM_STATUS_NOT_FOUND,
                "matched_ncm": None,
                "html_content": None,
            }

        # Confirma seleção (pode haver botão "Ver" ou "Consultar")
        try:
            page.locator(
                "button:has-text('Consultar'), button:has-text('Ver'), "
                "input[type='submit'][value*='Consultar']"
            ).first.click(timeout=5_000)
            logger.debug("Clicou no botão de confirmação após seleção")
        except Exception:
            # Alguns portais confirma com duplo-clique ou não precisa de botão extra
            logger.debug("Nenhum botão de confirmação extra detectado")

        # Aguarda a aba Regra Geral carregar
        page.wait_for_load_state("networkidle", timeout=20_000)

        # Extrai HTML da seção visível (aba Regra Geral abre por padrão)
        html_content = self._extract_regra_geral_html()

        return {
            "status": status,
            "matched_ncm": matched,
            "html_content": html_content,
        }

    def _extract_regra_geral_html(self) -> str:
        """
        Extrai o HTML da aba/seção Regra Geral.
        Esta aba já abre por padrão após selecionar o NCM.
        """
        page = self._page

        # Tenta localizar a seção da Regra Geral por texto ou classe
        selectors = [
            "[class*='regra-geral']",
            "[id*='regra-geral']",
            "[class*='resultado']",
            "[id*='resultado']",
            "table",  # fallback: tabela de alíquotas
        ]

        for selector in selectors:
            try:
                element = page.locator(selector).first
                element.wait_for(state="visible", timeout=5_000)
                html = element.inner_html()
                if html.strip():
                    logger.debug(f"HTML extraído via seletor: {selector}")
                    return html
            except Exception:
                continue

        # Último fallback: body completo
        logger.warning("Usando body completo como fallback para extração de HTML")
        return page.inner_html("body")

    # ------------------------------------------------------------------
    # API pública de busca
    # ------------------------------------------------------------------

    def search_ncm(self, ncm_code: str) -> dict:
        """
        Busca um NCM no Econet e retorna os dados brutos.

        Args:
            ncm_code: Código NCM a ser buscado (com ou sem pontos)

        Returns:
            dict com:
                - status: "FOUND" | "NOT_FOUND" | "PARTIAL"
                - ncm_found: código NCM como informado pelo usuário
                - matched_ncm: código que efetivamente foi selecionado no Econet
                - html_content: HTML bruto da aba Regra Geral (None se NOT_FOUND)
        """
        if not self._page:
            raise RuntimeError("Browser não iniciado — chame login() primeiro")

        normalized = _normalize_ncm(ncm_code)
        logger.info(f"Buscando NCM: {normalized}")

        try:
            self._navigate_to_pis_cofins_search()
            self._fill_ncm_search_form(normalized)
            result = self._select_ncm_from_results(normalized)

            return {
                "status": result["status"],
                "ncm_found": ncm_code,
                "matched_ncm": result.get("matched_ncm"),
                "html_content": result.get("html_content"),
            }

        except Exception as e:
            self._screenshot_on_error(f"ncm_{normalized}")
            logger.error(f"Erro ao buscar NCM {ncm_code}: {e}", exc_info=True)
            raise
