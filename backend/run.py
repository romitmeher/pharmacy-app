"""
SmartPharm Backend — Application Entry Point.

Run with: python run.py
Or use: flask run (after setting FLASK_APP=run.py)
"""

from app import create_app

app = create_app()

if __name__ == "__main__":
    app.run(host="0.0.0.0", port=5000)
