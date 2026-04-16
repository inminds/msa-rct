"""
Teste interativo: Navegue manualmente pelo Econet e mostre os elementos
Você vai com headless=false para ver tudo em tempo real
"""
import sys
sys.path.insert(0, '.')

from rpa_ncm_scanner.scraper import EconetScraper
import time

scraper = EconetScraper(headless=False)
scraper._start_browser()
page = scraper._page

try:
    # Login fresco
    scraper.login(username='onu41041', password='ms6003')
    print("✅ Login realizado\n")
    
    time.sleep(2)
    
    print("📍 Clicando em 'Federal'...")
    page.locator("text=Federal").first.click()
    time.sleep(3)
    
    print("📍 Vendo qual é o elemento correto 'PIS / COFINS'...")
    print("   Procurando todos com texto exato 'PIS / COFINS'...\n")
    
    # Busca específica por "PIS / COFINS" (com espaços)
    links = page.locator('text=/PIS\\s*\\/\\s*COFINS/i')  # Regex para "PIS / COFINS"
    count = links.count()
    print(f"Encontrados {count} itens com 'PIS / COFINS'\n")
    
    for i in range(count):
        link = links.nth(i)
        text = link.inner_text()
        parent_text = link.locator('..').inner_text()
        is_visible = link.is_visible()
        print(f"[{i}] Visível: {is_visible}")
        print(f"    Link text: '{text}'")
        print(f"    Parent: '{parent_text[:80]}...'\n")
    
    print("="*60)
    print("👉 Qual desses links você quer clicar?")
    print("   (Digite o índice, ex: 0, 1, 2...)")
    idx = int(input("Índice: "))
    
    target = links.nth(idx)
    print(f"\n📍 Clicando no índice {idx}...")
    target.click()
    
    time.sleep(3)
    
    print("\n🔍 Procurando 'Busca do Produto' na página...")
    if page.locator("text=Busca do Produto").count() > 0:
        print("✅ ENCONTROU 'Busca do Produto'!")
    else:
        print("❌ NÃO encontrou 'Busca do Produto'")
        print("\n📸 Analisando página atual...")
        # Lista elementos com "Busca"
        search_items = page.locator("text=/Busca/i")
        if search_items.count() > 0:
            print(f"   Encontrados {search_items.count()} itens com 'Busca':")
            for i in range(min(5, search_items.count())):
                print(f"   [{i}] '{search_items.nth(i).inner_text()}'")
    
    input("\nPressione Enter para fechar...")
    
except Exception as e:
    print(f"❌ Erro: {e}")
    import traceback
    traceback.print_exc()

finally:
    scraper.close()
