"""
Ingest exam questions from verified JSON files into Supabase.

Reads _verified.json for each subject, extracts paper metadata + question leaves,
maps topic_codes to syllabus_topic UUIDs, and batch-inserts via Supabase REST API.

Usage: py scripts/ingest-questions.py [--dry-run]
"""

import json
import os
import re
import sys
import urllib.request

# ============================================================
# Config
# ============================================================

SUPABASE_URL = "https://lltcfjmshnhfmavlxpxr.supabase.co"
SERVICE_KEY = os.environ["SUPABASE_SERVICE_ROLE_KEY"]

BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DATA_DIR = os.path.join(BASE_DIR, "data", "extracted")

VERIFIED_FILES = {
    "0475": "0475/english_lit_verified.json",
    "0478": "0478/cs_verified.json",
    "0500": "0500/english_lang_verified.json",
    "0504": "0504/portuguese_verified.json",
    "0520": "0520/french_verified.json",
    "0610": "0610/biology_verified.json",
    "0620": "0620/chemistry_verified.json",
    "0625": "0625/physics_verified.json",
}

BATCH_SIZE = 200

DRY_RUN = "--dry-run" in sys.argv


# ============================================================
# Supabase REST helpers
# ============================================================

def supabase_request(path, method="GET", data=None, prefer=None):
    """Make a request to Supabase REST API."""
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


def fetch_topic_map():
    """Build topic_code → UUID map from syllabus_topics."""
    rows = supabase_request("syllabus_topics?select=id,topic_code")
    return {r["topic_code"]: r["id"] for r in rows}


# ============================================================
# Paper metadata extraction
# ============================================================

def parse_paper_id(paper_id):
    """Extract subject_code, session, variant, year from paper_id like '0620_s23_41'."""
    parts = paper_id.split("_")
    if len(parts) < 3:
        return None

    subject_code = parts[0]
    session_code = parts[1]  # e.g. "s23", "w22", "m19"
    variant = parts[2]       # e.g. "41", "42"

    # Extract year from session code
    year_suffix = re.search(r"\d+", session_code)
    if year_suffix:
        y = int(year_suffix.group())
        year = 2000 + y if y < 100 else y
    else:
        year = 0

    return {
        "id": paper_id,
        "subject_code": subject_code,
        "session": session_code,
        "variant": variant,
        "year": year,
    }


def sanitize_marks(marks):
    """Clamp marks to a sane range (some extraction data is corrupted)."""
    if not isinstance(marks, (int, float)) or marks < 0 or marks > 20:
        return 1
    return int(marks)


def collect_papers(questions):
    """Collect unique paper metadata from question leaves."""
    papers = {}
    for q in questions:
        pid = q["paper_id"]
        if pid in papers:
            papers[pid]["total_questions"] += 1
            papers[pid]["total_marks"] += sanitize_marks(q.get("marks", 0))
        else:
            info = parse_paper_id(pid)
            if info:
                info["total_questions"] = 1
                info["total_marks"] = sanitize_marks(q.get("marks", 0))
                papers[pid] = info
    return list(papers.values())


# ============================================================
# Question transformation
# ============================================================

def transform_question(q, topic_map):
    """Transform a JSON question into a DB row dict."""
    # Derive subject_code from paper_id (more reliable than JSON field)
    subject_code = q["paper_id"].split("_")[0]

    # Map topic_code to UUID
    topic_code = q.get("primary_topic_id") or q.get("syllabus_topic_id")
    topic_uuid = topic_map.get(topic_code) if topic_code else None

    return {
        "id": q["id"],
        "paper_id": q["paper_id"],
        "subject_code": subject_code,
        "syllabus_topic_id": topic_uuid,
        "question_number": q.get("question_number", 0),
        "part_label": q.get("part_label"),
        "group_id": q.get("group_id"),
        "question_text": q.get("question_text", ""),
        "parent_context": q.get("parent_context"),
        "marks": sanitize_marks(q.get("marks", 1)),
        "correct_answer": q.get("correct_answer"),
        "mark_scheme": q.get("mark_scheme"),
        "mark_points": q.get("mark_points", []),
        "question_type": q.get("question_type", "short"),
        "response_type": q.get("response_type", "text"),
        "has_diagram": q.get("has_diagram", False),
        "fig_refs": q.get("fig_refs", []),
        "table_refs": q.get("table_refs", []),
        "evaluation_ready": q.get("evaluation_ready", True),
        "is_stem": q.get("is_stem", False),
        "part_order": q.get("part_order", 0),
        "sibling_count": q.get("sibling_count", 1),
    }


# ============================================================
# Batch insert
# ============================================================

def batch_insert(table, rows, label="rows"):
    """Insert rows in batches, using upsert to handle reruns."""
    if DRY_RUN:
        print(f"  [DRY RUN] Would insert {len(rows)} {label} into {table}")
        return

    total = len(rows)
    inserted = 0

    for i in range(0, total, BATCH_SIZE):
        batch = rows[i : i + BATCH_SIZE]
        supabase_request(
            table,
            method="POST",
            data=batch,
            prefer="resolution=merge-duplicates,return=minimal",
        )
        inserted += len(batch)
        pct = round(inserted / total * 100)
        print(f"  {inserted}/{total} ({pct}%) {label}")

    return inserted


# ============================================================
# Main
# ============================================================

def main():
    print("=" * 60)
    print("CLIP Tutor — Question Ingestion")
    print("=" * 60)

    if DRY_RUN:
        print("[DRY RUN MODE — no data will be written]\n")

    # 1. Fetch topic map
    print("Fetching topic map from syllabus_topics...")
    topic_map = fetch_topic_map()
    print(f"  {len(topic_map)} topic codes mapped to UUIDs\n")

    grand_total_papers = 0
    grand_total_leaves = 0
    grand_total_with_topic = 0

    for subject_code, rel_path in sorted(VERIFIED_FILES.items()):
        filepath = os.path.join(DATA_DIR, rel_path)
        if not os.path.exists(filepath):
            print(f"SKIP {subject_code}: file not found at {rel_path}")
            continue

        print(f"--- {subject_code} ({rel_path}) ---")

        with open(filepath, encoding="utf-8") as f:
            data = json.load(f)

        all_questions = data.get("questions", [])

        # Separate stems and leaves
        leaves = [q for q in all_questions if not q.get("is_stem", False)]
        print(f"  {len(all_questions)} total, {len(leaves)} leaves")

        # 2. Collect and insert papers
        papers = collect_papers(leaves)
        print(f"  {len(papers)} papers")
        batch_insert("exam_papers", papers, "papers")

        # 3. Transform and insert leaves
        rows = [transform_question(q, topic_map) for q in leaves]
        with_topic = sum(1 for r in rows if r["syllabus_topic_id"] is not None)
        print(f"  {with_topic}/{len(rows)} with topic UUID")
        batch_insert("exam_questions", rows, "questions")

        grand_total_papers += len(papers)
        grand_total_leaves += len(rows)
        grand_total_with_topic += with_topic
        print()

    print("=" * 60)
    print(f"DONE: {grand_total_leaves} leaves, {grand_total_papers} papers, {grand_total_with_topic} with topic")
    print("=" * 60)


if __name__ == "__main__":
    main()
