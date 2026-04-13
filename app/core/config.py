from functools import lru_cache

from pydantic import computed_field
from pydantic_settings import BaseSettings, SettingsConfigDict
from sqlalchemy.engine import URL


class Settings(BaseSettings):
    app_name: str = "Attendance Management System"
    api_prefix: str = ""
    database_url: str | None = None
    mysql_user: str = "root"
    mysql_password: str = "password"
    mysql_host: str = "127.0.0.1"
    mysql_port: int = 3306
    mysql_db: str = "attendance_management"
    jwt_secret_key: str = "change-me-in-production"
    jwt_algorithm: str = "HS256"
    jwt_expire_minutes: int = 720
    bootstrap_admin_username: str = "admin"
    bootstrap_admin_password: str = "admin12345"
    groq_api_key: str | None = None
    groq_model: str = "llama-3.1-8b-instant"
    groq_timeout_seconds: float = 5.0

    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore",
    )

    @computed_field  # type: ignore[prop-decorator]
    @property
    def resolved_database_url(self) -> str:
        if self.database_url:
            return self.database_url
        return URL.create(
            drivername="mysql+pymysql",
            username=self.mysql_user,
            password=self.mysql_password,
            host=self.mysql_host,
            port=self.mysql_port,
            database=self.mysql_db,
        ).render_as_string(hide_password=False)


@lru_cache
def get_settings() -> Settings:
    return Settings()
