"""
Script de Login Interativo - Mantém navegador aberto para reCAPTCHA manual
"""
import sys
sys.path.insert(0, '.')

from rpa_ncm_scanner.scraper import EconetScraper
from rpa_ncm_scanner.session_manager import is_session_valid
import time

print("="*60)
print("📱 ECONET LOGIN INTERATIVO")
print("="*60)

scraper = EconetScraper(headless=False)  # ← Navegador VISÍVEL
scraper._start_browser()
page = scraper._page

try:
    print("\n🔐 Iniciando login...")
    print("   Quando aparecer o reCAPTCHA, resolva-o manualmente!")
    print("   Aguardando...\n")
    
    # Chama login (que trata o reCAPTCHA)
    scraper.login(username='onu41041', password='ms6003')
    
    print("\n✅ LOGIN CONCLUÍDO COM SUCESSO!")
    print("   Sessão salva e pronta para usar no scan.\n")
    
    # Verifica se sessão é válida
    if is_session_valid():
        print("✅ Sessão validada!")
    else:
        print("⚠️  Sessão pode estar inválida - tente novamente")
    
    print("\n" + "="*60)
    print("👉 Você pode fechar o navegador agora.")
    print("   Próximo passo: rodar o scan!")
    print("="*60)
    
    input("\nPressione Enter para fechar...")
    
except Exception as e:
    print(f"\n❌ Erro durante login: {e}")
    import traceback
    traceback.print_exc()
    input("\nPressione Enter para fechar...")

finally:
    scraper.close()
