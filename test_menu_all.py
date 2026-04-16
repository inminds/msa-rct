"""
Lista TODOS os itens do menu Federal para identificar o 20º item
"""
import sys
sys.path.insert(0, '.')

from rpa_ncm_scanner.scraper import EconetScraper
import time

scraper = EconetScraper(headless=False)
scraper._start_browser()
page = scraper._page

try:
    scraper.login(username='onu41041', password='ms6003')
    print("✅ Login realizado\n")
    
    time.sleep(2)
    
    # Clica em Federal
    print("📍 Clicando em 'Federal'...")
    page.locator("text=Federal").first.click()
    time.sleep(2)
    
    # Busca TODOS os links/items do submenu (não filtrado)
    # Procura por elementos que parecem ser itens de menu
    print("\n🔍 Listando TODOS os itens do menu Federal:\n")
    
    # Tenta diferentes seletores para pegar os itens do menu
    items = page.locator("div[class*='menu'] a, div[class*='submenu'] a, aside a, nav a").all()
    
    print(f"Encontrados {len(items)} itens no total\n")
    
    for i, item in enumerate(items, 1):
        try:
            text = item.inner_text().strip()
            if text and len(text) < 100:  # Filtra itens com texto muito grande
                is_visible = item.is_visible()
                print(f"[{i:2d}] Texto: '{text}' | Visível: {is_visible}")
        except:
            pass
    
    print("\n" + "="*60)
    print("👉 Qual é o índice (1-based) do item correto que você vê?")
    print("   (Lembre: você disse que é o 20º item)")
    print("="*60)
    
    input("\nPressione Enter quando terminar de investigar...")
    
except Exception as e:
    print(f"❌ Erro: {e}")
    import traceback
    traceback.print_exc()

finally:
    scraper.close()
