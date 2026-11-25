"""FastAPI application factory: wires middleware, routers, error handling, and frontends."""
from __future__ import annotations

import logging
from contextlib import asynccontextmanager
from pathlib import Path
from typing import Any

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse, RedirectResponse
from fastapi.staticfiles import StaticFiles

from . import config
from .db import init_db
from .llm_gateway import POOL
from .routers import admin_router, citizen_router
from .security import apply_security_headers

logger = logging.getLogger(__name__)
FRONTEND_DIR = Path(__file__).resolve().parents[2] / "frontend"


@asynccontextmanager
async def lifespan(_app: FastAPI):
    """Validate production security invariants and initialize database schema on startup."""
    config.validate_production_config()
    init_db()
    logger.info(
        "Nagar Kuraiteer started (city=%s, llm_live=%s)",
        config.CITY_NAME,
        config.llm_is_live(),
    )
    yield


def create_app() -> FastAPI:
    """Build and configure the FastAPI application instance."""
    application = FastAPI(
        title="Nagar Kuraiteer — Civic Grievance Platform",
        version="1.0.0",
        lifespan=lifespan,
    )

    application.add_middleware(
        CORSMiddleware,
        allow_origins=config.CORS_ORIGINS,
        allow_methods=["GET", "POST", "PATCH", "OPTIONS"],
        allow_headers=["Content-Type", "Authorization", "X-Role", "X-Admin-Key"],
    )
    application.middleware("http")(apply_security_headers)

    @application.exception_handler(Exception)
    async def unhandled_exception_handler(
        _request: Request, exc: Exception
    ) -> JSONResponse:
        logger.exception("Unhandled server error: %s", type(exc).__name__)
        return JSONResponse(
            status_code=500,
            content={"detail": "Internal server error. Please try again later."},
        )

    @application.get("/health", tags=["system"])
    def health() -> dict[str, Any]:
        return {
            "ok": True,
            "city": config.CITY_NAME,
            "llm_live": config.llm_is_live(),
        }

    @application.get("/health/llm", tags=["system"])
    def health_llm() -> dict[str, Any]:
        return {"live": config.llm_is_live(), "pool": POOL.status()}

    application.include_router(citizen_router)
    application.include_router(admin_router)

    if FRONTEND_DIR.exists():
        application.mount(
            "/app",
            StaticFiles(directory=str(FRONTEND_DIR), html=True),
            name="frontend",
        )

    @application.get("/", include_in_schema=False)
    def root() -> RedirectResponse:
        return RedirectResponse("/app/citizen.html")

    return application


app = create_app()

__all__ = ["app", "create_app"]
