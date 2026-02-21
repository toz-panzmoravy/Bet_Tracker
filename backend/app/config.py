from pydantic_settings import BaseSettings
from functools import lru_cache


class Settings(BaseSettings):
    # Database
    database_url: str = "postgresql://bettracker:bettracker123@localhost:5432/bettracker"

    # Ollama
    ollama_url: str = "http://localhost:11434"
    ollama_vision_model: str = "llama3.2-vision"
    ollama_text_model: str = "mistral-small"

    # App
    app_name: str = "BetTracker"
    debug: bool = True

    class Config:
        env_file = ".env"
        env_file_encoding = "utf-8"


@lru_cache()
def get_settings() -> Settings:
    return Settings()
