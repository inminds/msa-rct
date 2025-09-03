"""
Módulo principal de scraping para portais tributários
Implementa login supervisionado e extração de conteúdo
"""

import time
import logging
from typing import Dict, List, Optional, Tuple
from datetime import datetime
from bs4 import BeautifulSoup
from selenium.webdriver.common.by import By
from selenium.common.exceptions import TimeoutException, WebDriverException

from .config import PortalConfig, PORTALS
from .selenium_driver import SeleniumManager

logger = logging.getLogger(__name__)

class PortalScraper:
    """Scraper principal para portais tributários brasileiros"""
    
    def __init__(self, portal_name: str, credentials: Optional[Dict[str, str]] = None):
        if portal_name not in PORTALS:
            raise ValueError(f"Portal '{portal_name}' não configurado")
            
        self.portal_name = portal_name
        self.config = PORTALS[portal_name]
        self.credentials = credentials or {}
        self.selenium_manager = SeleniumManager(headless=True)
        self.session_active = False
        
    def login(self) -> bool:
        """
        Realiza login supervisionado no portal
        Retorna True se login foi bem-sucedido
        """
        try:
            driver = self.selenium_manager.driver
            if not driver:
                driver = self.selenium_manager.start_driver()
            
            logger.info(f"Iniciando login no portal {self.config.name}")
            
            # Navega para página de login
            driver.get(self.config.login_url)
            time.sleep(2)
            
            # Aguarda formulário de login carregar
            login_form = self.selenium_manager.wait_for_element(
                self.config.selectors["login_form"]
            )
            
            if not login_form:
                logger.error("Formulário de login não encontrado")
                return False
            
            # Preenche campos de login
            if not self._fill_login_form():
                return False
            
            # Verifica e trata CAPTCHA se presente
            if "captcha_image" in self.config.selectors:
                if not self.selenium_manager.handle_captcha_pause(
                    self.config.selectors["captcha_image"]
                ):
                    logger.error("Falha na resolução do CAPTCHA")
                    return False
            
            # Submete formulário
            submit_btn = self.selenium_manager.wait_for_clickable(
                self.config.selectors["submit_button"]
            )
            
            if submit_btn:
                submit_btn.click()
                time.sleep(3)
                
                # Verifica se login foi bem-sucedido
                if self._verify_login_success():
                    self.session_active = True
                    logger.info(f"Login realizado com sucesso no {self.config.name}")
                    return True
                else:
                    logger.error("Login falhou - verificar credenciais")
                    return False
            else:
                logger.error("Botão de submit não encontrado")
                return False
                
        except Exception as e:
            logger.error(f"Erro durante login: {e}")
            self.selenium_manager.take_screenshot("login_error.png")
            return False
    
    def _fill_login_form(self) -> bool:
        """Preenche campos do formulário de login"""
        try:
            driver = self.selenium_manager.driver
            
            # Campo usuário
            if "username" in self.credentials:
                username_field = driver.find_element(
                    By.CSS_SELECTOR, 
                    self.config.selectors["username_field"]
                )
                username_field.clear()
                username_field.send_keys(self.credentials["username"])
                logger.debug("Campo usuário preenchido")
            
            # Campo senha
            if "password" in self.credentials:
                password_field = driver.find_element(
                    By.CSS_SELECTOR,
                    self.config.selectors["password_field"]
                )
                password_field.clear()
                password_field.send_keys(self.credentials["password"])
                logger.debug("Campo senha preenchido")
            
            return True
            
        except Exception as e:
            logger.error(f"Erro preenchendo formulário: {e}")
            return False
    
    def _verify_login_success(self) -> bool:
        """Verifica se login foi bem-sucedido"""
        try:
            # Verifica se ainda está na página de login (indica falha)
            current_url = self.selenium_manager.driver.current_url
            if "login" in current_url.lower():
                return False
            
            # Verifica se há elementos indicando sucesso
            time.sleep(2)
            
            # Procura por elementos que indicam área logada
            success_indicators = [
                "logout", "sair", "perfil", "dashboard", 
                "menu-usuario", "area-restrita"
            ]
            
            page_source = self.selenium_manager.driver.page_source.lower()
            for indicator in success_indicators:
                if indicator in page_source:
                    return True
            
            # Se chegou até aqui e não está mais na página de login, assume sucesso
            return "login" not in current_url.lower()
            
        except Exception as e:
            logger.warning(f"Erro verificando sucesso do login: {e}")
            return False
    
    def scrape_content(self, url: str) -> Dict:
        """
        Extrai conteúdo de uma URL específica
        Retorna dicionário com conteúdo estruturado
        """
        if not self.session_active:
            logger.warning("Sessão não ativa - tentando login primeiro")
            if not self.login():
                return {"error": "Login necessário"}
        
        try:
            driver = self.selenium_manager.driver
            logger.info(f"Extraindo conteúdo de: {url}")
            
            driver.get(url)
            time.sleep(self.config.rate_limit_seconds)
            
            # Aguarda conteúdo principal carregar
            content_area = self.selenium_manager.wait_for_element(
                self.config.selectors.get("content_area", "body")
            )
            
            if not content_area:
                logger.warning("Área de conteúdo não encontrada")
                return {"error": "Conteúdo não encontrado"}
            
            # Extrai HTML da página
            html_content = driver.page_source
            soup = BeautifulSoup(html_content, 'html.parser')
            
            # Extração específica baseada no tipo de portal
            extracted_data = self._extract_structured_content(soup, url)
            
            logger.info(f"Conteúdo extraído com sucesso de {url}")
            return extracted_data
            
        except Exception as e:
            logger.error(f"Erro extraindo conteúdo de {url}: {e}")
            self.selenium_manager.take_screenshot(f"scrape_error_{int(time.time())}.png")
            return {"error": str(e)}
    
    def _extract_structured_content(self, soup: BeautifulSoup, url: str) -> Dict:
        """Extrai conteúdo estruturado baseado no tipo de portal"""
        
        extracted = {
            "url": url,
            "portal": self.portal_name,
            "timestamp": datetime.now().isoformat(),
            "title": "",
            "content": "",
            "items": [],
            "metadata": {}
        }
        
        try:
            # Título da página
            title_tag = soup.find("title")
            if title_tag:
                extracted["title"] = title_tag.get_text().strip()
            
            # Conteúdo principal
            content_selector = self.config.selectors.get("content_area", "body")
            main_content = soup.select_one(content_selector)
            if main_content:
                # Remove scripts e estilos
                for script in main_content(["script", "style"]):
                    script.decompose()
                extracted["content"] = main_content.get_text().strip()
            
            # Itens específicos (notícias, legislações)
            if "news_items" in self.config.selectors:
                news_items = soup.select(self.config.selectors["news_items"])
                for item in news_items:
                    extracted["items"].append({
                        "type": "news",
                        "title": self._extract_item_title(item),
                        "content": item.get_text().strip(),
                        "link": self._extract_item_link(item)
                    })
            
            if "legislation_items" in self.config.selectors:
                leg_items = soup.select(self.config.selectors["legislation_items"])
                for item in leg_items:
                    extracted["items"].append({
                        "type": "legislation",
                        "title": self._extract_item_title(item),
                        "content": item.get_text().strip(),
                        "link": self._extract_item_link(item),
                        "date": self._extract_item_date(item)
                    })
            
            # Metadados adicionais
            extracted["metadata"]["items_count"] = len(extracted["items"])
            extracted["metadata"]["content_length"] = len(extracted["content"])
            
        except Exception as e:
            logger.warning(f"Erro na extração estruturada: {e}")
            extracted["error"] = str(e)
        
        return extracted
    
    def _extract_item_title(self, item) -> str:
        """Extrai título de um item"""
        for selector in ["h1", "h2", "h3", ".title", ".titulo", ".nome"]:
            title_elem = item.select_one(selector)
            if title_elem:
                return title_elem.get_text().strip()
        return item.get_text().strip()[:100] + "..." if len(item.get_text()) > 100 else item.get_text().strip()
    
    def _extract_item_link(self, item) -> Optional[str]:
        """Extrai link de um item"""
        link_elem = item.find("a")
        if link_elem and link_elem.get("href"):
            return link_elem.get("href")
        return None
    
    def _extract_item_date(self, item) -> Optional[str]:
        """Extrai data de um item"""
        for selector in [".date", ".data", ".data-publicacao", "time"]:
            date_elem = item.select_one(selector)
            if date_elem:
                return date_elem.get_text().strip()
        return None
    
    def scrape_all_urls(self) -> List[Dict]:
        """Extrai conteúdo de todas as URLs configuradas do portal"""
        results = []
        
        for url in self.config.content_urls:
            result = self.scrape_content(url)
            results.append(result)
            
            # Rate limiting entre requisições
            time.sleep(self.config.rate_limit_seconds)
        
        return results
    
    def close(self):
        """Encerra conexões e cleanup"""
        self.selenium_manager.quit_driver()
        self.session_active = False
        logger.info(f"Scraper do portal {self.config.name} encerrado")
    
    def __enter__(self):
        """Context manager - entrada"""
        return self
    
    def __exit__(self, exc_type, exc_val, exc_tb):
        """Context manager - saída"""
        self.close()