import logging
import re
from datetime import datetime
from pathlib import Path
from typing import Optional

from playwright.sync_api import sync_playwright, BrowserContext, Page, Playwright

from .config import (
    ECONET_URL,
    HEADLESS,
    SCREENSHOTS_DIR,
    CHROME_USER_DATA_DIR,
)

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

    Usa o Chrome real instalado na máquina com perfil persistente:
    - Sessão salva automaticamente entre execuções (sem arquivo de cookies)
    - reCAPTCHA muito menos frequente pois o Chrome tem histórico real
    - Na primeira execução faz login completo; nas seguintes reutiliza a sessão

    Perfil salvo em: rpa_ncm_scanner/chrome_profile/
    (configurável via env CHROME_USER_DATA_DIR)
    """

    def __init__(self, headless: bool = HEADLESS) -> None:
        self._headless = headless
        SCREENSHOTS_DIR.mkdir(parents=True, exist_ok=True)
        CHROME_USER_DATA_DIR.mkdir(parents=True, exist_ok=True)

        self._playwright: Optional[Playwright] = None
        self._context: Optional[BrowserContext] = None
        self._page: Optional[Page] = None

        # Credenciais guardadas para uso no login inline durante navegação
        self._username: str = ""
        self._password: str = ""

    # ------------------------------------------------------------------
    # Ciclo de vida do browser
    # ------------------------------------------------------------------

    def _start_browser(self) -> None:
        """
        Inicia o Chrome real com perfil persistente via launch_persistent_context.

        launch_persistent_context salva cookies, localStorage e sessões
        automaticamente no diretório do perfil — sem precisar de arquivo JSON.
        """
        self._playwright = sync_playwright().start()
        self._context = self._playwright.chromium.launch_persistent_context(
            user_data_dir=str(CHROME_USER_DATA_DIR),
            channel="chrome",          # Chrome real instalado na máquina
            headless=self._headless,
            viewport={"width": 1280, "height": 900},
            args=["--disable-blink-features=AutomationControlled"],
        )
        # Reutiliza página existente ou abre nova
        if self._context.pages:
            self._page = self._context.pages[0]
        else:
            self._page = self._context.new_page()
        logger.debug(f"Chrome iniciado com perfil em: {CHROME_USER_DATA_DIR}")

    def close(self) -> None:
        """Fecha o browser — o perfil é salvo automaticamente pelo Chrome."""
        if self._context:
            try:
                self._context.close()
            except Exception:
                pass
        if self._playwright:
            try:
                self._playwright.stop()
            except Exception:
                pass
        logger.debug("Chrome encerrado (sessão salva no perfil)")

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
        Verifica sessão e faz login se necessário.

        Com perfil persistente do Chrome, a sessão sobrevive entre execuções
        automaticamente. Só faz login completo quando:
        - É a primeira execução (perfil vazio)
        - A sessão expirou no servidor do Econet
        """
        import time

        if not self._context:
            self._start_browser()

        # Guarda credenciais para uso no login inline durante a navegação
        self._username = username
        self._password = password

        # Verifica se já está logado navegando para o Econet
        logger.info("Verificando sessão no Econet...")
        self._page.goto(ECONET_URL, wait_until="domcontentloaded", timeout=30_000)
        time.sleep(2)

        # Se o botão "Entrar" está visível → não está logado
        entrar_visivel = self._page.locator("a:has-text('Entrar')").is_visible()
        if not entrar_visivel:
            logger.info("✅ Sessão válida — já está logado (perfil Chrome)")
            return

        logger.info("Sessão não encontrada — iniciando login...")
        self._do_login(username, password)
        logger.info("✅ Login concluído — sessão salva automaticamente no perfil Chrome")

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

        # O dropdown do Federal fica sobreposto visualmente, mas os links já estão no DOM.
        # Estratégia: extrair o href do link "Busca do produto" via JS e navegar
        # diretamente com page.goto() — ignora completamente o dropdown.

        # Aguarda os links da página PIS/COFINS estarem no DOM
        logger.info("Aguardando links da página PIS/COFINS...")
        try:
            page.wait_for_function(
                """() => {
                    const links = Array.from(document.querySelectorAll('a'));
                    return links.some(a => a.textContent.toLowerCase().includes('busca do produto')
                                       || a.textContent.toLowerCase().includes('busca de produto'));
                }""",
                timeout=15_000,
            )
        except Exception:
            self._screenshot_on_error("nav_busca_dom_timeout")
            raise RuntimeError("Links da página PIS/COFINS não carregaram no DOM.")

        # 3. Verifica login inline se necessário
        if username:
            self._handle_inline_login_if_needed(username, password)

        # 4. Extrai o href do link "Busca do produto" e navega diretamente para ele.
        # Isso contorna completamente o dropdown sobreposto.
        logger.info("Extraindo URL do link 'Busca do produto'...")
        href = page.evaluate("""
            () => {
                const links = Array.from(document.querySelectorAll('a'));
                const target = links.find(a => {
                    const txt = a.textContent.trim().toLowerCase();
                    return txt.includes('busca do produto') || txt.includes('busca de produto');
                });
                return target ? target.href : null;
            }
        """)

        if not href:
            self._screenshot_on_error("nav_busca_not_found")
            raise RuntimeError(
                "Link 'Busca do produto' não encontrado no DOM da página PIS/COFINS."
            )

        logger.info(f"Navegando diretamente para: {href}")
        page.goto(href, wait_until="domcontentloaded", timeout=30_000)
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
