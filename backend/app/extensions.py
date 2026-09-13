"""
SmartPharm Backend — Flask Extension Instances.

Centralized extension instances to avoid circular imports.
Import these instances wherever extensions are needed.
"""

from flask_sqlalchemy import SQLAlchemy
from flask_migrate import Migrate
from flask_bcrypt import Bcrypt
from flask_cors import CORS

db = SQLAlchemy()
migrate = Migrate()
bcrypt = Bcrypt()
cors = CORS()
