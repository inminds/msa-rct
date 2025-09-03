"""
Sistema de logging customizado para o RPA Legal Intelligence
Logs estruturados para checkpoints e monitoramento
"""

import logging
import sys
from datetime import datetime
from typing import Dict, Any, Optional
import json

class RPAFormatter(logging.Formatter):
    """Formatter customizado para logs estruturados do RPA"""
    
    def format(self, record):
        # Informações base
        log_entry = {
            "timestamp": datetime.now().isoformat(),
            "level": record.levelname,
            "module": record.name,
            "message": record.getMessage()
        }
        
        # Adiciona informações extras se presentes
        if hasattr(record, 'portal'):
            log_entry["portal"] = record.portal
        if hasattr(record, 'execution_id'):
            log_entry["execution_id"] = record.execution_id
        if hasattr(record, 'urls_processed'):
            log_entry["urls_processed"] = record.urls_processed
        if hasattr(record, 'changes_found'):
            log_entry["changes_found"] = record.changes_found
        
        return json.dumps(log_entry, ensure_ascii=False)

def setup_rpa_logger(
    name: str = "rpa_legal_intelligence",
    level: str = "INFO",
    log_file: Optional[str] = None
) -> logging.Logger:
    """
    Configura logger específico para RPA
    """
    logger = logging.getLogger(name)
    logger.setLevel(getattr(logging, level.upper()))
    
    # Remove handlers existentes
    logger.handlers.clear()
    
    # Formatter personalizado
    formatter = RPAFormatter()
    
    # Handler para console
    console_handler = logging.StreamHandler(sys.stdout)
    console_handler.setFormatter(formatter)
    logger.addHandler(console_handler)
    
    # Handler para arquivo se especificado
    if log_file:
        file_handler = logging.FileHandler(log_file, encoding='utf-8')
        file_handler.setFormatter(formatter)
        logger.addHandler(file_handler)
    
    return logger

class RPALogManager:
    """Gerenciador de logs específico para execuções do RPA"""
    
    def __init__(self, execution_id: str, portal_name: str):
        self.execution_id = execution_id
        self.portal_name = portal_name
        self.logger = setup_rpa_logger()
        self.start_time = datetime.now()
        
        # Contadores para estatísticas
        self.urls_processed = 0
        self.items_found = 0
        self.changes_detected = 0
        self.errors_count = 0
        
    def log_checkpoint(self, stage: str, details: Dict[str, Any] = None):
        """Log de checkpoint para monitoramento de progresso"""
        self.logger.info(
            f"CHECKPOINT: {stage}",
            extra={
                "execution_id": self.execution_id,
                "portal": self.portal_name,
                "stage": stage,
                "urls_processed": self.urls_processed,
                "changes_found": self.changes_detected,
                "duration_minutes": self._get_duration_minutes(),
                **(details or {})
            }
        )
    
    def log_url_processed(self, url: str, items_count: int, changes_count: int):
        """Log de processamento de URL"""
        self.urls_processed += 1
        self.items_found += items_count
        self.changes_detected += changes_count
        
        self.logger.info(
            f"URL processada: {url}",
            extra={
                "execution_id": self.execution_id,
                "portal": self.portal_name,
                "url": url,
                "items_found": items_count,
                "changes_found": changes_count,
                "urls_processed": self.urls_processed
            }
        )
    
    def log_error(self, error: str, context: Dict[str, Any] = None):
        """Log de erro com contexto"""
        self.errors_count += 1
        
        self.logger.error(
            f"ERRO: {error}",
            extra={
                "execution_id": self.execution_id,
                "portal": self.portal_name,
                "error_count": self.errors_count,
                **(context or {})
            }
        )
    
    def log_completion(self, status: str = "COMPLETED"):
        """Log de finalização da execução"""
        duration = self._get_duration_minutes()
        
        self.logger.info(
            f"Execução finalizada: {status}",
            extra={
                "execution_id": self.execution_id,
                "portal": self.portal_name,
                "final_status": status,
                "total_urls": self.urls_processed,
                "total_items": self.items_found,
                "total_changes": self.changes_detected,
                "total_errors": self.errors_count,
                "duration_minutes": duration
            }
        )
    
    def get_execution_summary(self) -> Dict[str, Any]:
        """Retorna resumo da execução para armazenamento"""
        return {
            "execution_id": self.execution_id,
            "portal": self.portal_name,
            "duration_minutes": self._get_duration_minutes(),
            "urls_processed": self.urls_processed,
            "items_found": self.items_found,
            "changes_detected": self.changes_detected,
            "errors_count": self.errors_count,
            "started_at": self.start_time.isoformat(),
            "status": "COMPLETED" if self.errors_count == 0 else "ERROR"
        }
    
    def _get_duration_minutes(self) -> float:
        """Calcula duração da execução em minutos"""
        duration = datetime.now() - self.start_time
        return round(duration.total_seconds() / 60, 2)