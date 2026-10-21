"""Fresh installation and cloud-isolation regression checks."""
from pathlib import Path

from alembic import command
from alembic.autogenerate import compare_metadata
from alembic.config import Config
from alembic.migration import MigrationContext
from flask import Flask
from sqlalchemy import inspect

from app.extensions import db, migrate
from app.config import TestingConfig
from app.ai.vector_store import MedicineVectorIndex


def test_migrations_cover_models_and_round_trip(tmp_path):
    application = Flask(__name__)
    application.config.update(
        TESTING=True,
        SQLALCHEMY_DATABASE_URI="sqlite:///" + str(tmp_path / "migration.db"),
    )
    db.init_app(application)
    migrate.init_app(application, db)
    directory = Path(__file__).resolve().parents[1] / "migrations"
    config = Config(str(directory / "alembic.ini"))
    config.set_main_option("script_location", str(directory))
    with application.app_context():
        command.upgrade(config, "head")
        tables = set(inspect(db.engine).get_table_names())
        assert set(db.metadata.tables) == tables - {"alembic_version"}
        with db.engine.connect() as connection:
            assert compare_metadata(MigrationContext.configure(connection), db.metadata) == []
        # The new migration can be rolled back independently and reapplied.
        command.downgrade(config, "6832551117fc")
        assert "prescriptions" not in inspect(db.engine).get_table_names()
        command.upgrade(config, "head")
        command.downgrade(config, "base")
        assert set(inspect(db.engine).get_table_names()) <= {"alembic_version"}
        db.engine.dispose()


def test_testing_config_is_local():
    assert TestingConfig.SQLALCHEMY_DATABASE_URI == "sqlite:///:memory:"
    assert TestingConfig.PGVECTOR_URL == ""
    assert TestingConfig.GEMINI_API_KEY == ""


def test_testing_blocks_vector_connection_even_with_cloud_environment(app, monkeypatch):
    monkeypatch.setenv("PGVECTOR_URL", "postgresql://example.invalid/should-not-connect")
    with app.app_context():
        assert MedicineVectorIndex()._get_pg_connection() is None


def test_vector_index_without_optional_url_never_connects(monkeypatch):
    monkeypatch.delenv("PGVECTOR_URL", raising=False)
    assert MedicineVectorIndex()._get_pg_connection() is None


def test_vector_fallback_never_returns_another_stores_catalog(db):
    index = MedicineVectorIndex()
    index.index_medicine(101, 9999, "Private medicine", "Paracetamol", "General")
    assert index.search_semantic_knowledge("Paracetamol", store_id=1234) == []
