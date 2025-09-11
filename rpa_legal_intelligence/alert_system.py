"""
Sistema de Alertas Inteligente para RPA Legal Intelligence
Notificações multi-canal com priorização automática
"""

import smtplib
import logging
from datetime import datetime
from typing import Dict, List, Optional, Any
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart
from email.mime.base import MIMEBase
from email import encoders
import requests
import json
from dataclasses import dataclass
from enum import Enum

from .config import RPAConfig
from .database import RPADatabase

logger = logging.getLogger(__name__)

class AlertChannel(Enum):
    """Canais de alerta disponíveis"""
    EMAIL = "email"
    WEBHOOK = "webhook"
    SLACK = "slack"
    TEAMS = "teams"
    SMS = "sms"  # Via Twilio/AWS SNS

class AlertSeverity(Enum):
    """Níveis de severidade para alertas"""
    LOW = "low"
    MEDIUM = "medium" 
    HIGH = "high"
    CRITICAL = "critical"

@dataclass
class AlertTemplate:
    """Template de alerta personalizado"""
    severity: AlertSeverity
    channel: AlertChannel
    subject_template: str
    body_template: str
    recipients: List[str]
    enabled: bool = True
    
@dataclass
class LegalAlert:
    """Alerta de mudança legal"""
    id: str
    portal_name: str
    url: str
    title: str
    change_type: str
    severity: AlertSeverity
    diff_summary: str
    detected_at: datetime
    content_preview: str
    keywords: List[str]
    
class AlertSystem:
    """Sistema central de alertas multi-canal"""
    
    def __init__(self):
        self.templates = self._load_default_templates()
        self.smtp_config = self._get_smtp_config()
        
    def _load_default_templates(self) -> Dict[str, AlertTemplate]:
        """Carrega templates padrão de alertas"""
        templates = {}
        
        # Template para alertas críticos por email
        templates['critical_email'] = AlertTemplate(
            severity=AlertSeverity.CRITICAL,
            channel=AlertChannel.EMAIL,
            subject_template="🚨 ALERTA CRÍTICO: Mudança em Legislação Tributária - {portal_name}",
            body_template="""
            <html>
            <body>
                <h2 style="color: #d32f2f;">⚠️ ALERTA CRÍTICO DE MUDANÇA LEGAL</h2>
                
                <div style="background: #ffebee; padding: 15px; border-left: 4px solid #d32f2f; margin: 10px 0;">
                    <h3>Detalhes da Mudança:</h3>
                    <p><strong>Portal:</strong> {portal_name}</p>
                    <p><strong>URL:</strong> <a href="{url}">{url}</a></p>
                    <p><strong>Título:</strong> {title}</p>
                    <p><strong>Tipo:</strong> {change_type}</p>
                    <p><strong>Detectado em:</strong> {detected_at}</p>
                </div>
                
                <div style="background: #f5f5f5; padding: 15px; margin: 10px 0;">
                    <h3>Resumo da Mudança:</h3>
                    <p>{diff_summary}</p>
                </div>
                
                <div style="background: #fff3e0; padding: 15px; margin: 10px 0;">
                    <h3>Palavras-chave Críticas Detectadas:</h3>
                    <p>{keywords}</p>
                </div>
                
                <div style="margin: 20px 0;">
                    <h3>Prévia do Conteúdo:</h3>
                    <p style="font-style: italic;">{content_preview}</p>
                </div>
                
                <hr>
                <p style="color: #666; font-size: 12px;">
                    Este alerta foi gerado automaticamente pelo sistema RPA Legal Intelligence.<br>
                    Machado Schütz Advogados - Sistema TributAI
                </p>
            </body>
            </html>
            """,
            recipients=RPAConfig.ALERT_RECIPIENTS
        )
        
        # Template para alertas de alta importância
        templates['high_email'] = AlertTemplate(
            severity=AlertSeverity.HIGH,
            channel=AlertChannel.EMAIL,
            subject_template="📢 Mudança Importante: {portal_name} - {title}",
            body_template="""
            <html>
            <body>
                <h2 style="color: #f57c00;">📢 MUDANÇA IMPORTANTE DETECTADA</h2>
                
                <div style="background: #fff8e1; padding: 15px; border-left: 4px solid #f57c00; margin: 10px 0;">
                    <p><strong>Portal:</strong> {portal_name}</p>
                    <p><strong>Título:</strong> {title}</p>
                    <p><strong>Resumo:</strong> {diff_summary}</p>
                    <p><strong>Link:</strong> <a href="{url}">Ver mudança completa</a></p>
                </div>
                
                <p style="color: #666;">Sistema RPA Legal Intelligence - TributAI</p>
            </body>
            </html>
            """,
            recipients=RPAConfig.ALERT_RECIPIENTS
        )
        
        # Template webhook para integração com TributAI
        templates['webhook_integration'] = AlertTemplate(
            severity=AlertSeverity.MEDIUM,
            channel=AlertChannel.WEBHOOK,
            subject_template="legal_change_detected",
            body_template="""{
                "event_type": "legal_change_detected",
                "severity": "{severity}",
                "portal": "{portal_name}",
                "url": "{url}",
                "title": "{title}",
                "change_type": "{change_type}",
                "summary": "{diff_summary}",
                "detected_at": "{detected_at}",
                "keywords": {keywords_json},
                "content_preview": "{content_preview}"
            }""",
            recipients=["http://localhost:5000/api/rpa/webhook/legal-changes"]
        )
        
        return templates
    
    def _get_smtp_config(self) -> Dict:
        """Configuração SMTP para envio de emails"""
        return {
            "host": RPAConfig.SMTP_HOST,
            "port": RPAConfig.SMTP_PORT,
            "username": RPAConfig.SMTP_USERNAME,
            "password": RPAConfig.SMTP_PASSWORD,
            "use_tls": True
        }
    
    def send_legal_change_alert(self, alert: LegalAlert) -> Dict[str, bool]:
        """
        Envia alerta de mudança legal por todos os canais configurados
        Retorna status de envio para cada canal
        """
        results = {}
        
        # Determina templates a usar baseado na severidade
        templates_to_use = self._get_templates_for_severity(alert.severity)
        
        for template_key in templates_to_use:
            template = self.templates[template_key]
            
            try:
                if template.channel == AlertChannel.EMAIL:
                    success = self._send_email_alert(alert, template)
                    results[f"email_{template.severity.value}"] = success
                    
                elif template.channel == AlertChannel.WEBHOOK:
                    success = self._send_webhook_alert(alert, template)
                    results[f"webhook_{template.severity.value}"] = success
                    
                # Outros canais podem ser adicionados aqui
                # elif template.channel == AlertChannel.SLACK:
                #     success = self._send_slack_alert(alert, template)
                
            except Exception as e:
                logger.error(f"Erro enviando alerta via {template.channel.value}: {e}")
                results[f"{template.channel.value}_{template.severity.value}"] = False
        
        # Log do resultado geral
        successful_channels = sum(1 for success in results.values() if success)
        total_channels = len(results)
        
        logger.info(f"Alerta enviado: {successful_channels}/{total_channels} canais bem-sucedidos")
        
        return results
    
    def _get_templates_for_severity(self, severity: AlertSeverity) -> List[str]:
        """Retorna templates apropriados para a severidade"""
        severity_mapping = {
            AlertSeverity.CRITICAL: ['critical_email', 'webhook_integration'],
            AlertSeverity.HIGH: ['high_email', 'webhook_integration'], 
            AlertSeverity.MEDIUM: ['webhook_integration'],
            AlertSeverity.LOW: ['webhook_integration']
        }
        
        return severity_mapping.get(severity, ['webhook_integration'])
    
    def _send_email_alert(self, alert: LegalAlert, template: AlertTemplate) -> bool:
        """Envia alerta por email"""
        try:
            # Prepara dados para template
            template_data = {
                'portal_name': alert.portal_name,
                'url': alert.url,
                'title': alert.title,
                'change_type': alert.change_type,
                'severity': alert.severity.value.upper(),
                'diff_summary': alert.diff_summary,
                'detected_at': alert.detected_at.strftime('%d/%m/%Y %H:%M:%S'),
                'keywords': ', '.join(alert.keywords),
                'keywords_json': json.dumps(alert.keywords),
                'content_preview': alert.content_preview[:500] + "..." if len(alert.content_preview) > 500 else alert.content_preview
            }
            
            # Formata subject e body
            subject = template.subject_template.format(**template_data)
            body = template.body_template.format(**template_data)
            
            # Cria email
            msg = MIMEMultipart('alternative')
            msg['Subject'] = subject
            msg['From'] = self.smtp_config['username']
            msg['To'] = ', '.join(template.recipients)
            
            # Adiciona corpo HTML
            html_part = MIMEText(body, 'html', 'utf-8')
            msg.attach(html_part)
            
            # Envia email
            with smtplib.SMTP(self.smtp_config['host'], self.smtp_config['port']) as server:
                if self.smtp_config['use_tls']:
                    server.starttls()
                server.login(self.smtp_config['username'], self.smtp_config['password'])
                server.send_message(msg)
            
            logger.info(f"Email enviado com sucesso para {len(template.recipients)} destinatários")
            return True
            
        except Exception as e:
            logger.error(f"Erro enviando email: {e}")
            return False
    
    def _send_webhook_alert(self, alert: LegalAlert, template: AlertTemplate) -> bool:
        """Envia alerta via webhook"""
        try:
            # Prepara dados
            template_data = {
                'portal_name': alert.portal_name,
                'url': alert.url, 
                'title': alert.title,
                'change_type': alert.change_type,
                'severity': alert.severity.value,
                'diff_summary': alert.diff_summary,
                'detected_at': alert.detected_at.isoformat(),
                'keywords_json': json.dumps(alert.keywords),
                'content_preview': alert.content_preview
            }
            
            # Formata payload
            payload_str = template.body_template.format(**template_data)
            payload = json.loads(payload_str)
            
            # Envia para cada URL configurada
            success_count = 0
            for webhook_url in template.recipients:
                try:
                    response = requests.post(
                        webhook_url,
                        json=payload,
                        timeout=30,
                        headers={'Content-Type': 'application/json'}
                    )
                    
                    if response.status_code == 200:
                        success_count += 1
                        logger.debug(f"Webhook enviado com sucesso para {webhook_url}")
                    else:
                        logger.warning(f"Webhook falhou para {webhook_url}: {response.status_code}")
                        
                except requests.RequestException as e:
                    logger.error(f"Erro enviando webhook para {webhook_url}: {e}")
            
            success = success_count > 0
            logger.info(f"Webhook enviado: {success_count}/{len(template.recipients)} URLs bem-sucedidas")
            return success
            
        except Exception as e:
            logger.error(f"Erro no sistema de webhook: {e}")
            return False
    
    def test_alert_system(self) -> Dict[str, Any]:
        """Testa sistema de alertas com dados fictícios"""
        test_alert = LegalAlert(
            id="test-alert-001",
            portal_name="Sistema de Teste",
            url="https://exemplo.com/teste",
            title="Teste do Sistema de Alertas",
            change_type="TEST",
            severity=AlertSeverity.MEDIUM,
            diff_summary="Este é um teste do sistema de alertas do RPA Legal Intelligence.",
            detected_at=datetime.now(),
            content_preview="Conteúdo de teste para validação do sistema de notificações...",
            keywords=["teste", "sistema", "alerta"]
        )
        
        logger.info("Executando teste do sistema de alertas...")
        results = self.send_legal_change_alert(test_alert)
        
        return {
            "test_executed": True,
            "timestamp": datetime.now().isoformat(),
            "results": results,
            "success": any(results.values())
        }

# Função utilitária para criação de alertas
def create_legal_alert_from_change_data(change_data: Dict, content_data: Dict) -> LegalAlert:
    """Cria alerta a partir dos dados de mudança detectada"""
    
    # Mapeia severidade do diff engine para AlertSeverity
    severity_map = {
        "LOW": AlertSeverity.LOW,
        "MEDIUM": AlertSeverity.MEDIUM, 
        "HIGH": AlertSeverity.HIGH,
        "CRITICAL": AlertSeverity.CRITICAL
    }
    
    return LegalAlert(
        id=change_data.get('id', 'unknown'),
        portal_name=content_data.get('portal', 'unknown'),
        url=content_data.get('url', ''),
        title=content_data.get('title', 'Mudança detectada'),
        change_type=change_data.get('change_type', 'MODIFIED'),
        severity=severity_map.get(change_data.get('severity', 'MEDIUM'), AlertSeverity.MEDIUM),
        diff_summary=change_data.get('diff_summary', ''),
        detected_at=datetime.fromisoformat(change_data.get('detected_at', datetime.now().isoformat())),
        content_preview=content_data.get('content', '')[:1000],
        keywords=change_data.get('keywords', [])
    )