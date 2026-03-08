from pathlib import Path
from pydantic_settings import BaseSettings
from functools import lru_cache

# .env načítáme ze složky backend (vedle app/), ne podle aktuálního pracovního adresáře
_BACKEND_DIR = Path(__file__).resolve().parent.parent
_ENV_FILE = _BACKEND_DIR / ".env"


class Settings(BaseSettings):
    # Database
    database_url: str = "postgresql://bettracker:bettracker123@localhost:5432/bettracker"

    # API server (neobvyklý port, aby nebyl konflikt s jinými systémy)
    port: int = 15555

    # Ollama
    ollama_url: str = "http://localhost:11434"
    ollama_vision_model: str = "llama3.2-vision"
    ollama_text_model: str = "mistral-small"

    # App
    app_name: str = "BetTracker"
    debug: bool = True

    # CORS – čárkou oddělený seznam povolených originů
    cors_origins: str = "http://localhost:3001,http://127.0.0.1:3001,http://10.0.1.42:3001"

    # Live skóre – fotbal přes football-data.org API
    football_data_org_api_key: str = ""

    class Config:
        env_file = str(_ENV_FILE) if _ENV_FILE.exists() else ".env"
        env_file_encoding = "utf-8"
        extra = "ignore"  # ignorovat staré proměnné z .env (např. SOFASCORE_*)


@lru_cache()
def get_settings() -> Settings:
    return Settings()
