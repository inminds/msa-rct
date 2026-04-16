import os
from pathlib import Path

BASE_DIR = Path(__file__).parent
SESSION_FILE = BASE_DIR / "session_cookies.json"
SCREENSHOTS_DIR = BASE_DIR / "screenshots"
ECONET_URL = "https://www.econeteditora.com.br"
NODE_API_URL = os.getenv("NODE_API_URL", "http://127.0.0.1:5000")
NODE_API_KEY = os.getenv("NODE_API_KEY", "dev-internal-key")
ANTHROPIC_API_KEY = os.getenv("ANTHROPIC_API_KEY", "")
HEADLESS = os.getenv("HEADLESS", "false").lower() == "true"
REQUEST_DELAY = 2.0  # seconds between requests
