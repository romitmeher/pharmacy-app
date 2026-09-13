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

    SQLALCHEMY_DATABASE_URI = (
        f"mysql+pymysql://{DB_USER}:{DB_PASSWORD}@{DB_HOST}:{DB_PORT}/{DB_NAME}"
        "?charset=utf8mb4"
    )
    SQLALCHEMY_TRACK_MODIFICATIONS = False

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


class ProductionConfig(Config):
    """Production environment configuration."""

    DEBUG = False

    @property
    def SECRET_KEY(self):
        key = os.environ.get("SECRET_KEY")
        if not key or key == "dev-secret-key-change-in-production":
            raise ValueError("SECRET_KEY must be set in production")
        return key


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
