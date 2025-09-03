"""
Executor principal do RPA Legal Intelligence
Orquestra todo o processo: login, scraping, diff detection e alertas
"""

import time
import hashlib
from datetime import datetime
from typing import Dict, List, Optional
import traceback

from .config import RPAConfig, PORTALS
from .portal_scraper import PortalScraper
from .database import RPADatabase
from .diff_engine import DiffEngine
from .logger import RPALogManager

class RPAExecutor:
    """Executor principal do RPA que orquestra todo o processo"""
    
    def __init__(self, portal_name: str, credentials: Dict[str, str] = None):
        if portal_name not in PORTALS:
            raise ValueError(f"Portal '{portal_name}' não configurado")
        
        self.portal_name = portal_name
        self.credentials = credentials or {}
        self.config = PORTALS[portal_name]
        
        # Componentes principais
        self.scraper = None
        self.database = None
        self.diff_engine = DiffEngine()
        self.log_manager = None
        self.execution_id = None
        
    def execute_full_cycle(self) -> Dict:
        """
        Executa ciclo completo: login, scraping, diff detection e storage
        Retorna relatório de execução
        """
        try:
            # Inicializa componentes
            self.database = RPADatabase()
            self.database.connect()
            
            # Inicia execução no banco
            self.execution_id = self.database.start_execution(self.portal_name)
            self.log_manager = RPALogManager(self.execution_id, self.portal_name)
            
            self.log_manager.log_checkpoint("INICIADO", {
                "portal": self.portal_name,
                "urls_configuradas": len(self.config.content_urls)
            })
            
            # Inicializa scraper
            self.scraper = PortalScraper(self.portal_name, self.credentials)
            
            # Realiza login se necessário
            if self.credentials:
                self.log_manager.log_checkpoint("LOGIN_INICIADO")
                if not self.scraper.login():
                    raise Exception("Falha no login - verificar credenciais")
                self.log_manager.log_checkpoint("LOGIN_SUCESSO")
            
            # Processa cada URL configurada
            total_changes = 0
            processed_urls = 0
            
            for url in self.config.content_urls:
                try:
                    self.log_manager.log_checkpoint("PROCESSANDO_URL", {"url": url})
                    
                    # Extrai conteúdo
                    content_data = self.scraper.scrape_content(url)
                    
                    if "error" in content_data:
                        self.log_manager.log_error(
                            f"Erro extraindo {url}: {content_data['error']}"
                        )
                        continue
                    
                    # Gera hash do conteúdo
                    content_hash = self.diff_engine.generate_content_hash(
                        content_data.get("content", "")
                    )
                    content_data["content_hash"] = content_hash
                    
                    # Verifica mudanças
                    changes = self._detect_and_store_changes(content_data, url)
                    
                    # Armazena conteúdo
                    content_id = self.database.store_content(content_data)
                    
                    # Contabiliza resultados
                    processed_urls += 1
                    items_count = len(content_data.get("items", []))
                    changes_count = 1 if changes else 0
                    total_changes += changes_count
                    
                    self.log_manager.log_url_processed(url, items_count, changes_count)
                    
                    # Rate limiting
                    time.sleep(self.config.rate_limit_seconds)
                    
                except Exception as e:
                    error_msg = f"Erro processando {url}: {str(e)}"
                    self.log_manager.log_error(error_msg, {"url": url, "traceback": traceback.format_exc()})
                    continue
            
            # Finaliza execução
            self.database.update_execution(
                self.execution_id,
                status="COMPLETED",
                finished_at=datetime.now(),
                urls_processed=processed_urls,
                items_found=self.log_manager.items_found,
                changes_detected=total_changes,
                execution_log=self.log_manager.get_execution_summary()
            )
            
            self.log_manager.log_completion("COMPLETED")
            
            return {
                "success": True,
                "execution_id": self.execution_id,
                "portal": self.portal_name,
                "urls_processed": processed_urls,
                "changes_detected": total_changes,
                "summary": self.log_manager.get_execution_summary()
            }
            
        except Exception as e:
            error_msg = f"Erro fatal na execução: {str(e)}"
            
            if self.log_manager:
                self.log_manager.log_error(error_msg, {"traceback": traceback.format_exc()})
                self.log_manager.log_completion("ERROR")
            
            if self.database and self.execution_id:
                self.database.update_execution(
                    self.execution_id,
                    status="ERROR",
                    finished_at=datetime.now(),
                    error_message=error_msg,
                    execution_log=self.log_manager.get_execution_summary() if self.log_manager else {}
                )
            
            return {
                "success": False,
                "error": error_msg,
                "execution_id": self.execution_id
            }
            
        finally:
            self._cleanup()
    
    def _detect_and_store_changes(self, content_data: Dict, url: str) -> Optional[str]:
        """Detecta mudanças e armazena se necessário"""
        try:
            # Busca conteúdo anterior no banco
            change_id = self.database.detect_changes(
                self.portal_name,
                url,
                content_data["content_hash"]
            )
            
            if change_id:
                self.log_manager.log_checkpoint("MUDANCA_DETECTADA", {
                    "url": url,
                    "change_id": change_id
                })
                
                # TODO: Aqui seria implementado o sistema de alertas
                # self._send_alert(change_id, content_data)
                
                return change_id
            
            return None
            
        except Exception as e:
            self.log_manager.log_error(f"Erro detectando mudanças: {str(e)}")
            return None
    
    def _cleanup(self):
        """Limpeza de recursos"""
        try:
            if self.scraper:
                self.scraper.close()
            if self.database:
                self.database.close()
        except Exception as e:
            if self.log_manager:
                self.log_manager.log_error(f"Erro na limpeza: {str(e)}")

# Função utilitária para execução simplificada
def run_rpa_for_portal(portal_name: str, credentials: Dict[str, str] = None) -> Dict:
    """
    Função utilitária para executar RPA para um portal específico
    """
    executor = RPAExecutor(portal_name, credentials)
    return executor.execute_full_cycle()

# Função para executar todos os portais configurados
def run_rpa_all_portals(credentials_map: Dict[str, Dict[str, str]] = None) -> List[Dict]:
    """
    Executa RPA para todos os portais configurados
    """
    results = []
    credentials_map = credentials_map or {}
    
    for portal_name in PORTALS.keys():
        portal_credentials = credentials_map.get(portal_name, {})
        
        try:
            result = run_rpa_for_portal(portal_name, portal_credentials)
            results.append(result)
        except Exception as e:
            results.append({
                "success": False,
                "portal": portal_name,
                "error": str(e)
            })
        
        # Pausa entre portais para não sobrecarregar
        time.sleep(10)
    
    return results