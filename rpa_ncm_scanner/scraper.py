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

        # Credenciais guardadas após login para uso no login inline durante navegação
        self._username: str = ""
        self._password: str = ""

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

    def _screenshot_on_error(self, label: str, *, warn: bool = True) -> None:
        """
        Salva um screenshot para debug.
        Usado tanto em erros quanto em pontos de navegação para inspecionar o DOM.
        """
        if not self._page:
            return
        try:
            ts = datetime.now().strftime("%Y%m%d_%H%M%S")
            path = SCREENSHOTS_DIR / f"{label}_{ts}.png"
            self._page.screenshot(path=str(path))
            if warn:
                logger.warning(f"Screenshot salvo: {path}")
            else:
                logger.debug(f"Screenshot salvo: {path}")
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

        # Guarda credenciais para uso no login inline durante navegação
        self._username = username
        self._password = password

        # Tenta reutilizar sessão existente
        session_loaded = load_cookies(self._context)
        if session_loaded and is_session_valid(self._page):
            logger.info("Sessão reutilizada com sucesso — login pulado")
            return

        logger.info("Iniciando fluxo de login no Econet...")
        self._username = username
        self._password = password
        self._do_login(username, password)
        save_cookies(self._context)
        logger.info("Login concluído e sessão salva")

    def _fill_credentials_and_submit(self, username: str, password: str, submit_text: str) -> None:
        """
        Preenche as credenciais num formulário de login já visível na página
        e clica no botão de submit indicado.

        Usado tanto no modal "Assinatura Econet" quanto no formulário inline
        que aparece quando o usuário acessa conteúdo protegido sem estar logado.

        Args:
            username: Nome de usuário Econet
            password: Senha Econet
            submit_text: Texto do botão de submit (ex: "Entrar" ou "FAZER LOGIN")
        """
        import time
        page = self._page

        # Campo de usuário — placeholder confirmado via screenshot: "nome_usuario"
        # Fallback genérico: primeiro input de texto visível
        user_sel = (
            "input[placeholder='nome_usuario'], "
            "input[placeholder*='nome_'], "
            "input[name='usuario'], "
            "input[name='login'], "
            "input[name='user']"
        )
        try:
            user_input = page.locator(user_sel).first
            user_input.wait_for(state="visible", timeout=8_000)
            user_input.fill(username)
            logger.info(f"Campo usuário preenchido: {username}")
        except Exception:
            # Último fallback: primeiro input text visível na página
            user_input = page.locator(
                "input[type='text']:visible, input:not([type]):visible"
            ).first
            user_input.fill(username)
            logger.info(f"Campo usuário preenchido (fallback genérico): {username}")

        # Campo senha
        page.locator("input[type='password']").first.fill(password)
        logger.info("Campo senha preenchido")

        # Tenta clicar no reCAPTCHA automaticamente
        self._try_click_recaptcha()

        # Clica no botão de submit
        for sel in [
            f"button:has-text('{submit_text}')",
            f"input[type='submit'][value*='{submit_text}']",
            "button[type='submit']",
            "input[type='submit']",
        ]:
            try:
                btn = page.locator(sel).first
                btn.wait_for(state="visible", timeout=4_000)
                btn.click()
                logger.info(f"Clicou em '{submit_text}' via '{sel}'")
                return
            except Exception:
                continue

        raise RuntimeError(f"Botão de submit '{submit_text}' não encontrado")

    def _do_login(self, username: str, password: str) -> None:
        """
        Executa o login via modal "Assinatura Econet".

        Fluxo confirmado via screenshot:
        1. Página carrega com menu lateral visível e botão "Entrar" no topo direito
        2. Clicar em "Entrar" abre o modal "Assinatura Econet"
        3. Modal tem: campo "Login" (input text), campo "Senha", reCAPTCHA, botão "Entrar"
        4. Após login o modal fecha e o botão "Entrar" some do header
        """
        import time

        page = self._page
        page.goto(ECONET_URL, wait_until="domcontentloaded", timeout=30_000)
        logger.info(f"Acessou {ECONET_URL}")
        time.sleep(2)

        # Clicar em "Entrar" no topo direito para abrir o modal
        logger.info("Clicando em 'Entrar' no header para abrir modal...")
        try:
            # Tenta pelo link exato no header
            entrar = page.locator("a:has-text('Entrar')").last
            entrar.wait_for(state="visible", timeout=8_000)
            entrar.click()
        except Exception:
            # Fallback: qualquer elemento com texto "Entrar" visível
            page.locator("*:has-text('Entrar'):visible").last.click()

        # Aguarda o modal "Assinatura Econet" abrir
        time.sleep(1)
        try:
            page.wait_for_selector("text=Assinatura Econet", state="visible", timeout=8_000)
            logger.info("Modal 'Assinatura Econet' aberto")
        except Exception:
            self._screenshot_on_error("login_modal_not_opened")
            logger.warning("Título do modal não detectado — tentando preencher assim mesmo")

        # Preenche credenciais DENTRO do modal.
        # O modal tem label "Login" e o campo é o primeiro input text do modal.
        # Scopamos no container do modal para não pegar a barra de pesquisa do site.
        logger.info(f"Preenchendo campo Login com '{username}'...")
        try:
            # Tenta localizar o input dentro do container do modal pelo título
            modal = page.locator("div:has(> :text('Assinatura Econet')), "
                                 "div:has(h2:text('Assinatura Econet')), "
                                 "div:has(h3:text('Assinatura Econet'))").first
            login_field = modal.locator("input[type='text'], input:not([type='password']):not([type='hidden'])").first
            login_field.wait_for(state="visible", timeout=5_000)
            login_field.fill(username)
            logger.info(f"Campo Login preenchido no modal: {username}")
        except Exception:
            # Fallback: usa o segundo input text da página (o primeiro é a barra de busca do site)
            logger.warning("Não achou input no modal via container — usando fallback posicional")
            inputs = page.locator("input[type='text']:visible").all()
            filled = False
            for inp in inputs:
                try:
                    # Ignora a barra de busca do site (placeholder "Pesquisar...")
                    ph = inp.get_attribute("placeholder") or ""
                    if "Pesquisar" in ph or "pesquisar" in ph:
                        continue
                    inp.fill(username)
                    filled = True
                    logger.info(f"Campo Login preenchido (fallback): {username}")
                    break
                except Exception:
                    continue
            if not filled:
                raise RuntimeError("Não foi possível preencher o campo Login no modal")

        page.locator("input[type='password']").first.fill(password)
        logger.info("Campo Senha preenchido")

        self._try_click_recaptcha()

        # Clica em "Entrar" (botão do modal, não o do header)
        logger.info("Clicando em Entrar no modal...")
        for sel in ["button:has-text('Entrar')", "a:has-text('Entrar')", "input[type='submit']"]:
            try:
                btns = page.locator(sel).all()
                for btn in btns:
                    # O botão do modal fica visível e não é o link "Entrar" do header
                    if btn.is_visible() and btn.get_attribute("class") != "header-entrar":
                        btn.click()
                        logger.info(f"Clicou em Entrar via '{sel}'")
                        break
                else:
                    continue
                break
            except Exception:
                continue

        # Aguarda confirmação: o modal some (botão "Entrar" no header volta a estar
        # ausente ou o link do usuário aparece)
        logger.info("Aguardando confirmação de login (até 2 min para reCAPTCHA manual)...")
        try:
            page.wait_for_selector("text=Assinatura Econet", state="hidden", timeout=120_000)
            logger.info("✅ Login bem-sucedido — modal fechado")
        except Exception:
            self._screenshot_on_error("login_failed")
            raise RuntimeError(
                "Login falhou ou timeout. Verifique credenciais ou resolva o reCAPTCHA manualmente."
            )

    def _try_click_recaptcha(self) -> None:
        """
        Tenta clicar automaticamente no checkbox reCAPTCHA 'Não sou um robô'.

        O reCAPTCHA v2 (checkbox simples) fica dentro de um iframe.
        Clicamos no checkbox — se o Google considerar o browser "confiável",
        marca direto. Se pedir desafio visual, o operador resolve manualmente
        (o browser fica visível para isso).
        """
        page = self._page
        try:
            # O reCAPTCHA fica num iframe com title="reCAPTCHA" ou src contendo "recaptcha"
            recaptcha_frame = page.frame_locator(
                "iframe[title='reCAPTCHA'], iframe[src*='recaptcha/api2/anchor']"
            ).first

            # O checkbox em si tem classe .recaptcha-checkbox-border ou id #recaptcha-anchor
            checkbox = recaptcha_frame.locator(
                "#recaptcha-anchor, .recaptcha-checkbox-border, .rc-anchor-center-item"
            ).first
            checkbox.wait_for(state="visible", timeout=6_000)
            checkbox.click()
            logger.info("reCAPTCHA checkbox clicado — aguardando validação do Google...")

            # Aguarda 3s para o Google processar (animação do checkmark)
            page.wait_for_timeout(3_000)

            # Verifica se foi marcado (atributo aria-checked="true" no anchor)
            checked = recaptcha_frame.locator(
                "#recaptcha-anchor[aria-checked='true'], .recaptcha-checkbox-checked"
            ).count()
            if checked > 0:
                logger.info("✅ reCAPTCHA resolvido automaticamente")
            else:
                logger.warning(
                    "reCAPTCHA clicado mas aguardando validação. "
                    "Se um desafio visual aparecer no browser, resolva manualmente."
                )
        except Exception as e:
            logger.warning(
                f"Não foi possível clicar no reCAPTCHA automaticamente: {e}. "
                "Resolva manualmente no browser se necessário."
            )

    # ------------------------------------------------------------------
    # Navegação principal
    # ------------------------------------------------------------------

    def _handle_inline_login_if_needed(self, username: str, password: str) -> bool:
        """
        Detecta se o Econet está exibindo o formulário inline de login
        (aparece quando o usuário tenta acessar conteúdo protegido sem estar logado).

        Formulário inline confirmado via screenshot:
        - Label "Nome de Usuário" com input placeholder="nome_usuario"
        - Label "Senha"
        - reCAPTCHA "Não sou um robô"
        - Botão azul "FAZER LOGIN"

        Se detectado, faz login e aguarda a área de busca aparecer.

        Returns:
            True se fez login inline, False se não havia formulário.
        """
        import time
        page = self._page

        inline_form_sel = "input[placeholder='nome_usuario'], button:has-text('FAZER LOGIN')"
        try:
            page.wait_for_selector(inline_form_sel, state="visible", timeout=4_000)
        except Exception:
            return False  # Formulário inline não está presente

        logger.info("Formulário de login inline detectado — fazendo login...")
        self._fill_credentials_and_submit(username, password, "FAZER LOGIN")

        # Aguarda o formulário de login sumir (usuário autenticado)
        try:
            page.wait_for_selector(
                "button:has-text('FAZER LOGIN'), input[placeholder='nome_usuario']",
                state="hidden",
                timeout=120_000,
            )
            logger.info("✅ Login inline bem-sucedido")
            time.sleep(1)
            return True
        except Exception:
            self._screenshot_on_error("inline_login_failed")
            raise RuntimeError("Login inline falhou. Verifique credenciais ou resolva o reCAPTCHA.")

    def _navigate_to_pis_cofins_search(self, username: str = "", password: str = "") -> None:
        """
        Navega para Federal > PIS/COFINS > Busca do Produto.

        Fluxo confirmado via screenshots:
        1. Clicar em "Federal" no menu lateral abre dropdown
        2. No dropdown, clicar em "PIS / COFINS" (item exato — não "Exclusão ICMS")
        3. Se não estiver logado, o site exibe formulário inline com "FAZER LOGIN"
        4. Após login (ou se já logado), a área de "Busca do Produto" fica visível

        Args:
            username/password: necessários apenas se o login inline for acionado
        """
        import time
        page = self._page

        # 1. Clicar em "Federal" no menu lateral
        logger.info("Clicando em Federal...")
        for sel in ["a:has-text('Federal')", "span:has-text('Federal')", "text=Federal"]:
            try:
                el = page.locator(sel).first
                el.wait_for(state="visible", timeout=6_000)
                el.click()
                logger.info("Clicou em Federal")
                break
            except Exception:
                continue
        time.sleep(1)

        # 2. Clicar em "PIS / COFINS" no dropdown (texto exato do menu conforme screenshot)
        logger.info("Clicando em PIS / COFINS...")
        pis_clicked = False
        for sel in [
            "a:has-text('PIS / COFINS')",   # texto exato com espaços ao redor do /
            "a:has-text('PIS/COFINS')",
            "text=PIS / COFINS",
            "text=PIS/COFINS",
        ]:
            try:
                elements = page.locator(sel).all()
                for el in elements:
                    txt = el.inner_text(timeout=2_000)
                    if "Exclus" not in txt:  # Ignora "Exclusão ICMS - PIS/COFINS"
                        el.wait_for(state="visible", timeout=5_000)
                        el.click()
                        logger.info(f"Clicou em PIS/COFINS ('{txt.strip()}')")
                        pis_clicked = True
                        break
                if pis_clicked:
                    break
            except Exception:
                continue

        if not pis_clicked:
            self._screenshot_on_error("nav_piscofins_not_found")
            raise RuntimeError("Não encontrou 'PIS / COFINS' no dropdown do menu Federal.")

        time.sleep(1)

        # 3. Verifica se apareceu o formulário de login inline (não está autenticado)
        if username:
            self._handle_inline_login_if_needed(username, password)

        # 4. Clica no link "Busca do produto:" dentro da página PIS/COFINS.
        # Texto confirmado via screenshot: "Busca do produto:" (minúsculo, com dois-pontos).
        # É um hyperlink <a> no corpo do texto, não uma aba/tab.
        logger.info("Procurando link 'Busca do produto'...")
        busca_clicked = False
        for sel in [
            "a:has-text('Busca do produto')",    # texto exato conforme screenshot
            "a:has-text('Busca do Produto')",    # variação com maiúscula
            "a:has-text('Busca de produto')",
            "a:has-text('Busca de Produto')",
        ]:
            try:
                el = page.locator(sel).first
                el.wait_for(state="visible", timeout=10_000)
                el.click()
                logger.info(f"Clicou no link via '{sel}'")
                busca_clicked = True
                break
            except Exception:
                continue

        if not busca_clicked:
            self._screenshot_on_error("nav_busca_not_found")
            raise RuntimeError(
                "Não encontrou o link 'Busca do produto' na página PIS/COFINS. "
                "Veja screenshot nav_busca_not_found."
            )
        time.sleep(1)

        # 5. Após clicar em Busca do produto, pode aparecer login inline novamente
        if username:
            self._handle_inline_login_if_needed(username, password)

        # 6. Aguarda o formulário de busca de NCM (campo para digitar o código)
        busca_sel = (
            "input[name='ncm'], input[name='codigo'], "
            "input[placeholder*='NCM'], input[placeholder*='ncm'], "
            "input[placeholder*='Código'], input[placeholder*='codigo']"
        )
        try:
            page.wait_for_selector(busca_sel, state="visible", timeout=15_000)
            logger.info("✅ Formulário de busca de NCM visível")
        except Exception:
            self._screenshot_on_error("nav_form_not_found")
            raise RuntimeError(
                "Formulário de NCM não apareceu após clicar em 'Busca do produto'. "
                "Veja screenshot nav_form_not_found."
            )

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
            self._navigate_to_pis_cofins_search(
                username=self._username,
                password=self._password,
            )
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
