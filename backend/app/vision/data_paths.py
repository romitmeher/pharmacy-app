"""Portable dataset root shared by optional ingestion and benchmarking tools."""
import os
from pathlib import Path

DATA_ROOT = Path(os.environ.get("SMARTPHARM_DATA_DIR") or Path(__file__).resolve().parents[3] / "data")
