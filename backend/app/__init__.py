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

    # Register API blueprints
    from app.api.auth import auth_bp
    from app.api.medicines import medicines_bp
    from app.api.locations import locations_bp
    from app.api.suppliers import suppliers_bp
    from app.api.inventory import inventory_bp
    from app.api.sales import sales_bp
    from app.api.purchases import purchases_bp
    from app.api.vision import vision_bp
    from app.api.distributor import distributor_bp
    from app.api.ai import ai_bp
    from app.api.ml import ml_bp
    from app.api.shelf import shelf_bp
    from app.api.sync import sync_bp
    from app.api.voice import voice_bp
    from app.api.multibranch import multibranch_bp
    from app.api.audit import audit_bp
    from app.api.returns import returns_bp
    from app.api.prescriptions import prescriptions_bp
    from app.api.expenses import expenses_bp
    application.register_blueprint(auth_bp)
    application.register_blueprint(medicines_bp)
    application.register_blueprint(locations_bp)
    application.register_blueprint(suppliers_bp)
    application.register_blueprint(inventory_bp)
    application.register_blueprint(sales_bp)
    application.register_blueprint(purchases_bp)
    application.register_blueprint(vision_bp)
    application.register_blueprint(distributor_bp)
    application.register_blueprint(ai_bp)
    application.register_blueprint(ml_bp)
    application.register_blueprint(shelf_bp)
    application.register_blueprint(sync_bp)
    application.register_blueprint(voice_bp)
    application.register_blueprint(multibranch_bp)
    application.register_blueprint(audit_bp)
    application.register_blueprint(returns_bp)
    application.register_blueprint(prescriptions_bp)
    application.register_blueprint(expenses_bp)



    # Health check endpoint
    @application.route("/api/health")
    def health_check():
        return {"status": "healthy", "service": "smartpharm-backend"}

    return application
