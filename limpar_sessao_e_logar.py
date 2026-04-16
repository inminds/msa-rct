"""
Script utilitário: apaga cookies salvos e faz login limpo no Econet.

Uso:
    python limpar_sessao_e_logar.py
"""

import json
import sys
from pathlib import Path

# Caminho do arquivo de cookies
SESSION_FILE = Path(__file__).parent / "rpa_ncm_scanner" / "session_cookies.json"


def main():
    # 1. Remove cookies antigos
    if SESSION_FILE.exists():
        SESSION_FILE.unlink()
        print(f"✅ Cookies antigos removidos: {SESSION_FILE}")
    else:
        print(f"ℹ️  Nenhum arquivo de cookies encontrado em {SESSION_FILE}")

    # 2. Importa config para pegar as credenciais
    sys.path.insert(0, str(Path(__file__).parent))
    from rpa_ncm_scanner.config import ECONET_USERNAME, ECONET_PASSWORD
    from rpa_ncm_scanner.scraper import EconetScraper
    from rpa_ncm_scanner.session_manager import save_cookies

    print(f"🔑 Fazendo login com usuário: {ECONET_USERNAME}")
    print("🌐 Abrindo browser (modo visível para reCAPTCHA)...")

    scraper = EconetScraper(headless=False)
    try:
        # Força login completo (sem tentar carregar cookies — já deletamos)
        scraper._start_browser()
        scraper._do_login(ECONET_USERNAME, ECONET_PASSWORD)
        save_cookies(scraper._context)
        print("✅ Login concluído! Cookies salvos. Pode rodar o scan agora:")
        print("   python -m rpa_ncm_scanner scan")
    except Exception as e:
        print(f"❌ Erro durante login: {e}")
        sys.exit(1)
    finally:
        scraper.close()


if __name__ == "__main__":
    main()
