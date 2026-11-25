"""Deterministic stand-in for the Gemini intake call.

Runs when no GEMINI_API_KEY is set (and in tests). It mimics the real model's
behaviour closely enough to demo and test the full state machine: keyword-based
category + severity + sensitivity detection, simple location parsing, and the
same 'ask one thing / ready_to_file' decision logic the prompt asks Gemini for.
"""
from __future__ import annotations

import json
import re
from typing import Literal

from . import config
from .schemas import (
    Category,
    Extraction,
    IntakeResult,
    Location,
    RequiredStatus,
    Severity,
)

_CATEGORY_HINTS: dict[Category, tuple[str, ...]] = {
    Category.streetlight: (
        "street light", "streetlight", "தெருவிளக்கு", "lamp", "light",
        "eriyala", "எரியல", "விளக்கு",
    ),
    Category.garbage: (
        "garbage", "trash", "waste", "குப்பை", "கழிவு", "kuppai", "rubbish", "bin",
    ),
    Category.water_supply: (
        "water", "தண்ணீ", "தண்ணி", "குடிநீர்", "thanni", "supply", "no water", "tap",
    ),
    Category.drainage: (
        "drain", "storm water", "வடிகால்", "flood", "water logging", "மழைநீர்",
    ),
    Category.sewage: (
        "sewage", "sewer", "manhole", "சாக்கடை", "கழிவுநீர்", "overflow", "மேன்ஹோல்",
    ),
    Category.road: (
        "road", "pothole", "pit", "சாலை", "பள்ளம்", "pallam", "rasta", "ரோடு",
    ),
}

_ALL_CATEGORY_HINTS: tuple[str, ...] = tuple(
    hint for hints in _CATEGORY_HINTS.values() for hint in hints
)

_HIGH_SEVERITY_HINTS: tuple[str, ...] = (
    "manhole", "மேன்ஹோல்", "live wire", "current", "மின்சாரம்", "dark", "இருட்ட",
    "ratri", "ராத்திரி", "flood", "overflow", "danger", "ஆபத்து", "shock",
    "spark", "night",
)

_REFUSAL_HINTS: tuple[str, ...] = (
    "don't know", "dont know", "no idea", "i don't", "idk", "teriyathu", "தெரியாது",
)

_SENSITIVE_LOWER: tuple[str, ...] = tuple(k.lower() for k in config.SENSITIVE_KEYWORDS)
_WARD_AREAS: tuple[tuple[str, str], ...] = tuple(
    (w.split(" (")[0].lower(), w)
    for w in config.WARDS
    if "not listed" not in w.lower()
)

_TAMIL_RE = re.compile(r"[\u0B80-\u0BFF]")
_LATIN_RE = re.compile(r"[a-zA-Z]")


def _detect_category(text_lower: str) -> Category | None:
    for cat, hints in _CATEGORY_HINTS.items():
        if any(h in text_lower for h in hints):
            return cat
    return None


def _detect_ward(text_lower: str) -> str | None:
    for area, full_ward in _WARD_AREAS:
        if area in text_lower:
            return full_ward
    return None


def _detect_lang(text: str) -> Literal["ta", "en", "mixed"]:
    has_tamil = bool(_TAMIL_RE.search(text))
    has_latin = bool(_LATIN_RE.search(text))
    if has_tamil and has_latin:
        return "mixed"
    if has_tamil:
        return "ta"
    return "en"


def _sensitive(text_lower: str) -> bool:
    return any(k in text_lower for k in _SENSITIVE_LOWER)


def _parse_known(blob: str) -> dict:
    prefix = blob.strip()
    if prefix.startswith("KNOWN:"):
        prefix = prefix[6:].strip()
    try:
        data = json.loads(prefix)
        return data if isinstance(data, dict) else {}
    except json.JSONDecodeError:
        return {}


def _has_value(known_map: dict, key: str) -> bool:
    val = known_map.get(key)
    return bool(val and str(val).strip() not in ("", "null", "None"))


def mock_intake(user_content: str) -> IntakeResult:
    """Deterministic intake extractor mirroring the Gemini system prompt rules."""
    parts = user_content.split("---", 1)
    known_raw = parts[0]
    latest = parts[1].strip() if len(parts) > 1 else user_content.strip()
    known_map = _parse_known(known_raw)

    full_lower = user_content.lower()
    latest_lower = latest.lower()

    cat = _detect_category(full_lower)
    ward = _detect_ward(full_lower)
    lang = _detect_lang(latest)
    sev = (
        Severity.high
        if any(h in full_lower for h in _HIGH_SEVERITY_HINTS)
        else Severity.medium
    )

    already_have_desc = _has_value(known_map, "description_clean")
    already_have_loc = (
        _has_value(known_map, "ward")
        or _has_value(known_map, "landmark")
        or _has_value(known_map, "address_text")
    )
    already_have_cat = _has_value(known_map, "category")

    # Use latest non-trivial citizen text ONLY if we don't have a description yet.
    desc = None
    if not already_have_desc and len(latest) > 8:
        desc = latest

    # If we already have a description but not a location, treat a non-refusal
    # non-category reply as free-text address/landmark.
    address_text = None
    if not already_have_loc and not ward and already_have_desc:
        is_refusal = any(w in latest_lower for w in _REFUSAL_HINTS)
        is_category_hint = any(h in latest_lower for h in _ALL_CATEGORY_HINTS)
        if not is_refusal and not is_category_hint:
            address_text = latest

    have_cat = cat is not None or already_have_cat
    have_loc = ward is not None or already_have_loc or address_text is not None
    have_desc = desc is not None or already_have_desc

    rs = RequiredStatus(
        category="filled" if have_cat else "missing",
        location="filled" if have_loc else "missing",
        description="filled" if have_desc else "missing",
    )

    action: Literal["ask", "ready_to_file"]
    if not have_loc:
        msg = (
            "இது எந்தப் பகுதி அல்லது வார்டில்?"
            if lang == "ta"
            else "Which area or ward is this in?"
        )
        action = "ask"
    elif not have_cat:
        msg = (
            "என்ன பிரச்சினை என்று சொல்ல முடியுமா?"
            if lang == "ta"
            else "What is the problem exactly?"
        )
        action = "ask"
    elif not have_desc:
        msg = (
            "சிறிது விவரம் சொல்லுங்கள்."
            if lang == "ta"
            else "Could you describe it briefly?"
        )
        action = "ask"
    else:
        msg = (
            "நன்றி. உங்கள் புகாரின் விவரங்கள் கீழே தயார் செய்யப்பட்டுள்ளன. தயவுசெய்து அவற்றைச் சரிபார்த்து சமர்ப்பிக்கவும்."
            if lang == "ta"
            else "Thank you. The details of your grievance have been drafted below. Please review and submit."
        )
        action = "ready_to_file"

    return IntakeResult(
        assistant_message=msg,
        extraction=Extraction(
            category=cat,
            description_clean=desc,
            location=Location(ward=ward, address_text=address_text),
            severity=sev,
            language_detected=lang,
        ),
        required_status=rs,
        sensitivity_hint="sensitive" if _sensitive(full_lower) else "normal",
        action=action,
    )
