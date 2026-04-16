"""
Teste interativo para debugar navegação do menu Econet
Abre o navegador em modo NÃO-headless para você ver tudo
"""
import sys
sys.path.insert(0, '.')

from rpa_ncm_scanner.scraper import EconetScraper
from rpa_ncm_scanner.config import ECONET_URL
import time

scraper = EconetScraper(headless=False)  # ← NÃO headless — você vê tudo!
scraper._start_browser()  # ← Inicia o browser primeiro!
page = scraper._page

try:
    # Login com sessão
    scraper.login(username='onu41041', password='ms6003')
    print("✅ Login realizado\n")
    
    time.sleep(2)
    
    # Clica em Federal
    print("📍 Clicando em 'Federal'...")
    page.locator("text=Federal").first.click()
    time.sleep(2)
    
    # Busca todos os elementos com "PIS/COFINS"
    print("\n🔍 Procurando todos os itens com 'PIS/COFINS'...")
    all_pis_cofins = page.locator("text=PIS/COFINS")
    count = all_pis_cofins.count()
    print(f"   Encontrados {count} elementos com 'PIS/COFINS'\n")
    
    for i in range(count):
        element = all_pis_cofins.nth(i)
        text = element.inner_text()
        is_visible = element.is_visible()
        print(f"   [{i}] Texto: '{text}' | Visível: {is_visible}")
    
    print("\n👀 Veja a tela e identifique qual é o correto!")
    print("   Qual índice (0, 1, 2...) é o 'PIS/COFINS' que você precisa?")
    
    # Mantém o navegador aberto
    print("\n⏸️  Navegador mantido aberto para você investigar...")
    print("   Feche o navegador para terminar o teste.")
    input("Pressione Enter quando terminar de investigar...")
    
except Exception as e:
    print(f"❌ Erro: {e}")
    import traceback
    traceback.print_exc()

finally:
    scraper.close()
