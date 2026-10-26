"""Cloud Run entry point; never runs migrations or seeds business data."""
import os
from waitress import serve
from app import create_app

if __name__ == "__main__":
    serve(create_app(), host="0.0.0.0", port=int(os.environ.get("PORT", "8080")), threads=int(os.environ.get("WAITRESS_THREADS", "1")))
