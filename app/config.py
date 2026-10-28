"""SmartSchedule AI 3.0 Configuration."""
import os
from pathlib import Path
from pydantic_settings import BaseSettings, SettingsConfigDict

ROOT_DIR = Path(__file__).resolve().parent.parent

class Settings(BaseSettings):
    PROJECT_NAME: str = "SmartSchedule AI 3.0"
    VERSION: str = "3.0.0"
    API_PREFIX: str = "/api"
    
    # Security
    SMARTSCHEDULE_API_KEY: str = os.getenv("SMARTSCHEDULE_API_KEY", "local-demo-key")
    JWT_SECRET_KEY: str = os.getenv("JWT_SECRET_KEY", "smartschedule-super-secret-key-change-in-production-123456789")
    JWT_ALGORITHM: str = "HS256"
    JWT_ACCESS_TOKEN_EXPIRE_MINUTES: int = 60 * 24  # 24 hours
    
    # Database: SQLite default for local, or PostgreSQL
    DATABASE_URL: str = os.getenv(
        "DATABASE_URL",
        os.getenv("SMARTSCHEDULE_DB", f"sqlite:///{ROOT_DIR / 'smartschedule.db'}")
    )
    
    # SMTP Settings (Dry-run by default)
    SMTP_ENABLED: bool = os.getenv("SMTP_ENABLED", "false").lower() == "true"
    SMTP_HOST: str = os.getenv("SMTP_HOST", "smtp.example.com")
    SMTP_PORT: int = int(os.getenv("SMTP_PORT", "587"))
    SMTP_USERNAME: str = os.getenv("SMTP_USERNAME", "demo@smartschedule.local")
    SMTP_PASSWORD: str = os.getenv("SMTP_PASSWORD", "")
    SMTP_FROM: str = os.getenv("SMTP_FROM", "notifications@smartschedule.local")
    
    # UiPath Integration Settings
    UIPATH_WEBHOOK_URL: str = os.getenv("UIPATH_WEBHOOK_URL", "")
    UIPATH_AUTH_TOKEN: str = os.getenv("UIPATH_AUTH_TOKEN", "")
    UIPATH_ENABLED: bool = os.getenv("UIPATH_ENABLED", "false").lower() == "true"
    
    # Scheduling weights
    WEIGHT_PREFERENCE_PROXIMITY: float = 0.40
    WEIGHT_STAFF_BALANCE: float = 0.30
    WEIGHT_BUFFER_EFFICIENCY: float = 0.20
    WEIGHT_URGENCY: float = 0.10
    
    # Recovery settings
    SLOT_OFFER_EXPIRY_MINUTES: int = 30  # Configurable response deadline

    model_config = SettingsConfigDict(env_file=".env", extra="allow")

settings = Settings()
