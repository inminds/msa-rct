"""
Script de demonstração e teste do RPA Legal Intelligence
Executa teste básico do sistema sem necessidade de credenciais
"""

import os
import sys
import json
from datetime import datetime

# Adiciona diretório pai ao path para importações
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from rpa_legal_intelligence.config import PORTALS, RPAConfig
from rpa_legal_intelligence.database import RPADatabase
from rpa_legal_intelligence.diff_engine import DiffEngine
from rpa_legal_intelligence.logger import setup_rpa_logger

def test_database_connection():
    """Testa conexão com banco PostgreSQL"""
    print("\n🔍 Testando conexão com banco PostgreSQL...")
    
    try:
        with RPADatabase() as db:
            # Testa criação de tabelas
            print("✅ Conexão estabelecida com sucesso")
            print("✅ Tabelas RPA criadas/verificadas")
            
            # Testa inserção básica
            execution_id = db.start_execution("test_portal")
            print(f"✅ Execução de teste criada: {execution_id}")
            
            # Atualiza execução
            db.update_execution(execution_id, status="COMPLETED", urls_processed=1)
            print("✅ Execução atualizada com sucesso")
            
            return True
            
    except Exception as e:
        print(f"❌ Erro na conexão com banco: {e}")
        return False

def test_diff_engine():
    """Testa sistema de detecção de diferenças"""
    print("\n🧠 Testando sistema de detecção de diferenças...")
    
    try:
        diff_engine = DiffEngine()
        
        # Conteúdo de teste
        old_content = """
        Art. 1º - A alíquota do ICMS para produtos industrializados é de 18%.
        § 1º - Esta alíquota aplica-se a partir de 01/01/2024.
        Art. 2º - O prazo para recolhimento é até o dia 10 do mês seguinte.
        """
        
        new_content = """
        Art. 1º - A alíquota do ICMS para produtos industrializados é de 20%.
        § 1º - Esta alíquota aplica-se a partir de 01/03/2024.
        Art. 2º - O prazo para recolhimento é até o dia 15 do mês seguinte.
        """
        
        # Testa detecção de mudanças
        result = diff_engine.detect_changes(old_content, new_content)
        
        if result["has_changes"]:
            print(f"✅ Mudanças detectadas: {result['change_count']}")
            print(f"✅ Importância: {result['importance']}")
            print(f"✅ Resumo: {result['summary']}")
            
            # Lista mudanças específicas
            for i, change in enumerate(result['changes'], 1):
                print(f"   {i}. {change.change_type}: {change.section} - {change.importance}")
        else:
            print("❌ Nenhuma mudança detectada (esperado mudanças)")
            return False
            
        return True
        
    except Exception as e:
        print(f"❌ Erro no sistema de diff: {e}")
        return False

def test_portals_configuration():
    """Testa configuração dos portais"""
    print("\n⚙️ Testando configuração dos portais...")
    
    try:
        print(f"✅ Total de portais configurados: {len(PORTALS)}")
        
        for name, config in PORTALS.items():
            print(f"\n📋 Portal: {config.name} ({name})")
            print(f"   URLs de conteúdo: {len(config.content_urls)}")
            print(f"   Requer login: {'Sim' if config.login_fields else 'Não'}")
            print(f"   Rate limit: {config.rate_limit_seconds}s")
            
            # Valida seletores CSS
            required_selectors = ['content_area']
            missing_selectors = [s for s in required_selectors if s not in config.selectors]
            
            if missing_selectors:
                print(f"   ⚠️ Seletores faltando: {missing_selectors}")
            else:
                print("   ✅ Seletores básicos configurados")
        
        return True
        
    except Exception as e:
        print(f"❌ Erro na configuração: {e}")
        return False

def test_logger():
    """Testa sistema de logging"""
    print("\n📝 Testando sistema de logging...")
    
    try:
        logger = setup_rpa_logger("test_demo", level="INFO")
        
        # Testa diferentes níveis de log
        logger.info("Teste de log INFO")
        logger.warning("Teste de log WARNING")
        logger.error("Teste de log ERROR")
        
        print("✅ Sistema de logging funcionando")
        return True
        
    except Exception as e:
        print(f"❌ Erro no sistema de logging: {e}")
        return False

def show_system_info():
    """Exibe informações do sistema"""
    print("\n💻 Informações do Sistema RPA:")
    print(f"   Python: {sys.version.split()[0]}")
    print(f"   Diretório de trabalho: {os.getcwd()}")
    print(f"   DATABASE_URL: {'Configurado' if RPAConfig.DATABASE_URL else 'Não configurado'}")
    print(f"   Chrome headless: {RPAConfig.CHROME_HEADLESS}")
    print(f"   Timeout de execução: {RPAConfig.EXECUTION_TIMEOUT}s")

def generate_demo_report(results):
    """Gera relatório de demonstração"""
    print("\n" + "="*60)
    print("📊 RELATÓRIO DE DEMONSTRAÇÃO - RPA LEGAL INTELLIGENCE")
    print("="*60)
    
    passed = sum(results.values())
    total = len(results)
    
    print(f"\n🎯 Resultado Geral: {passed}/{total} testes passaram")
    
    print(f"\n📋 Detalhes dos Testes:")
    for test_name, passed in results.items():
        status = "✅ PASSOU" if passed else "❌ FALHOU"
        print(f"   {test_name}: {status}")
    
    if passed == total:
        print("\n🎉 TODOS OS TESTES PASSARAM!")
        print("   O sistema RPA está pronto para uso em produção.")
        print("\n🚀 Próximos passos:")
        print("   1. Configure credenciais nos portais desejados")
        print("   2. Execute: python run_rpa.py execute [portal]")
        print("   3. Ou inicie o agendador: python run_rpa.py scheduler")
    else:
        print("\n⚠️ ALGUNS TESTES FALHARAM")
        print("   Verifique a configuração antes de usar em produção.")

def main():
    """Função principal da demonstração"""
    print("🚀 RPA LEGAL INTELLIGENCE - DEMONSTRAÇÃO E TESTE")
    print("Machado Schütz Advogados & InMinds Technology")
    print("="*60)
    
    show_system_info()
    
    # Executa testes
    results = {
        "Configuração de Portais": test_portals_configuration(),
        "Sistema de Logging": test_logger(),
        "Sistema de Diff": test_diff_engine(),
        "Conexão com Banco": test_database_connection()
    }
    
    # Gera relatório
    generate_demo_report(results)
    
    print(f"\n⏰ Demonstração concluída em: {datetime.now().strftime('%d/%m/%Y %H:%M:%S')}")
    print("="*60)

if __name__ == "__main__":
    main()