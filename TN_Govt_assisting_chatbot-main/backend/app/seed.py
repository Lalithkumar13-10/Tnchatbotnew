"""Seed officers (one per role) and demo grievances that make every governance
feature visible in a 90-second demo."""
from __future__ import annotations

import datetime as dt

from sqlalchemy import func, select

from . import governance as gov
from .db import Officer, SessionLocal, init_db, now


def run() -> str:
    """Idempotently seed demo officers and sample grievances."""
    init_db()
    with SessionLocal() as db:
        existing_officers = db.execute(select(func.count(Officer.id))).scalar_one()
        if existing_officers > 0:
            return "already-seeded"

        officers = [
            Officer(
                id="OFF-WARD42",
                name="R. Anitha",
                role="ward_officer",
                department="Street Lighting Wing",
                ward="Gandhipuram (Ward 42)",
            ),
            Officer(
                id="OFF-WARD55",
                name="K. Murugan",
                role="ward_officer",
                department="Solid Waste Management",
                ward="R.S. Puram (Ward 55)",
            ),
            Officer(
                id="OFF-SWM",
                name="S. Devi",
                role="dept_head",
                department="Solid Waste Management",
            ),
            Officer(id="OFF-CMSR", name="P. Rajan", role="commissioner"),
            Officer(id="OFF-COLL", name="Dr. Meena IAS", role="collector"),
            Officer(id="OFF-CMCELL", name="CM Cell Desk", role="cm_cell"),
            Officer(id="OFF-AUDIT", name="Vigilance Audit", role="auditor"),
        ]
        db.add_all(officers)
        db.commit()

        # 1) Open streetlight in Gandhipuram -> triggers the LIVE de-dup flow in the demo.
        gov.file_grievance(
            db,
            reporter_phone="9000000001",
            ui_language="ta",
            category="streetlight",
            ward="Gandhipuram (Ward 42)",
            landmark="near bus stop",
            description_raw="தெருவிளக்கு 3 நாட்களாக எரியவில்லை",
            description_clean="Streetlight not working for 3 days",
            severity="high",
            sensitivity="normal",
        )

        # 2) Garbage in R.S. Puram, back-dated so it is ALREADY breaching SLA -> escalation demo.
        g2 = gov.file_grievance(
            db,
            reporter_phone="9000000002",
            ui_language="en",
            category="garbage",
            ward="R.S. Puram (Ward 55)",
            landmark="4th cross",
            description_raw="Garbage not collected for a week",
            description_clean="Garbage uncollected for a week",
            severity="medium",
            sensitivity="normal",
        )
        g2.created_at = now() - dt.timedelta(days=6)
        g2.sla_due_at = now() - dt.timedelta(days=4)
        db.commit()

        # 3) A SENSITIVE grievance (alleges an official took a bribe) -> restricted + routed to collector.
        gov.file_grievance(
            db,
            reporter_phone="9000000003",
            ui_language="en",
            category="water_supply",
            ward="Ukkadam (Ward 20)",
            landmark=None,
            description_raw="The water officer demanded money to fix our supply line",
            description_clean="Alleged bribe demand by water officer",
            severity="high",
            sensitivity="sensitive",
        )
        return "seeded"


if __name__ == "__main__":
    print(run())
