"""
SmartPharm Backend — Application Configuration.

Environment-based configuration classes.
All sensitive values come from environment variables.
"""

import os
from dotenv import load_dotenv

load_dotenv()


class Config:
    """Base configuration shared across all environments."""

    SECRET_KEY = os.environ.get("SECRET_KEY", "dev-secret-key-change-in-production")

    # MySQL connection via PyMySQL
    DB_HOST = os.environ.get("DB_HOST", "localhost")
    DB_PORT = os.environ.get("DB_PORT", "3306")
    DB_NAME = os.environ.get("DB_NAME", "smartpharm")
    DB_USER = os.environ.get("DB_USER", "root")
    DB_PASSWORD = os.environ.get("DB_PASSWORD", "")
    DB_SSL_CA = os.environ.get("DB_SSL_CA", "")

    SQLALCHEMY_DATABASE_URI = (
        f"mysql+pymysql://{DB_USER}:{DB_PASSWORD}@{DB_HOST}:{DB_PORT}/{DB_NAME}"
        "?charset=utf8mb4"
    )
    SQLALCHEMY_TRACK_MODIFICATIONS = False

    # SSL configuration for Aiven / cloud MySQL
    SQLALCHEMY_ENGINE_OPTIONS = {}
    if DB_SSL_CA:
        _ssl_ca_path = DB_SSL_CA if os.path.isabs(DB_SSL_CA) else os.path.join(
            os.path.dirname(os.path.dirname(os.path.abspath(__file__))),
            DB_SSL_CA,
        )
        if os.path.exists(_ssl_ca_path):
            SQLALCHEMY_ENGINE_OPTIONS = {
                "connect_args": {
                    "ssl": {
                        "ca": _ssl_ca_path,
                    }
                }
            }
        else:
            SQLALCHEMY_ENGINE_OPTIONS = {
                "connect_args": {
                    "ssl": {
                        "ssl_mode": "REQUIRED",
                    }
                }
            }
    elif DB_HOST not in ("localhost", "127.0.0.1", "test_db"):
        SQLALCHEMY_ENGINE_OPTIONS = {
            "connect_args": {
                "ssl": {
                    "ssl_mode": "REQUIRED",
                }
            }
        }

    # Vector Database (Aiven PostgreSQL with pgvector)
    PGVECTOR_URL = os.environ.get("PGVECTOR_URL", "")
    PGVECTOR_SSL_CA = os.environ.get("PGVECTOR_SSL_CA", "VETca.pem")

    # CORS
    CORS_ORIGINS = os.environ.get("CORS_ORIGINS", "http://localhost:3000").split(",")



class DevelopmentConfig(Config):
    """Development environment configuration."""

    DEBUG = True


class TestingConfig(Config):
    """Testing environment configuration.

    Uses a separate test database to avoid polluting development data.
    """

    TESTING = True
    DB_NAME = os.environ.get("TEST_DB_NAME", "smartpharm_test")
    SQLALCHEMY_DATABASE_URI = (
        f"mysql+pymysql://{Config.DB_USER}:{Config.DB_PASSWORD}"
        f"@{Config.DB_HOST}:{Config.DB_PORT}/{DB_NAME}"
        "?charset=utf8mb4"
    )
    # Disable SSL connect_args for local test DB — tests use localhost/127.0.0.1.
    SQLALCHEMY_ENGINE_OPTIONS = {}


class ProductionConfig(Config):
    """Production environment configuration."""

    DEBUG = False
    # NOTE: Flask's config.from_object() reads class attributes, not instance
    # properties. Do NOT use @property here — it would store the descriptor
    # object rather than the string value. Instead, read env at class-body time
    # and fail fast if the key is missing or still set to the development placeholder.
    _prod_secret = os.environ.get("SECRET_KEY", "")
    if not _prod_secret or _prod_secret == "dev-secret-key-change-in-production":
        # In production the env var must be set before the process starts.
        # We raise here only when FLASK_ENV=production; dev/test configs never
        # reach this class.
        import sys
        if os.environ.get("FLASK_ENV", "").lower() == "production":
            raise ValueError(
                "SECRET_KEY environment variable must be set to a strong random value in production."
            )
    SECRET_KEY = _prod_secret or Config.SECRET_KEY
    del _prod_secret


# Map environment names to config classes
config_by_env = {
    "development": DevelopmentConfig,
    "testing": TestingConfig,
    "production": ProductionConfig,
}


def get_config():
    """Return the configuration class for the current environment."""
    env = os.environ.get("FLASK_ENV", "development").lower()
    return config_by_env.get(env, DevelopmentConfig)
