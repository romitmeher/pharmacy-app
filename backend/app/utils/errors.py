"""
SmartPharm Backend — Centralized Error Handling.

Defines application-specific exception classes and registers
Flask error handlers for consistent JSON error responses.
"""

from flask import jsonify


# ---------------------------------------------------------------------------
# Application Exception Hierarchy
# ---------------------------------------------------------------------------

class SmartPharmError(Exception):
    """Base exception for all SmartPharm application errors."""

    status_code = 500
    default_message = "An unexpected error occurred."

    def __init__(self, message=None, details=None):
        self.message = message or self.default_message
        self.details = details
        super().__init__(self.message)

    def to_dict(self):
        error = {
            "error": self.__class__.__name__,
            "message": self.message,
        }
        if self.details:
            error["details"] = self.details
        return error


class ValidationError(SmartPharmError):
    """Raised when request data fails validation."""

    status_code = 400
    default_message = "Validation failed."


class AuthenticationError(SmartPharmError):
    """Raised when authentication fails (wrong credentials, missing token)."""

    status_code = 401
    default_message = "Authentication required."


class AuthorizationError(SmartPharmError):
    """Raised when the user lacks permission for the requested action."""

    status_code = 403
    default_message = "You do not have permission to perform this action."


class NotFoundError(SmartPharmError):
    """Raised when a requested resource does not exist."""

    status_code = 404
    default_message = "The requested resource was not found."


class ConflictError(SmartPharmError):
    """Raised when an action conflicts with existing data (e.g., duplicate entry)."""

    status_code = 409
    default_message = "The request conflicts with existing data."


class ExternalServiceError(SmartPharmError):
    """Raised when an external service (OCR, AI, etc.) fails."""

    status_code = 502
    default_message = "An external service is currently unavailable."


# ---------------------------------------------------------------------------
# Flask Error Handler Registration
# ---------------------------------------------------------------------------

def register_error_handlers(app):
    """Register error handlers on the Flask app for consistent JSON responses."""

    @app.errorhandler(SmartPharmError)
    def handle_smartpharm_error(error):
        response = jsonify(error.to_dict())
        response.status_code = error.status_code
        return response

    @app.errorhandler(404)
    def handle_404(error):
        return jsonify({
            "error": "NotFound",
            "message": "The requested URL was not found on the server.",
        }), 404

    @app.errorhandler(405)
    def handle_405(error):
        return jsonify({
            "error": "MethodNotAllowed",
            "message": "The HTTP method is not allowed for this endpoint.",
        }), 405

    @app.errorhandler(500)
    def handle_500(error):
        # Log the actual error server-side; return a generic message to the client.
        app.logger.error(f"Internal server error: {error}")
        return jsonify({
            "error": "InternalServerError",
            "message": "An unexpected error occurred. Please try again later.",
        }), 500
