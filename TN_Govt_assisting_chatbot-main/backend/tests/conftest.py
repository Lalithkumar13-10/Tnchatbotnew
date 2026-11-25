"""Pytest bootstrap configuring offline mock LLM mode and isolated SQLite DB before imports."""
from __future__ import annotations

import os
import pathlib
import sys

os.environ.setdefault("LLM_MODE", "mock")
os.environ.setdefault("DB_URL", "sqlite:///./test_nk.db")

_BACKEND_DIR = str(pathlib.Path(__file__).resolve().parents[1])
if _BACKEND_DIR not in sys.path:
    sys.path.insert(0, _BACKEND_DIR)
