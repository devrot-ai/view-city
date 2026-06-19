from typing import List

from pydantic import BaseSettings


class Settings(BaseSettings):
    """Environment-based configuration for the simulation app.

    Use a .env file or environment variables to override values. For
    CORS origins set `CORS_ORIGINS` as comma-separated list or `*`.
    """

    # Comma-separated origins string (eg: http://localhost:5173,https://example.com)
    cors_origins: str = "*"

    # Simulation defaults
    grid_size: int = 8
    default_tick_rate: int = 10

    # Debug / environment
    debug: bool = True
    # Enable JSON structured logging when True (overrides debug behavior if set)
    json_logging: bool = True

    class Config:
        env_file = ".env"
        env_file_encoding = "utf-8"

    def cors_list(self) -> List[str]:
        """Return a parsed list of CORS origins.

        - `*` => ["*"]
        - comma-separated string => trimmed list
        """
        if not self.cors_origins:
            return []
        raw = self.cors_origins.strip()
        if raw == "*":
            return ["*"]
        return [s.strip() for s in raw.split(",") if s.strip()]


settings = Settings()
