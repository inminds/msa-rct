"""
Ponto de entrada principal do RPA Legal Intelligence
Pode ser executado como script standalone ou integrado
"""

import argparse
import json
import sys
import os
from datetime import datetime

# Adiciona o diretório pai ao path para importações
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from rpa_legal_intelligence.rpa_executor import run_rpa_for_portal, run_rpa_all_portals
from rpa_legal_intelligence.api_integration import start_api_server
from rpa_legal_intelligence.scheduler import setup_default_scheduler
from rpa_legal_intelligence.config import PORTALS
from rpa_legal_intelligence.logger import setup_rpa_logger

logger = setup_rpa_logger("rpa_main")

def execute_portal(args):
    """Executa RPA para portal específico"""
    credentials = {}
    
    # Lê credenciais se fornecidas
    if args.credentials_file:
        try:
            with open(args.credentials_file, 'r') as f:
                all_credentials = json.load(f)
                credentials = all_credentials.get(args.portal, {})
        except Exception as e:
            logger.error(f"Erro lendo arquivo de credenciais: {e}")
            return 1
    
    # Credenciais via linha de comando (sobrescreve arquivo)
    if args.username and args.password:
        credentials.update({
            "username": args.username,
            "password": args.password
        })
    
    logger.info(f"Iniciando execução RPA para portal: {args.portal}")
    
    try:
        result = run_rpa_for_portal(args.portal, credentials)
        
        if result["success"]:
            logger.info(f"Execução concluída com sucesso: {result['execution_id']}")
            print(json.dumps(result, indent=2, ensure_ascii=False))
            return 0
        else:
            logger.error(f"Execução falhou: {result.get('error', 'Erro desconhecido')}")
            print(json.dumps(result, indent=2, ensure_ascii=False))
            return 1
            
    except Exception as e:
        logger.error(f"Erro na execução: {e}")
        return 1

def execute_all_portals(args):
    """Executa RPA para todos os portais"""
    credentials_map = {}
    
    if args.credentials_file:
        try:
            with open(args.credentials_file, 'r') as f:
                credentials_map = json.load(f)
        except Exception as e:
            logger.error(f"Erro lendo arquivo de credenciais: {e}")
            return 1
    
    logger.info("Iniciando execução RPA para todos os portais")
    
    try:
        results = run_rpa_all_portals(credentials_map)
        
        successful = len([r for r in results if r.get('success', False)])
        total = len(results)
        
        logger.info(f"Execução concluída: {successful}/{total} portais com sucesso")
        print(json.dumps(results, indent=2, ensure_ascii=False))
        
        return 0 if successful > 0 else 1
        
    except Exception as e:
        logger.error(f"Erro na execução: {e}")
        return 1

def start_api(args):
    """Inicia servidor da API"""
    logger.info(f"Iniciando API RPA em {args.host}:{args.port}")
    
    try:
        start_api_server(args.host, args.port)
    except Exception as e:
        logger.error(f"Erro iniciando API: {e}")
        return 1

def start_scheduler(args):
    """Inicia agendador"""
    credentials_map = {}
    
    if args.credentials_file:
        try:
            with open(args.credentials_file, 'r') as f:
                credentials_map = json.load(f)
        except Exception as e:
            logger.error(f"Erro lendo arquivo de credenciais: {e}")
            return 1
    
    logger.info("Iniciando agendador RPA")
    
    try:
        scheduler = setup_default_scheduler(credentials_map)
        scheduler.start()
        
        print("Agendador RPA iniciado. Jobs configurados:")
        for job in scheduler.list_jobs():
            print(f"  - {job['name']}: {job['next_run']}")
        
        print("\nPressione Ctrl+C para parar...")
        
        # Mantém o programa rodando
        try:
            while True:
                import time
                time.sleep(1)
        except KeyboardInterrupt:
            logger.info("Parando agendador...")
            scheduler.stop()
            return 0
            
    except Exception as e:
        logger.error(f"Erro no agendador: {e}")
        return 1

def list_portals(args):
    """Lista portais configurados"""
    print("Portais configurados:")
    print("=" * 50)
    
    for name, config in PORTALS.items():
        print(f"\nPortal: {name}")
        print(f"  Nome: {config.name}")
        print(f"  URLs: {len(config.content_urls)}")
        print(f"  Login necessário: {'Sim' if config.login_fields else 'Não'}")
        
        if args.verbose:
            print(f"  URL base: {config.url}")
            print("  URLs de conteúdo:")
            for url in config.content_urls:
                print(f"    - {url}")
    
    return 0

def main():
    """Função principal"""
    parser = argparse.ArgumentParser(
        description="RPA Legal Intelligence - Automação de monitoramento de legislações tributárias"
    )
    
    subparsers = parser.add_subparsers(dest="command", help="Comandos disponíveis")
    
    # Comando: execute
    execute_parser = subparsers.add_parser("execute", help="Executa RPA para portal específico")
    execute_parser.add_argument("portal", choices=list(PORTALS.keys()), help="Nome do portal")
    execute_parser.add_argument("-u", "--username", help="Usuário para login")
    execute_parser.add_argument("-p", "--password", help="Senha para login")
    execute_parser.add_argument("-c", "--credentials-file", help="Arquivo JSON com credenciais")
    execute_parser.set_defaults(func=execute_portal)
    
    # Comando: execute-all
    execute_all_parser = subparsers.add_parser("execute-all", help="Executa RPA para todos os portais")
    execute_all_parser.add_argument("-c", "--credentials-file", help="Arquivo JSON com credenciais")
    execute_all_parser.set_defaults(func=execute_all_portals)
    
    # Comando: api
    api_parser = subparsers.add_parser("api", help="Inicia servidor da API")
    api_parser.add_argument("--host", default="0.0.0.0", help="Host para API (padrão: 0.0.0.0)")
    api_parser.add_argument("--port", type=int, default=8080, help="Porta para API (padrão: 8080)")
    api_parser.set_defaults(func=start_api)
    
    # Comando: scheduler
    scheduler_parser = subparsers.add_parser("scheduler", help="Inicia agendador")
    scheduler_parser.add_argument("-c", "--credentials-file", help="Arquivo JSON com credenciais")
    scheduler_parser.set_defaults(func=start_scheduler)
    
    # Comando: list
    list_parser = subparsers.add_parser("list", help="Lista portais configurados")
    list_parser.add_argument("-v", "--verbose", action="store_true", help="Saída detalhada")
    list_parser.set_defaults(func=list_portals)
    
    # Parse dos argumentos
    args = parser.parse_args()
    
    if not args.command:
        parser.print_help()
        return 1
    
    # Executa comando
    try:
        return args.func(args)
    except KeyboardInterrupt:
        logger.info("Operação cancelada pelo usuário")
        return 1
    except Exception as e:
        logger.error(f"Erro inesperado: {e}")
        return 1

if __name__ == "__main__":
    sys.exit(main())