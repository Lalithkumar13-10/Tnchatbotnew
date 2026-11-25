"""API router package separating citizen-facing and officer/admin endpoints."""
from .admin import router as admin_router
from .citizen import router as citizen_router

__all__ = ["admin_router", "citizen_router"]
