"""
Script utilitário: apaga o perfil Chrome salvo e faz login limpo no Econet.

Use quando:
- Quiser forçar um novo login (sessão expirou ou credenciais mudaram)
- O scraper estiver com problemas de autenticação

Uso:
    python limpar_sessao_e_logar.py
"""

import shutil
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))

from rpa_ncm_scanner.config import CHROME_USER_DATA_DIR, ECONET_USERNAME, ECONET_PASSWORD
from rpa_ncm_scanner.scraper import EconetScraper


def main():
    # 1. Remove perfil Chrome salvo (força novo login)
    if CHROME_USER_DATA_DIR.exists():
        shutil.rmtree(CHROME_USER_DATA_DIR)
        print(f"✅ Perfil Chrome removido: {CHROME_USER_DATA_DIR}")
    else:
        print(f"ℹ️  Nenhum perfil encontrado em {CHROME_USER_DATA_DIR}")

    print(f"🔑 Fazendo login com usuário: {ECONET_USERNAME}")
    print("🌐 Abrindo Chrome (modo visível para reCAPTCHA)...")

    scraper = EconetScraper(headless=False)
    try:
        scraper.login(ECONET_USERNAME, ECONET_PASSWORD)
        print("✅ Login concluído! Sessão salva no perfil Chrome.")
        print("   Próximas execuções não precisarão de login:")
        print("   python -m rpa_ncm_scanner scan")
    except Exception as e:
        print(f"❌ Erro durante login: {e}")
        sys.exit(1)
    finally:
        scraper.close()


if __name__ == "__main__":
    main()
