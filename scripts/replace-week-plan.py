"""
Replace study_plan_entries for April 6-12, 2026 with Luísa's real calendar.
Deletes existing entries for those dates, inserts new ones from calendar screenshots.

Usage: py scripts/replace-week-plan.py [--dry-run]
Requires: SUPABASE_SERVICE_ROLE_KEY in env or web/.env.local
"""

import json
import os
import sys
import urllib.request
import urllib.error

SUPABASE_URL = "https://lltcfjmshnhfmavlxpxr.supabase.co"

# Load service key from env or .env.local
SERVICE_KEY = os.environ.get("SUPABASE_SERVICE_ROLE_KEY")
if not SERVICE_KEY:
    env_path = os.path.join(os.path.dirname(__file__), "..", "web", ".env.local")
    if os.path.exists(env_path):
        with open(env_path) as f:
            for line in f:
                if line.startswith("SUPABASE_SERVICE_ROLE_KEY="):
                    SERVICE_KEY = line.strip().split("=", 1)[1]
                    break

if not SERVICE_KEY:
    print("ERROR: SUPABASE_SERVICE_ROLE_KEY not found")
    sys.exit(1)

DRY_RUN = "--dry-run" in sys.argv

# ============================================================
# Topic code mapping (from seed-study-plan.py)
# ============================================================

TOPIC_MAP = {
    "BIO_T3": ["cells", "movement into and out"],
    "BIO_T4": ["molecules", "biological molecules"],
    "BIO_T5": ["enzymes"],
    "BIO_T6": ["plant nutrition"],
    "BIO_T15": ["drugs"],
    "CHEM_T1": ["states of matter"],
    "CHEM_T2": ["atoms", "electrons", "compounds"],
    "CHEM_T4": ["electrochemistry"],
    "CHEM_T5": ["energetics", "chemical energetics"],
    "CHEM_T8": ["periodic table"],
    "CHEM_T12": ["experimental", "techniques", "analysis"],
    "PHYS_T2": ["thermal"],
    "CS_T1": ["data representation"],
    "CS_T2": ["data transmission", "transmission"],
    "CS_T3": ["hardware"],
}


# ============================================================
# New plan — from Luísa's calendar screenshots (6-12 April 2026)
# Format: (date, subject_code, title, hours, study_type, phase, sort_order, start_time, end_time, topic_codes)
# ============================================================

PLAN = [
    # === Monday 6 Apr ===
    ("2026-04-06", "PERSONAL", "Oftalmologista", 1.0, "mixed", "easter_w1", 1, "09:30", "10:30", []),
    ("2026-04-06", "ART", "A5 composition drawing", 1.75, "study", "easter_w1", 2, "10:45", "12:30", []),
    ("2026-04-06", "PERSONAL", "Kebabs joni toni", 1.5, "mixed", "easter_w1", 3, "13:00", "14:30", []),
    ("2026-04-06", "PERSONAL", "Dentista", 1.0, "mixed", "easter_w1", 4, "14:30", "15:30", []),
    ("2026-04-06", "0520", "French writing past paper", 1.0, "practice", "easter_w1", 5, "16:00", "17:00", []),
    ("2026-04-06", "0475", "One kayo poem", 1.0, "study", "easter_w1", 6, "17:15", "18:15", []),
    ("2026-04-06", "0610", "Bio topic 5", 1.0, "study", "easter_w1", 7, "18:15", "19:15", ["BIO_T5"]),

    # === Tuesday 7 Apr ===
    ("2026-04-07", "0620", "Chem topic 1 and 2", 3.5, "study", "easter_w2", 1, "09:00", "12:30", ["CHEM_T1", "CHEM_T2"]),
    ("2026-04-07", "ART", "Delita Martin interpretation", 4.5, "study", "easter_w2", 2, "14:00", "18:30", []),

    # === Wednesday 8 Apr ===
    ("2026-04-08", "0610", "Bio topic 3, 4, 5, 6", 4.5, "study", "easter_w2", 1, "09:00", "13:30", ["BIO_T3", "BIO_T4", "BIO_T5", "BIO_T6"]),
    ("2026-04-08", "0620", "Chem topic 4, 5 and 8", 4.0, "study", "easter_w2", 2, "15:00", "19:00", ["CHEM_T4", "CHEM_T5", "CHEM_T8"]),
    ("2026-04-08", "0475", "One kayo poem", 1.0, "study", "easter_w2", 3, "19:00", "20:00", []),

    # === Thursday 9 Apr ===
    ("2026-04-09", "0478", "CS topic 2 and 3", 3.5, "study", "easter_w2", 1, "08:30", "12:00", ["CS_T2", "CS_T3"]),
    ("2026-04-09", "0475", "One kayo poem", 1.0, "study", "easter_w2", 2, "12:00", "13:00", []),
    ("2026-04-09", "PERSONAL", "Pediatra", 1.5, "mixed", "easter_w2", 3, "14:30", "16:00", []),
    ("2026-04-09", "0620", "Chem topic 12", 2.0, "study", "easter_w2", 4, "16:00", "18:00", ["CHEM_T12"]),
    ("2026-04-09", "0475", "One kayo poem", 1.0, "study", "easter_w2", 5, "18:00", "19:00", []),

    # === Friday 10 Apr ===
    ("2026-04-10", "0625", "Physics topic 2", 3.0, "study", "easter_w2", 1, "09:00", "12:00", ["PHYS_T2"]),
    ("2026-04-10", "0610", "Bio topic 15", 1.0, "study", "easter_w2", 2, "12:00", "13:00", ["BIO_T15"]),
    ("2026-04-10", "0620", "Tutoring chem", 2.0, "mixed", "easter_w2", 3, "16:00", "18:00", []),
    ("2026-04-10", "0478", "CS topic 1", 1.5, "study", "easter_w2", 4, "22:30", "23:55", ["CS_T1"]),

    # === Saturday 11 Apr ===
    ("2026-04-11", "ART", "Art exam day 1 mock", 4.5, "exam", "easter_w2", 1, "09:30", "14:00", []),
    ("2026-04-11", "0475", "One kayo poem", 1.0, "study", "easter_w2", 2, "16:00", "17:00", []),

    # === Sunday 12 Apr ===
    ("2026-04-12", "ART", "Art exam day 2 mock", 5.5, "exam", "easter_w2", 1, "09:00", "14:30", []),
    ("2026-04-12", "0475", "One kayo poem", 1.0, "study", "easter_w2", 2, "16:00", "17:00", []),
]


# ============================================================
# Supabase REST helpers
# ============================================================

def supabase_request(path, method="GET", data=None, prefer=None):
    url = f"{SUPABASE_URL}/rest/v1/{path}"
    headers = {
        "apikey": SERVICE_KEY,
        "Authorization": f"Bearer {SERVICE_KEY}",
        "Content-Type": "application/json",
    }
    if prefer:
        headers["Prefer"] = prefer
    body = json.dumps(data).encode("utf-8") if data else None
    req = urllib.request.Request(url, data=body, method=method, headers=headers)
    try:
        with urllib.request.urlopen(req) as resp:
            text = resp.read().decode("utf-8")
            return json.loads(text) if text.strip() else []
    except urllib.error.HTTPError as e:
        error_body = e.read().decode("utf-8")
        print(f"  ERROR {e.code}: {error_body[:500]}")
        raise


def fetch_topic_uuid_map():
    """Build topic_code → UUID map from syllabus_topics table."""
    rows = supabase_request("syllabus_topics?select=id,topic_code")
    return {r["topic_code"]: r["id"] for r in rows}


# ============================================================
# Main
# ============================================================

def main():
    print("=" * 60)
    print("CLIP Tutor — Replace Week Plan (6-12 April 2026)")
    print(f"Total blocks to insert: {len(PLAN)}")
    print("=" * 60)

    if DRY_RUN:
        print("[DRY RUN MODE]\n")

    # 1. Fetch topic UUIDs
    print("Fetching topic UUID map...")
    topic_uuid_map = fetch_topic_uuid_map()
    print(f"  {len(topic_uuid_map)} topics mapped\n")

    # 2. Delete existing entries for April 6-12
    print("Deleting existing entries for 2026-04-06 to 2026-04-12...")
    if not DRY_RUN:
        # Count existing
        existing = supabase_request(
            "study_plan_entries?select=id&plan_date=gte.2026-04-06&plan_date=lte.2026-04-12"
        )
        print(f"  Found {len(existing)} existing entries to delete")

        if existing:
            supabase_request(
                "study_plan_entries?plan_date=gte.2026-04-06&plan_date=lte.2026-04-12",
                method="DELETE",
            )
            print("  Deleted.")
    else:
        print("  [DRY RUN] Would delete existing entries")

    # 3. Build rows
    print("\nBuilding new entries...")
    rows = []
    for date, subj, title, hours, stype, phase, order, start, end, topic_codes in PLAN:
        topic_uuids = [topic_uuid_map[tc] for tc in topic_codes if tc in topic_uuid_map]

        row = {
            "plan_date": date,
            "subject_code": subj,
            "title": title,
            "syllabus_topic_ids": topic_uuids,
            "planned_hours": hours,
            "study_type": stype,
            "phase": phase,
            "sort_order": order,
            "status": "pending",
            "start_time": start,
            "end_time": end,
        }
        rows.append(row)

    # Stats
    dates = set(r["plan_date"] for r in rows)
    total_hours = sum(r["planned_hours"] for r in rows)
    with_topics = sum(1 for r in rows if r["syllabus_topic_ids"])

    print(f"  {len(rows)} blocks across {len(dates)} days")
    print(f"  {total_hours:.1f} total hours")
    print(f"  {with_topics}/{len(rows)} blocks linked to syllabus topics")

    if DRY_RUN:
        print("\n[DRY RUN] Would insert:")
        for r in rows:
            topics = f" [{len(r['syllabus_topic_ids'])} topics]" if r["syllabus_topic_ids"] else ""
            print(f"  {r['plan_date']} {r['start_time']}-{r['end_time']}  {r['subject_code']:8s}  {r['title']}{topics}")
        return

    # 4. Insert
    print("\nInserting new entries...")
    supabase_request(
        "study_plan_entries",
        method="POST",
        data=rows,
        prefer="return=minimal",
    )
    print(f"  Inserted {len(rows)} entries.")

    # 5. Verify
    print("\nVerifying...")
    verify = supabase_request(
        "study_plan_entries?select=id,plan_date,title,start_time,end_time&plan_date=gte.2026-04-06&plan_date=lte.2026-04-12&order=plan_date,sort_order"
    )
    print(f"  {len(verify)} entries in DB for April 6-12")
    for v in verify:
        print(f"  {v['plan_date']} {v.get('start_time', '?'):>5s}-{v.get('end_time', '?'):>5s}  {v['title']}")

    print(f"\nDONE: {len(rows)} study plan entries replaced.")


if __name__ == "__main__":
    main()
