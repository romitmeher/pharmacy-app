"""
SmartPharm Backend — Flask Application Factory.

Creates and configures the Flask application instance.
Uses the factory pattern to support different configurations
(development, testing, production) and to avoid circular imports.
"""

from flask import Flask

from app.config import get_config
from app.extensions import db, migrate, bcrypt, cors
from app.utils.errors import register_error_handlers


def create_app(config_class=None):
    """Create and configure the Flask application.

    Args:
        config_class: Configuration class to use. If None, determined
                      by the FLASK_ENV environment variable.

    Returns:
        Configured Flask application instance.
    """
    application = Flask(__name__)

    # Load configuration
    if config_class is None:
        config_class = get_config()
    application.config.from_object(config_class)

    # Initialize extensions
    db.init_app(application)
    migrate.init_app(application, db)
    bcrypt.init_app(application)
    cors.init_app(
        application, origins=application.config.get("CORS_ORIGINS", [])
    )

    # Register error handlers
    register_error_handlers(application)

    # Import models so Alembic can detect them.
    # Uses importlib to avoid shadowing the local 'application' variable
    # with the 'app' module (since this file is app/__init__.py).
    import importlib
    with application.app_context():
        importlib.import_module("app.models")

    # Register API blueprints (added as APIs are implemented)
    # from app.api import register_blueprints
    # register_blueprints(application)

    # Health check endpoint
    @application.route("/api/health")
    def health_check():
        return {"status": "healthy", "service": "smartpharm-backend"}

    return application
