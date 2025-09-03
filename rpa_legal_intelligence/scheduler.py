"""
Sistema de agendamento para execuções automáticas do RPA
Usa APScheduler para execuções periódicas
"""

import logging
from datetime import datetime
from apscheduler.schedulers.blocking import BlockingScheduler
from apscheduler.schedulers.background import BackgroundScheduler
from apscheduler.triggers.cron import CronTrigger
from apscheduler.triggers.interval import IntervalTrigger

from .rpa_executor import run_rpa_all_portals
from .config import PORTALS

logger = logging.getLogger(__name__)

class RPAScheduler:
    """Agendador de execuções automáticas do RPA"""
    
    def __init__(self, background_mode: bool = True):
        # Escolhe tipo de scheduler baseado no modo
        if background_mode:
            self.scheduler = BackgroundScheduler()
        else:
            self.scheduler = BlockingScheduler()
        
        self.credentials_map = {}
        self.is_running = False
        
    def add_credentials(self, portal_name: str, credentials: dict):
        """Adiciona credenciais para um portal"""
        self.credentials_map[portal_name] = credentials
        logger.info(f"Credenciais configuradas para portal: {portal_name}")
        
    def schedule_daily_execution(self, hour: int = 8, minute: int = 0):
        """
        Agenda execução diária
        Por padrão às 8:00
        """
        self.scheduler.add_job(
            func=self._execute_all_portals,
            trigger=CronTrigger(hour=hour, minute=minute),
            id='daily_rpa_execution',
            name='Execução Diária RPA',
            replace_existing=True
        )
        logger.info(f"Execução diária agendada para {hour:02d}:{minute:02d}")
        
    def schedule_multiple_daily(self, times: list = None):
        """
        Agenda múltiplas execuções por dia
        Por padrão: 8:00, 14:00, 20:00
        """
        if times is None:
            times = [(8, 0), (14, 0), (20, 0)]
            
        for i, (hour, minute) in enumerate(times):
            self.scheduler.add_job(
                func=self._execute_all_portals,
                trigger=CronTrigger(hour=hour, minute=minute),
                id=f'rpa_execution_{i}',
                name=f'Execução RPA {hour:02d}:{minute:02d}',
                replace_existing=True
            )
            
        logger.info(f"Agendadas {len(times)} execuções diárias: {times}")
        
    def schedule_interval(self, hours: int = 6):
        """
        Agenda execução por intervalo
        Por padrão a cada 6 horas
        """
        self.scheduler.add_job(
            func=self._execute_all_portals,
            trigger=IntervalTrigger(hours=hours),
            id='interval_rpa_execution',
            name=f'Execução RPA a cada {hours}h',
            replace_existing=True
        )
        logger.info(f"Execução agendada a cada {hours} horas")
        
    def schedule_business_hours(self):
        """
        Agenda execuções apenas em horário comercial
        Segunda a sexta, 8:00-18:00, a cada 2 horas
        """
        business_hours = [8, 10, 12, 14, 16, 18]
        
        for hour in business_hours:
            self.scheduler.add_job(
                func=self._execute_all_portals,
                trigger=CronTrigger(
                    day_of_week='mon-fri',
                    hour=hour,
                    minute=0
                ),
                id=f'business_rpa_{hour}',
                name=f'Execução Comercial {hour:02d}:00',
                replace_existing=True
            )
            
        logger.info("Execuções agendadas para horário comercial (seg-sex, 8h-18h)")
        
    def _execute_all_portals(self):
        """Função interna que executa RPA para todos os portais"""
        try:
            logger.info("Iniciando execução agendada do RPA")
            
            results = run_rpa_all_portals(self.credentials_map)
            
            # Log dos resultados
            successful = len([r for r in results if r.get('success', False)])
            failed = len(results) - successful
            
            logger.info(f"Execução agendada concluída: {successful} sucessos, {failed} falhas")
            
            # Aqui poderia ser implementado envio de relatório por email
            # self._send_execution_report(results)
            
        except Exception as e:
            logger.error(f"Erro na execução agendada: {e}")
            
    def start(self):
        """Inicia o agendador"""
        if not self.is_running:
            self.scheduler.start()
            self.is_running = True
            logger.info("Agendador RPA iniciado")
        
    def stop(self):
        """Para o agendador"""
        if self.is_running:
            self.scheduler.shutdown()
            self.is_running = False
            logger.info("Agendador RPA parado")
            
    def list_jobs(self):
        """Lista jobs agendados"""
        jobs = []
        for job in self.scheduler.get_jobs():
            jobs.append({
                "id": job.id,
                "name": job.name,
                "next_run": job.next_run_time.isoformat() if job.next_run_time else None,
                "trigger": str(job.trigger)
            })
        return jobs
        
    def remove_job(self, job_id: str):
        """Remove job específico"""
        self.scheduler.remove_job(job_id)
        logger.info(f"Job removido: {job_id}")

# Função utilitária para configuração rápida
def setup_default_scheduler(credentials_map: dict = None) -> RPAScheduler:
    """
    Configura agendador com configurações padrão
    3 execuções por dia: 8:00, 14:00, 20:00
    """
    scheduler = RPAScheduler(background_mode=True)
    
    # Adiciona credenciais se fornecidas
    if credentials_map:
        for portal, creds in credentials_map.items():
            scheduler.add_credentials(portal, creds)
    
    # Agenda execuções padrão
    scheduler.schedule_multiple_daily([(8, 0), (14, 0), (20, 0)])
    
    return scheduler