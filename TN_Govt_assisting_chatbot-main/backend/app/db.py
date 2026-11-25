"""Database engine, session, and ORM models.

Governance rule baked in here: the audit log is APPEND-ONLY and there is no
hard-delete path anywhere. Closure is a status, never a row deletion.
"""
from __future__ import annotations

import datetime as dt

from sqlalchemy import (
    DateTime,
    Float,
    ForeignKey,
    Index,
    Integer,
    String,
    Text,
    create_engine,
    event,
)
from sqlalchemy.orm import (
    DeclarativeBase,
    Mapped,
    mapped_column,
    relationship,
    sessionmaker,
)

from .config import DB_URL

engine = create_engine(
    DB_URL,
    connect_args={"check_same_thread": False} if DB_URL.startswith("sqlite") else {},
    pool_pre_ping=True,
)


@event.listens_for(engine, "connect")
def _configure_sqlite(dbapi_conn, _connection_record) -> None:
    """Enable WAL journal mode, foreign keys, and busy timeout on SQLite."""
    if not DB_URL.startswith("sqlite"):
        return
    cursor = dbapi_conn.cursor()
    try:
        cursor.execute("PRAGMA foreign_keys=ON")
        cursor.execute("PRAGMA journal_mode=WAL")
        cursor.execute("PRAGMA synchronous=NORMAL")
        cursor.execute("PRAGMA busy_timeout=5000")
    finally:
        cursor.close()


SessionLocal = sessionmaker(bind=engine, autoflush=False, autocommit=False)


class Base(DeclarativeBase):
    pass


def now() -> dt.datetime:
    """Return current UTC timestamp (naive UTC for consistent SQLite comparisons)."""
    return dt.datetime.now(dt.UTC).replace(tzinfo=None)


class Grievance(Base):
    __tablename__ = "grievances"
    __table_args__ = (
        Index("ix_grievances_dedup", "category", "ward", "status"),
        Index("ix_grievances_sla", "status", "sla_due_at"),
        Index("ix_grievances_sensitivity_created", "sensitivity", "created_at"),
    )

    id: Mapped[str] = mapped_column(String, primary_key=True)
    reporter_phone: Mapped[str] = mapped_column(String, index=True)
    gps_lat: Mapped[float | None] = mapped_column(Float, nullable=True)
    gps_lng: Mapped[float | None] = mapped_column(Float, nullable=True)
    channel: Mapped[str] = mapped_column(String, default="web")
    created_at: Mapped[dt.datetime] = mapped_column(DateTime, default=now, index=True)
    status: Mapped[str] = mapped_column(String, default="registered", index=True)
    ui_language: Mapped[str] = mapped_column(String, default="en")
    assigned_dept: Mapped[str] = mapped_column(String, index=True)
    assigned_officer_id: Mapped[str | None] = mapped_column(String, nullable=True, index=True)
    sla_due_at: Mapped[dt.datetime] = mapped_column(DateTime, index=True)
    escalation_level: Mapped[int] = mapped_column(Integer, default=0)
    sensitivity: Mapped[str] = mapped_column(String, default="normal", index=True)
    # model-extracted
    category: Mapped[str] = mapped_column(String, index=True)
    sub_category: Mapped[str | None] = mapped_column(String, nullable=True)
    description_clean: Mapped[str] = mapped_column(Text)
    description_raw: Mapped[str] = mapped_column(Text)   # citizen's exact words — write once
    language_detected: Mapped[str] = mapped_column(String, default="en")
    ward: Mapped[str | None] = mapped_column(String, nullable=True, index=True)
    landmark: Mapped[str | None] = mapped_column(String, nullable=True)
    address_text: Mapped[str | None] = mapped_column(String, nullable=True)
    severity: Mapped[str] = mapped_column(String, default="medium")
    # dedup / hotspot
    parent_grievance_id: Mapped[str | None] = mapped_column(String, nullable=True)
    reporter_count: Mapped[int] = mapped_column(Integer, default=1)

    events: Mapped[list[AuditEvent]] = relationship(
        back_populates="grievance", order_by="AuditEvent.id"
    )


class AuditEvent(Base):
    """Append-only. Never updated or deleted. Hash chain guarantees integrity."""
    __tablename__ = "audit_events"
    __table_args__ = (Index("ix_audit_grievance_seq", "grievance_id", "id"),)

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    grievance_id: Mapped[str] = mapped_column(ForeignKey("grievances.id"), index=True)
    event_type: Mapped[str] = mapped_column(String)   # created|status|assign|note|reopen|sensitive_access
    from_val: Mapped[str | None] = mapped_column(String, nullable=True)
    to_val: Mapped[str | None] = mapped_column(String, nullable=True)
    note: Mapped[str | None] = mapped_column(Text, nullable=True)
    actor_id: Mapped[str] = mapped_column(String)
    actor_role: Mapped[str] = mapped_column(String)
    at: Mapped[dt.datetime] = mapped_column(DateTime, default=now)
    prev_hash: Mapped[str | None] = mapped_column(String, nullable=True)
    hash: Mapped[str | None] = mapped_column(String, nullable=True)

    grievance: Mapped[Grievance] = relationship(back_populates="events")


class Officer(Base):
    __tablename__ = "officers"
    __table_args__ = (
        Index("ix_officers_role_ward", "role", "ward"),
        Index("ix_officers_role_dept", "role", "department"),
    )

    id: Mapped[str] = mapped_column(String, primary_key=True)
    name: Mapped[str] = mapped_column(String)
    role: Mapped[str] = mapped_column(String, index=True)   # ward_officer|dept_head|commissioner|collector|cm_cell|auditor
    department: Mapped[str | None] = mapped_column(String, nullable=True)
    ward: Mapped[str | None] = mapped_column(String, nullable=True)


class Feedback(Base):
    __tablename__ = "feedback"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    grievance_id: Mapped[str] = mapped_column(ForeignKey("grievances.id"), index=True)
    rating: Mapped[int] = mapped_column(Integer)
    comment: Mapped[str | None] = mapped_column(Text, nullable=True)
    at: Mapped[dt.datetime] = mapped_column(DateTime, default=now)


def get_db():
    """Yield a scoped SQLAlchemy session and close it deterministically."""
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


def init_db() -> None:
    """Create tables and indexes if they do not exist."""
    Base.metadata.create_all(engine)
