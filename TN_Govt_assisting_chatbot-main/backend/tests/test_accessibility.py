"""Automated WCAG 2.1 AA Accessibility & Frontend Security Hygiene Tests.

Uses only the Python standard library so accessibility regressions (missing
labels, broken heading hierarchy, disabled zoom, low contrast, inline JS/XSS
sinks, missing ARIA landmarks/dialogs) are caught automatically in CI.
"""
from __future__ import annotations

import pathlib
import re
from html.parser import HTMLParser

FRONTEND_DIR = pathlib.Path(__file__).resolve().parents[2] / "frontend"


class _A11yHtmlAuditor(HTMLParser):
    def __init__(self) -> None:
        super().__init__()
        self.html_lang: str | None = None
        self.viewport: str | None = None
        self.has_title = False
        self.has_header = False
        self.has_main = False
        self.main_id: str | None = None
        self.skip_links: list[str] = []
        self.headings: list[int] = []
        self.label_fors: set[str] = set()
        self.controls: list[dict[str, str]] = []
        self.inline_handlers: list[tuple[str, str]] = []
        self.inline_scripts = 0
        self.inline_styles = 0
        self.live_regions: list[str] = []
        self.dialogs: list[dict[str, str]] = []
        self.tables = 0
        self.table_captions = 0
        self.th_without_scope = 0

    def handle_starttag(self, tag: str, attrs: list[tuple[str, str | None]]) -> None:
        attr_map = {k.lower(): (v or "") for k, v in attrs}

        for k in attr_map:
            if k.startswith("on"):
                self.inline_handlers.append((tag, k))

        if tag == "html":
            self.html_lang = attr_map.get("lang")
        elif tag == "meta" and attr_map.get("name", "").lower() == "viewport":
            self.viewport = attr_map.get("content", "")
        elif tag == "title":
            self.has_title = True
        elif tag == "header":
            self.has_header = True
        elif tag == "main":
            self.has_main = True
            self.main_id = attr_map.get("id")
        elif tag == "a" and "skip-link" in attr_map.get("class", ""):
            self.skip_links.append(attr_map.get("href", ""))
        elif tag in ("h1", "h2", "h3", "h4", "h5", "h6"):
            self.headings.append(int(tag[1]))
        elif tag == "label" and attr_map.get("for"):
            self.label_fors.add(attr_map["for"])
        elif tag in ("input", "select", "textarea"):
            self.controls.append(attr_map)
        elif tag == "script" and "src" not in attr_map:
            self.inline_scripts += 1
        elif tag == "style":
            self.inline_styles += 1
        elif tag == "table":
            self.tables += 1
        elif tag == "caption":
            self.table_captions += 1
        elif tag == "th":
            if attr_map.get("scope") not in ("col", "row", "colgroup", "rowgroup"):
                self.th_without_scope += 1

        if "aria-live" in attr_map:
            self.live_regions.append(attr_map["aria-live"])
        if attr_map.get("role") == "dialog":
            self.dialogs.append(attr_map)


def _audit_html(filename: str) -> _A11yHtmlAuditor:
    raw = (FRONTEND_DIR / filename).read_text(encoding="utf-8")
    assert raw.lstrip().lower().startswith("<!doctype html>"), f"{filename} missing doctype"
    auditor = _A11yHtmlAuditor()
    auditor.feed(raw)
    return auditor


def _hex_to_luminance(hex_color: str) -> float:
    h = hex_color.lstrip("#")
    if len(h) == 3:
        h = "".join(ch * 2 for ch in h)
    r, g, b = (int(h[i : i + 2], 16) / 255.0 for i in (0, 2, 4))

    def _lin(c: float) -> float:
        return c / 12.92 if c <= 0.03928 else ((c + 0.055) / 1.055) ** 2.4

    return 0.2126 * _lin(r) + 0.7152 * _lin(g) + 0.0722 * _lin(b)


def _contrast_ratio(fg_hex: str, bg_hex: str) -> float:
    l1 = _hex_to_luminance(fg_hex)
    l2 = _hex_to_luminance(bg_hex)
    bright, dark = max(l1, l2), min(l1, l2)
    return (bright + 0.05) / (dark + 0.05)


def test_citizen_html_wcag_compliance():
    a = _audit_html("citizen.html")
    assert a.html_lang in ("ta", "en")
    assert a.has_title
    assert a.viewport is not None
    assert "maximum-scale=1" not in a.viewport
    assert "user-scalable=no" not in a.viewport
    assert a.has_header and a.has_main and a.main_id == "main-content"
    assert "#main-content" in a.skip_links
    assert 1 in a.headings
    # Ensure no skipped heading levels (e.g. h1 -> h3)
    for prev, curr in zip(a.headings, a.headings[1:]):
        assert curr - prev <= 1
    # Every form control has an explicit <label for=...> or aria-label
    for ctrl in a.controls:
        cid = ctrl.get("id", "")
        assert cid in a.label_fors or ctrl.get("aria-label") or ctrl.get("aria-labelledby"), (
            f"Unlabeled form control in citizen.html: {ctrl}"
        )
    assert len(a.live_regions) >= 2
    assert a.inline_handlers == []
    assert a.inline_scripts == 0
    assert a.inline_styles == 0


def test_admin_html_wcag_compliance():
    a = _audit_html("admin.html")
    assert a.html_lang == "en"
    assert a.has_title
    assert a.viewport is not None
    assert "maximum-scale=1" not in a.viewport
    assert a.has_header and a.has_main and a.main_id == "main-content"
    assert "#main-content" in a.skip_links
    assert 1 in a.headings and 2 in a.headings
    for ctrl in a.controls:
        cid = ctrl.get("id", "")
        assert cid in a.label_fors or ctrl.get("aria-label") or ctrl.get("aria-labelledby"), (
            f"Unlabeled form control in admin.html: {ctrl}"
        )
    assert a.tables >= 1 and a.table_captions >= a.tables
    assert a.th_without_scope == 0
    assert len(a.dialogs) == 1
    assert a.dialogs[0].get("aria-modal") == "true"
    assert a.dialogs[0].get("aria-labelledby") == "drawerTitle"
    assert len(a.live_regions) >= 2
    assert a.inline_handlers == []
    assert a.inline_scripts == 0
    assert a.inline_styles == 0


def test_styles_contrast_and_accessibility_rules():
    css = (FRONTEND_DIR / "styles.css").read_text(encoding="utf-8")
    assert ":focus-visible" in css
    assert "prefers-reduced-motion" in css
    assert "forced-colors" in css
    assert ".skip-link" in css
    assert ".sr-only" in css
    assert "min-height: 44px" in css

    vars_found = dict(re.findall(r"--([a-z-]+)\s*:\s*(#[0-9a-fA-F]{3,6})", css))
    # WCAG 2.1 AA requires >= 4.5:1 for normal text and >= 3.0:1 for UI borders
    assert _contrast_ratio(vars_found["ink"], vars_found["surface"]) >= 7.0
    assert _contrast_ratio(vars_found["muted"], vars_found["surface"]) >= 4.5
    assert _contrast_ratio(vars_found["muted"], vars_found["bg"]) >= 4.5
    assert _contrast_ratio("#FFFFFF", vars_found["teal"]) >= 4.5
    assert _contrast_ratio("#FFFFFF", vars_found["accent"]) >= 4.5
    assert _contrast_ratio("#FFFFFF", vars_found["ok"]) >= 4.5
    assert _contrast_ratio("#FFFFFF", vars_found["high"]) >= 4.5
    assert _contrast_ratio(vars_found["border-input"], vars_found["surface"]) >= 3.0


def test_frontend_js_xss_and_a11y_hygiene():
    for js_name in ("citizen.js", "admin.js"):
        src = (FRONTEND_DIR / js_name).read_text(encoding="utf-8")
        assert ".innerHTML" not in src, f"Unsafe innerHTML usage found in {js_name}"
        assert "document.write" not in src, f"Unsafe document.write found in {js_name}"
        assert not re.search(r"\b(?:alert|prompt)\s*\(", src), (
            f"Blocking browser dialog alert/prompt found in {js_name}"
        )
        assert "localStorage" not in src, f"Avoid storing tokens in localStorage ({js_name})"
        assert "sessionStorage" not in src, f"Avoid storing tokens in sessionStorage ({js_name})"
