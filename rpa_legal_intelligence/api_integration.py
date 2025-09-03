"""
Integração com API do TributAI
Endpoints REST para comunicação entre RPA e aplicação principal
"""

import logging
from datetime import datetime
from typing import Dict, List, Optional
from fastapi import FastAPI, HTTPException, BackgroundTasks
from pydantic import BaseModel
import uvicorn

from .rpa_executor import RPAExecutor, run_rpa_for_portal, run_rpa_all_portals
from .database import RPADatabase
from .config import RPAConfig, PORTALS

logger = logging.getLogger(__name__)

# Modelos Pydantic para API
class RPAExecutionRequest(BaseModel):
    portal_name: str
    credentials: Optional[Dict[str, str]] = None
    force_execution: bool = False

class RPAExecutionResponse(BaseModel):
    success: bool
    execution_id: Optional[str] = None
    message: str
    details: Optional[Dict] = None

class LegalChangeResponse(BaseModel):
    id: str
    portal_name: str
    url: str
    title: str
    change_type: str
    severity: str
    detected_at: datetime
    diff_summary: str

# Instância FastAPI
app = FastAPI(
    title="RPA Legal Intelligence API",
    description="API para automação de monitoramento de legislações tributárias",
    version="1.0.0"
)

@app.get("/")
async def health_check():
    """Endpoint de saúde da API"""
    return {
        "status": "healthy",
        "service": "RPA Legal Intelligence",
        "version": "1.0.0",
        "timestamp": datetime.now().isoformat()
    }

@app.get("/portals")
async def list_portals():
    """Lista portais configurados"""
    return {
        "portals": [
            {
                "name": name,
                "display_name": config.name,
                "urls_count": len(config.content_urls),
                "requires_login": bool(config.login_fields)
            }
            for name, config in PORTALS.items()
        ]
    }

@app.post("/execute", response_model=RPAExecutionResponse)
async def execute_rpa(
    request: RPAExecutionRequest,
    background_tasks: BackgroundTasks
):
    """
    Executa RPA para portal específico
    Execução em background para não bloquear API
    """
    try:
        if request.portal_name not in PORTALS:
            raise HTTPException(
                status_code=400,
                detail=f"Portal '{request.portal_name}' não configurado"
            )
        
        # Executa em background
        background_tasks.add_task(
            run_rpa_for_portal,
            request.portal_name,
            request.credentials
        )
        
        return RPAExecutionResponse(
            success=True,
            message=f"Execução iniciada para portal {request.portal_name}",
            details={"portal": request.portal_name, "background": True}
        )
        
    except Exception as e:
        logger.error(f"Erro iniciando execução RPA: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/execute/all")
async def execute_all_portals(
    background_tasks: BackgroundTasks,
    credentials_map: Optional[Dict[str, Dict[str, str]]] = None
):
    """Executa RPA para todos os portais configurados"""
    try:
        background_tasks.add_task(run_rpa_all_portals, credentials_map)
        
        return {
            "success": True,
            "message": f"Execução iniciada para {len(PORTALS)} portais",
            "portals": list(PORTALS.keys())
        }
        
    except Exception as e:
        logger.error(f"Erro iniciando execução para todos portais: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/executions")
async def list_recent_executions(limit: int = 10):
    """Lista execuções recentes do RPA"""
    try:
        with RPADatabase() as db:
            executions = db.get_recent_executions(limit)
            return {"executions": executions}
            
    except Exception as e:
        logger.error(f"Erro listando execuções: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/changes", response_model=List[LegalChangeResponse])
async def list_recent_changes(limit: int = 20):
    """Lista mudanças recentes detectadas"""
    try:
        with RPADatabase() as db:
            changes = db.get_recent_changes(limit)
            return changes
            
    except Exception as e:
        logger.error(f"Erro listando mudanças: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/changes/critical")
async def list_critical_changes(limit: int = 10):
    """Lista apenas mudanças críticas"""
    try:
        with RPADatabase() as db:
            changes = db.get_recent_changes(limit * 3)  # Busca mais para filtrar
            critical_changes = [
                change for change in changes
                if change.get('severity') in ['CRITICAL', 'HIGH']
            ]
            return {"critical_changes": critical_changes[:limit]}
            
    except Exception as e:
        logger.error(f"Erro listando mudanças críticas: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/statistics")
async def get_rpa_statistics():
    """Estatísticas gerais do RPA"""
    try:
        with RPADatabase() as db:
            with db.connection.cursor() as cursor:
                # Execuções por status
                cursor.execute("""
                    SELECT status, COUNT(*) as count
                    FROM rpa_executions
                    WHERE started_at >= NOW() - INTERVAL '30 days'
                    GROUP BY status
                """)
                executions_by_status = dict(cursor.fetchall())
                
                # Mudanças por severidade
                cursor.execute("""
                    SELECT severity, COUNT(*) as count
                    FROM legal_changes
                    WHERE detected_at >= NOW() - INTERVAL '30 days'
                    GROUP BY severity
                """)
                changes_by_severity = dict(cursor.fetchall())
                
                # Portais mais ativos
                cursor.execute("""
                    SELECT portal_name, COUNT(*) as executions
                    FROM rpa_executions
                    WHERE started_at >= NOW() - INTERVAL '30 days'
                    GROUP BY portal_name
                    ORDER BY executions DESC
                """)
                portals_activity = dict(cursor.fetchall())
                
                return {
                    "period": "30 days",
                    "executions_by_status": executions_by_status,
                    "changes_by_severity": changes_by_severity,
                    "portals_activity": portals_activity,
                    "generated_at": datetime.now().isoformat()
                }
                
    except Exception as e:
        logger.error(f"Erro obtendo estatísticas: {e}")
        raise HTTPException(status_code=500, detail=str(e))

# Endpoints para integração com TributAI
@app.post("/tributai/webhook/legal-changes")
async def notify_tributai_changes():
    """
    Endpoint para notificar TributAI sobre mudanças detectadas
    Usado internamente pelo RPA
    """
    try:
        # TODO: Implementar notificação via webhook para TributAI
        # Por enquanto apenas retorna sucesso
        return {
            "success": True,
            "message": "Webhook de mudanças processado",
            "timestamp": datetime.now().isoformat()
        }
        
    except Exception as e:
        logger.error(f"Erro processando webhook: {e}")
        raise HTTPException(status_code=500, detail=str(e))

def start_api_server(host: str = "0.0.0.0", port: int = 8080):
    """Inicia servidor da API RPA"""
    uvicorn.run(
        app,
        host=host,
        port=port,
        log_level="info"
    )