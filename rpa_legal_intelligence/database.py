"""
Módulo de integração com banco de dados PostgreSQL compartilhado
Tabelas para armazenamento de dados do RPA e integração com TributAI
"""

import logging
from datetime import datetime
from typing import Dict, List, Optional, Any
import psycopg2
from psycopg2.extras import RealDictCursor, Json
from dataclasses import dataclass
from .config import RPAConfig

logger = logging.getLogger(__name__)

@dataclass
class RPAExecution:
    """Modelo para execução do RPA"""
    id: Optional[str] = None
    portal_name: str = ""
    status: str = "PENDING"  # PENDING, RUNNING, COMPLETED, ERROR
    started_at: Optional[datetime] = None
    finished_at: Optional[datetime] = None
    urls_processed: int = 0
    items_found: int = 0
    changes_detected: int = 0
    error_message: Optional[str] = None
    execution_log: Optional[Dict] = None

@dataclass
class LegalContent:
    """Modelo para conteúdo legal extraído"""
    id: Optional[str] = None
    portal_name: str = ""
    url: str = ""
    title: str = ""
    content_hash: str = ""
    content_text: str = ""
    content_metadata: Optional[Dict] = None
    extracted_at: datetime = None
    last_modified: Optional[datetime] = None

@dataclass
class LegalChange:
    """Modelo para mudanças detectadas"""
    id: Optional[str] = None
    legal_content_id: str = ""
    change_type: str = "MODIFIED"  # NEW, MODIFIED, DELETED
    old_content_hash: Optional[str] = None
    new_content_hash: str = ""
    diff_summary: str = ""
    diff_details: Optional[Dict] = None
    detected_at: datetime = None
    severity: str = "MEDIUM"  # LOW, MEDIUM, HIGH, CRITICAL
    notified: bool = False

class RPADatabase:
    """Classe para operações de banco de dados do RPA"""
    
    def __init__(self, connection_string: str = None):
        self.connection_string = connection_string or RPAConfig.DATABASE_URL
        self.connection = None
        
    def connect(self):
        """Estabelece conexão com PostgreSQL"""
        try:
            self.connection = psycopg2.connect(
                self.connection_string,
                cursor_factory=RealDictCursor
            )
            self.connection.autocommit = True
            logger.info("Conectado ao banco PostgreSQL")
            
            # Cria tabelas se não existirem
            self._create_tables()
            
        except psycopg2.Error as e:
            logger.error(f"Erro conectando ao PostgreSQL: {e}")
            raise
    
    def _create_tables(self):
        """Cria tabelas necessárias para o RPA"""
        try:
            with self.connection.cursor() as cursor:
                
                # Tabela de execuções do RPA
                cursor.execute("""
                    CREATE TABLE IF NOT EXISTS rpa_executions (
                        id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
                        portal_name VARCHAR NOT NULL,
                        status VARCHAR NOT NULL DEFAULT 'PENDING',
                        started_at TIMESTAMP,
                        finished_at TIMESTAMP,
                        urls_processed INTEGER DEFAULT 0,
                        items_found INTEGER DEFAULT 0,
                        changes_detected INTEGER DEFAULT 0,
                        error_message TEXT,
                        execution_log JSONB,
                        created_at TIMESTAMP DEFAULT NOW(),
                        updated_at TIMESTAMP DEFAULT NOW()
                    )
                """)
                
                # Tabela de conteúdo legal
                cursor.execute("""
                    CREATE TABLE IF NOT EXISTS legal_contents (
                        id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
                        portal_name VARCHAR NOT NULL,
                        url VARCHAR NOT NULL,
                        title VARCHAR,
                        content_hash VARCHAR NOT NULL,
                        content_text TEXT,
                        content_metadata JSONB,
                        extracted_at TIMESTAMP DEFAULT NOW(),
                        last_modified TIMESTAMP,
                        created_at TIMESTAMP DEFAULT NOW(),
                        updated_at TIMESTAMP DEFAULT NOW(),
                        UNIQUE(portal_name, url, content_hash)
                    )
                """)
                
                # Tabela de mudanças detectadas
                cursor.execute("""
                    CREATE TABLE IF NOT EXISTS legal_changes (
                        id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
                        legal_content_id VARCHAR REFERENCES legal_contents(id),
                        change_type VARCHAR NOT NULL DEFAULT 'MODIFIED',
                        old_content_hash VARCHAR,
                        new_content_hash VARCHAR NOT NULL,
                        diff_summary TEXT,
                        diff_details JSONB,
                        detected_at TIMESTAMP DEFAULT NOW(),
                        severity VARCHAR DEFAULT 'MEDIUM',
                        notified BOOLEAN DEFAULT FALSE,
                        created_at TIMESTAMP DEFAULT NOW()
                    )
                """)
                
                # Índices para performance
                cursor.execute("""
                    CREATE INDEX IF NOT EXISTS idx_legal_contents_portal_url 
                    ON legal_contents(portal_name, url)
                """)
                
                cursor.execute("""
                    CREATE INDEX IF NOT EXISTS idx_legal_changes_detected_at 
                    ON legal_changes(detected_at DESC)
                """)
                
                cursor.execute("""
                    CREATE INDEX IF NOT EXISTS idx_rpa_executions_status 
                    ON rpa_executions(status, started_at DESC)
                """)
                
                logger.info("Tabelas do RPA criadas/verificadas com sucesso")
                
        except psycopg2.Error as e:
            logger.error(f"Erro criando tabelas: {e}")
            raise
    
    def start_execution(self, portal_name: str) -> str:
        """Inicia nova execução do RPA"""
        try:
            with self.connection.cursor() as cursor:
                cursor.execute("""
                    INSERT INTO rpa_executions (portal_name, status, started_at)
                    VALUES (%s, 'RUNNING', %s)
                    RETURNING id
                """, (portal_name, datetime.now()))
                
                execution_id = cursor.fetchone()['id']
                logger.info(f"Execução RPA iniciada: {execution_id} para portal {portal_name}")
                return execution_id
                
        except psycopg2.Error as e:
            logger.error(f"Erro iniciando execução: {e}")
            raise
    
    def update_execution(self, execution_id: str, **kwargs):
        """Atualiza execução do RPA"""
        try:
            # Campos atualizáveis
            allowed_fields = [
                'status', 'finished_at', 'urls_processed', 'items_found',
                'changes_detected', 'error_message', 'execution_log'
            ]
            
            updates = []
            values = []
            
            for field, value in kwargs.items():
                if field in allowed_fields:
                    if field == 'execution_log' and isinstance(value, dict):
                        updates.append(f"{field} = %s")
                        values.append(Json(value))
                    else:
                        updates.append(f"{field} = %s")
                        values.append(value)
            
            if updates:
                updates.append("updated_at = %s")
                values.append(datetime.now())
                values.append(execution_id)
                
                with self.connection.cursor() as cursor:
                    cursor.execute(f"""
                        UPDATE rpa_executions 
                        SET {', '.join(updates)}
                        WHERE id = %s
                    """, values)
                
                logger.debug(f"Execução {execution_id} atualizada")
                
        except psycopg2.Error as e:
            logger.error(f"Erro atualizando execução: {e}")
            raise
    
    def store_content(self, content_data: Dict) -> Optional[str]:
        """Armazena conteúdo legal extraído"""
        try:
            with self.connection.cursor() as cursor:
                # Verifica se conteúdo já existe (mesmo hash)
                cursor.execute("""
                    SELECT id FROM legal_contents 
                    WHERE portal_name = %s AND url = %s AND content_hash = %s
                """, (
                    content_data.get('portal'),
                    content_data.get('url'),
                    content_data.get('content_hash', '')
                ))
                
                existing = cursor.fetchone()
                if existing:
                    return existing['id']
                
                # Insere novo conteúdo
                cursor.execute("""
                    INSERT INTO legal_contents (
                        portal_name, url, title, content_hash, 
                        content_text, content_metadata, extracted_at
                    ) VALUES (%s, %s, %s, %s, %s, %s, %s)
                    RETURNING id
                """, (
                    content_data.get('portal'),
                    content_data.get('url'),
                    content_data.get('title', ''),
                    content_data.get('content_hash', ''),
                    content_data.get('content', ''),
                    Json(content_data.get('metadata', {})),
                    datetime.fromisoformat(content_data.get('timestamp', datetime.now().isoformat()))
                ))
                
                content_id = cursor.fetchone()['id']
                logger.debug(f"Conteúdo armazenado: {content_id}")
                return content_id
                
        except psycopg2.Error as e:
            logger.error(f"Erro armazenando conteúdo: {e}")
            return None
    
    def detect_changes(self, portal_name: str, url: str, new_content_hash: str) -> Optional[str]:
        """Detecta mudanças em conteúdo"""
        try:
            with self.connection.cursor() as cursor:
                # Busca último conteúdo para esta URL
                cursor.execute("""
                    SELECT id, content_hash FROM legal_contents 
                    WHERE portal_name = %s AND url = %s 
                    ORDER BY extracted_at DESC LIMIT 1
                """, (portal_name, url))
                
                last_content = cursor.fetchone()
                if not last_content:
                    return None  # Primeiro conteúdo, não há mudança
                
                if last_content['content_hash'] != new_content_hash:
                    # Mudança detectada - registra
                    cursor.execute("""
                        INSERT INTO legal_changes (
                            legal_content_id, change_type, old_content_hash, 
                            new_content_hash, diff_summary, detected_at
                        ) VALUES (%s, 'MODIFIED', %s, %s, %s, %s)
                        RETURNING id
                    """, (
                        last_content['id'],
                        last_content['content_hash'],
                        new_content_hash,
                        f"Mudança detectada em {url}",
                        datetime.now()
                    ))
                    
                    change_id = cursor.fetchone()['id']
                    logger.info(f"Mudança detectada e registrada: {change_id}")
                    return change_id
                
                return None  # Nenhuma mudança
                
        except psycopg2.Error as e:
            logger.error(f"Erro detectando mudanças: {e}")
            return None
    
    def get_recent_executions(self, limit: int = 10) -> List[Dict]:
        """Retorna execuções recentes"""
        try:
            with self.connection.cursor() as cursor:
                cursor.execute("""
                    SELECT * FROM rpa_executions 
                    ORDER BY started_at DESC 
                    LIMIT %s
                """, (limit,))
                
                return [dict(row) for row in cursor.fetchall()]
                
        except psycopg2.Error as e:
            logger.error(f"Erro buscando execuções: {e}")
            return []
    
    def get_recent_changes(self, limit: int = 20) -> List[Dict]:
        """Retorna mudanças recentes detectadas"""
        try:
            with self.connection.cursor() as cursor:
                cursor.execute("""
                    SELECT lc.portal_name, lc.url, lc.title,
                           lg.change_type, lg.diff_summary, lg.detected_at, lg.severity
                    FROM legal_changes lg
                    JOIN legal_contents lc ON lg.legal_content_id = lc.id
                    ORDER BY lg.detected_at DESC
                    LIMIT %s
                """, (limit,))
                
                return [dict(row) for row in cursor.fetchall()]
                
        except psycopg2.Error as e:
            logger.error(f"Erro buscando mudanças: {e}")
            return []
    
    def close(self):
        """Fecha conexão com banco"""
        if self.connection:
            self.connection.close()
            logger.info("Conexão com banco fechada")
    
    def __enter__(self):
        """Context manager - entrada"""
        self.connect()
        return self
    
    def __exit__(self, exc_type, exc_val, exc_tb):
        """Context manager - saída"""
        self.close()