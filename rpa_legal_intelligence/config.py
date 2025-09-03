"""
Configurações do módulo RPA Legal Intelligence
Configuração multi-portal e variáveis de ambiente
"""

import os
from typing import Dict, List, Optional
from dataclasses import dataclass
from dotenv import load_dotenv

load_dotenv()

@dataclass
class PortalConfig:
    """Configuração de um portal específico"""
    name: str
    url: str
    login_url: str
    content_urls: List[str]
    selectors: Dict[str, str]  # Seletores CSS para elementos importantes
    login_fields: Dict[str, str]  # Campos de login (usuario, senha)
    wait_timeout: int = 30
    retry_attempts: int = 3
    rate_limit_seconds: int = 2

class RPAConfig:
    """Configurações principais do RPA"""
    
    # Configurações do banco de dados (compartilhado com TributAI)
    DATABASE_URL = os.getenv("DATABASE_URL", "postgresql://user:pass@localhost:5432/tributai")
    
    # Configurações do Selenium
    CHROME_DRIVER_PATH = os.getenv("CHROME_DRIVER_PATH", "/usr/bin/chromedriver")
    CHROME_HEADLESS = os.getenv("CHROME_HEADLESS", "true").lower() == "true"
    SCREENSHOT_DIR = os.getenv("SCREENSHOT_DIR", "./screenshots")
    
    # Configurações de execução
    EXECUTION_TIMEOUT = int(os.getenv("EXECUTION_TIMEOUT", "900"))  # 15 minutos
    LOG_LEVEL = os.getenv("LOG_LEVEL", "INFO")
    
    # Configurações de alertas
    SMTP_HOST = os.getenv("SMTP_HOST", "smtp.gmail.com")
    SMTP_PORT = int(os.getenv("SMTP_PORT", "587"))
    SMTP_USERNAME = os.getenv("SMTP_USERNAME", "")
    SMTP_PASSWORD = os.getenv("SMTP_PASSWORD", "")
    ALERT_RECIPIENTS = os.getenv("ALERT_RECIPIENTS", "").split(",")
    
    # API do TributAI para integração
    TRIBUTAI_API_URL = os.getenv("TRIBUTAI_API_URL", "http://localhost:5000/api")
    TRIBUTAI_API_KEY = os.getenv("TRIBUTAI_API_KEY", "")

# Configurações específicas dos portais
PORTALS: Dict[str, PortalConfig] = {
    "econet": PortalConfig(
        name="Econet",
        url="https://www.econeteditora.com.br",
        login_url="https://www.econeteditora.com.br/Login",
        content_urls=[
            "https://www.econeteditora.com.br/noticias/tributario",
            "https://www.econeteditora.com.br/legislacao/federal",
            "https://www.econeteditora.com.br/legislacao/estadual"
        ],
        selectors={
            "login_form": "form#loginForm",
            "username_field": "input[name='usuario']",
            "password_field": "input[name='senha']",
            "captcha_field": "input[name='captcha']",
            "captcha_image": "img#captchaImage",
            "submit_button": "button[type='submit']",
            "content_area": ".conteudo-principal",
            "news_items": ".noticia-item",
            "legislation_items": ".legislacao-item"
        },
        login_fields={
            "username": "usuario",
            "password": "senha",
            "captcha": "captcha"
        },
        wait_timeout=30,
        retry_attempts=3,
        rate_limit_seconds=2
    ),
    
    "rfb": PortalConfig(
        name="Receita Federal do Brasil",
        url="https://www.gov.br/receitafederal",
        login_url="https://cav.receita.fazenda.gov.br/autenticacao/login",
        content_urls=[
            "https://www.gov.br/receitafederal/pt-br/acesso-a-informacao/legislacao",
            "https://www.gov.br/receitafederal/pt-br/acesso-a-informacao/atos-normativos"
        ],
        selectors={
            "login_form": "form#loginForm",
            "username_field": "input[name='login']",
            "password_field": "input[name='senha']",
            "submit_button": "button#acessar",
            "content_area": ".conteudo",
            "legislation_items": ".item-legislacao",
            "date_field": ".data-publicacao"
        },
        login_fields={
            "username": "login",
            "password": "senha"
        }
    )
}