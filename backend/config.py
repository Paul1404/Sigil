from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    database_url: str = "postgresql+asyncpg://user:password@localhost:5432/sigil"
    encryption_key: str = ""
    cors_origins: str = "http://localhost:5173"
    fetch_interval_hours: int = 6

    model_config = {"env_file": ".env", "env_file_encoding": "utf-8"}


settings = Settings()
