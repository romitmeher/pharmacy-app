"""The interactive stocking path must use PostgreSQL, never a local fallback."""
from unittest.mock import MagicMock

import pytest
from flask import Flask
from app.vision import stocking
from app.vision import stocking_pg


def test_runtime_uses_postgres_even_with_fixture_directory(monkeypatch, tmp_path):
    app = Flask(__name__)
    app.config['PGVECTOR_URL'] = 'postgresql://configured'
    sentinel = object()
    factory = MagicMock(return_value=sentinel)
    monkeypatch.setattr(stocking_pg, 'PostgresStockingConnection', factory)
    monkeypatch.setenv('SMARTPHARM_STOCKING_DIR', str(tmp_path))
    with app.app_context():
        assert stocking.connect() is sentinel
    factory.assert_called_once_with('postgresql://configured')
    assert not list(tmp_path.iterdir())


def test_runtime_missing_postgres_fails_without_creating_sqlite(tmp_path, monkeypatch):
    app = Flask(__name__)
    monkeypatch.setenv('SMARTPHARM_STOCKING_DIR', str(tmp_path))
    with app.app_context(), pytest.raises(ValueError, match='PostgreSQL'):
        stocking.connect()
    assert not list(tmp_path.iterdir())


def test_postgres_transaction_rolls_back_failed_feedback():
    adapter = object.__new__(stocking_pg.PostgresStockingConnection)
    adapter.connection = MagicMock()
    with pytest.raises(RuntimeError):
        with adapter:
            raise RuntimeError('interrupted feedback')
    adapter.connection.rollback.assert_called_once()
    adapter.connection.commit.assert_not_called()
