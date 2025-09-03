"""
Módulo de configuração e gerenciamento do Selenium WebDriver
Configuração otimizada para scraping de portais tributários brasileiros
"""

import os
import time
import logging
from typing import Optional, List
from selenium import webdriver
from selenium.webdriver.common.by import By
from selenium.webdriver.support.ui import WebDriverWait
from selenium.webdriver.support import expected_conditions as EC
from selenium.webdriver.chrome.options import Options
from selenium.webdriver.chrome.service import Service
from selenium.common.exceptions import TimeoutException, WebDriverException
from .config import RPAConfig

logger = logging.getLogger(__name__)

class SeleniumManager:
    """Gerenciador do Selenium WebDriver com configurações otimizadas"""
    
    def __init__(self, headless: bool = True):
        self.headless = headless
        self.driver: Optional[webdriver.Chrome] = None
        self.wait: Optional[WebDriverWait] = None
        
    def start_driver(self) -> webdriver.Chrome:
        """Inicializa o driver Chrome com configurações otimizadas"""
        try:
            chrome_options = Options()
            
            if self.headless:
                chrome_options.add_argument("--headless")
            
            # Configurações para estabilidade em ambientes containerizados
            chrome_options.add_argument("--no-sandbox")
            chrome_options.add_argument("--disable-dev-shm-usage")
            chrome_options.add_argument("--disable-gpu")
            chrome_options.add_argument("--window-size=1920,1080")
            chrome_options.add_argument("--user-agent=Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36")
            
            # Configurações para performance
            chrome_options.add_argument("--disable-images")
            chrome_options.add_argument("--disable-javascript")  # Será habilitado quando necessário
            chrome_options.add_argument("--disable-plugins")
            chrome_options.add_argument("--disable-extensions")
            
            # Configurações de timeout
            chrome_options.add_argument("--page-load-strategy=normal")
            
            # Inicialização do driver
            service = Service()
            self.driver = webdriver.Chrome(service=service, options=chrome_options)
            self.driver.set_page_load_timeout(RPAConfig.EXECUTION_TIMEOUT)
            self.driver.implicitly_wait(10)
            
            # WebDriverWait para elementos
            self.wait = WebDriverWait(self.driver, 30)
            
            logger.info(f"Selenium driver iniciado {'(headless)' if self.headless else '(com interface)'}")
            return self.driver
            
        except WebDriverException as e:
            logger.error(f"Erro ao inicializar Selenium driver: {e}")
            raise
    
    def take_screenshot(self, filename: str = None) -> str:
        """Captura screenshot para debug"""
        if not self.driver:
            raise RuntimeError("Driver não inicializado")
            
        if not filename:
            timestamp = int(time.time())
            filename = f"screenshot_{timestamp}.png"
            
        filepath = os.path.join(RPAConfig.SCREENSHOT_DIR, filename)
        
        # Cria diretório se não existir
        os.makedirs(os.path.dirname(filepath), exist_ok=True)
        
        self.driver.save_screenshot(filepath)
        logger.info(f"Screenshot salvo: {filepath}")
        return filepath
    
    def wait_for_element(self, selector: str, by: By = By.CSS_SELECTOR, timeout: int = 30):
        """Aguarda elemento aparecer na página"""
        try:
            if not self.wait:
                self.wait = WebDriverWait(self.driver, timeout)
                
            element = self.wait.until(
                EC.presence_of_element_located((by, selector))
            )
            return element
        except TimeoutException:
            logger.warning(f"Timeout aguardando elemento: {selector}")
            self.take_screenshot(f"timeout_{selector.replace(' ', '_')}.png")
            return None
    
    def wait_for_clickable(self, selector: str, by: By = By.CSS_SELECTOR, timeout: int = 30):
        """Aguarda elemento ficar clicável"""
        try:
            if not self.wait:
                self.wait = WebDriverWait(self.driver, timeout)
                
            element = self.wait.until(
                EC.element_to_be_clickable((by, selector))
            )
            return element
        except TimeoutException:
            logger.warning(f"Timeout aguardando elemento clicável: {selector}")
            return None
    
    def scroll_to_element(self, element):
        """Rola a página até o elemento"""
        if self.driver and element:
            self.driver.execute_script("arguments[0].scrollIntoView(true);", element)
            time.sleep(1)  # Aguarda scroll completar
    
    def handle_captcha_pause(self, captcha_selector: str) -> bool:
        """
        Detecta CAPTCHA e pausa execução para resolução manual
        Retorna True se CAPTCHA foi resolvido, False caso contrário
        """
        try:
            captcha_element = self.driver.find_element(By.CSS_SELECTOR, captcha_selector)
            if captcha_element and captcha_element.is_displayed():
                logger.info("CAPTCHA detectado! Pausando execução para resolução manual...")
                self.take_screenshot("captcha_detected.png")
                
                if not self.headless:
                    # Em modo visual, aguarda resolução manual
                    input("CAPTCHA detectado! Resolva manualmente e pressione ENTER para continuar...")
                    return True
                else:
                    # Em modo headless, registra o problema
                    logger.error("CAPTCHA detectado em modo headless - não é possível resolver automaticamente")
                    return False
                    
        except Exception as e:
            logger.debug(f"Nenhum CAPTCHA encontrado: {e}")
            
        return True  # Nenhum CAPTCHA encontrado
    
    def quit_driver(self):
        """Encerra o driver de forma segura"""
        if self.driver:
            try:
                self.driver.quit()
                logger.info("Selenium driver encerrado")
            except Exception as e:
                logger.warning(f"Erro ao encerrar driver: {e}")
            finally:
                self.driver = None
                self.wait = None
    
    def __enter__(self):
        """Context manager - entrada"""
        self.start_driver()
        return self
    
    def __exit__(self, exc_type, exc_val, exc_tb):
        """Context manager - saída"""
        self.quit_driver()