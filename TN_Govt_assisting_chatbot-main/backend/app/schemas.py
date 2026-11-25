"""Pydantic v2 schemas. IntakeResult is passed to Gemini as `response_format`
so extraction is schema-guaranteed, and is also the contract the intake engine
and API speak."""
from __future__ import annotations

import re
from enum import StrEnum
from typing import Literal

from pydantic import BaseModel, Field, field_validator

_PHONE_DIGITS_RE = re.compile(r"\D+")


class Category(StrEnum):
    streetlight = "streetlight"
    garbage = "garbage"
    water_supply = "water_supply"
    drainage = "drainage"
    sewage = "sewage"
    road = "road"
    other = "other"


class Severity(StrEnum):
    low = "low"
    medium = "medium"
    high = "high"


class GrievanceStatus(StrEnum):
    registered = "registered"
    assigned = "assigned"
    in_progress = "in_progress"
    escalated = "escalated"
    reopened = "reopened"
    resolved = "resolved"
    closed = "closed"


SlotState = Literal["filled", "missing", "ambiguous"]


class GpsPoint(BaseModel):
    lat: float = Field(..., ge=-90.0, le=90.0)
    lng: float = Field(..., ge=-180.0, le=180.0)


class Location(BaseModel):
    ward: str | None = Field(default=None, max_length=120)
    landmark: str | None = Field(default=None, max_length=200)
    address_text: str | None = Field(default=None, max_length=300)


class Extraction(BaseModel):
    category: Category | None = None
    sub_category: str | None = Field(default=None, max_length=120)
    description_clean: str | None = Field(default=None, max_length=2000)
    location: Location = Field(default_factory=Location)
    severity: Severity | None = None
    language_detected: Literal["ta", "ta-latin", "en", "mixed"] = "en"


class RequiredStatus(BaseModel):
    category: SlotState = "missing"
    location: SlotState = "missing"
    description: SlotState = "missing"


class IntakeResult(BaseModel):
    """Exact shape Gemini must return (response_format) and the engine consumes."""
    assistant_message: str
    extraction: Extraction = Field(default_factory=Extraction)
    required_status: RequiredStatus = Field(default_factory=RequiredStatus)
    sensitivity_hint: Literal["normal", "sensitive"] = "normal"
    action: Literal["ask", "ready_to_file"] = "ask"


def _normalize_phone(value: str) -> str:
    digits = _PHONE_DIGITS_RE.sub("", value or "")
    if not (10 <= len(digits) <= 15):
        raise ValueError("Phone number must contain between 10 and 15 digits.")
    return digits


# ---- API request/response models ----
class IntakeMessageIn(BaseModel):
    session_id: str = Field(..., min_length=1, max_length=128)
    ui_language: Literal["ta", "en"] = "en"
    text: str = Field(..., min_length=1, max_length=2000)
    gps: GpsPoint | None = None


class ConfirmIn(BaseModel):
    session_id: str = Field(..., min_length=1, max_length=128)
    ui_language: Literal["ta", "en"] = "en"
    reporter_phone: str = Field(..., min_length=10, max_length=20)
    category: Category
    ward: str | None = Field(default=None, max_length=120)
    landmark: str | None = Field(default=None, max_length=200)
    description: str = Field(..., min_length=1, max_length=2000)
    severity: Severity = Severity.medium
    gps: GpsPoint | None = None
    add_support_to: str | None = Field(default=None, max_length=64)
    bypass_dedup: bool | None = False

    @field_validator("reporter_phone")
    @classmethod
    def validate_phone(cls, value: str) -> str:
        return _normalize_phone(value)

    @field_validator("description")
    @classmethod
    def validate_description(cls, value: str) -> str:
        cleaned = value.strip()
        if not cleaned:
            raise ValueError("Description must not be empty.")
        return cleaned


class OtpIn(BaseModel):
    phone: str = Field(..., min_length=10, max_length=20)

    @field_validator("phone")
    @classmethod
    def validate_phone(cls, value: str) -> str:
        return _normalize_phone(value)


class OtpVerifyIn(BaseModel):
    phone: str = Field(..., min_length=10, max_length=20)
    code: str = Field(..., min_length=4, max_length=10)

    @field_validator("phone")
    @classmethod
    def validate_phone(cls, value: str) -> str:
        return _normalize_phone(value)

    @field_validator("code")
    @classmethod
    def validate_code(cls, value: str) -> str:
        return value.strip()


class FeedbackIn(BaseModel):
    rating: int = Field(..., ge=1, le=5)
    comment: str = Field(default="", max_length=500)


class AdminUpdateIn(BaseModel):
    status: GrievanceStatus | None = None
    officer_id: str | None = Field(default=None, min_length=2, max_length=64)
    note: str | None = Field(default=None, max_length=1000)
    actor: str | None = Field(default=None, min_length=2, max_length=64)
