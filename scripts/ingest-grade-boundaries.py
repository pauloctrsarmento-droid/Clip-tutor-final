import os
"""
Ingest Cambridge IGCSE grade boundaries from PDF threshold tables.

Scrapes the Cambridge website for grade threshold PDFs,
extracts component-level boundaries, and inserts into Supabase.

Usage:
    python scripts/ingest-grade-boundaries.py
    python scripts/ingest-grade-boundaries.py --dry-run
"""

import re
import sys
import json
import argparse
import requests
import fitz  # PyMuPDF

# ── Config ──────────────────────────────────────────────────

SUPABASE_URL = "https://lltcfjmshnhfmavlxpxr.supabase.co"
MGMT_TOKEN = os.environ["SUPABASE_ACCESS_TOKEN"]

SUBJECTS = {
    "0620": "chemistry",
    "0625": "physics",
    "0610": "biology",
    "0478": "computer-science",
    "0520": "french-foreign-language",
    "0504": "first-language-portuguese",
}

# Map our session codes to Cambridge URL slugs
SESSION_MAP = {
    "s19": "june-2019", "w19": "november-2019", "m19": "march-2019",
    "s20": "june-2020", "w20": "november-2020", "m20": "march-2020",
    "s21": "june-2021", "w21": "november-2021", "m21": "march-2021",
    "s22": "june-2022", "w22": "november-2022", "m22": "march-2022",
    "s23": "june-2023", "w23": "november-2023", "m23": "march-2023",
    "s24": "june-2024", "w24": "november-2024", "m24": "march-2024",
    "s25": "june-2025", "w25": "november-2025", "m25": "march-2025",
}

BASE_INDEX_URL = "https://www.cambridgeinternational.org/programmes-and-qualifications/cambridge-upper-secondary/cambridge-igcse/grade-threshold-tables"

# ── Step 1: Find PDF URLs ──────────────────────────────────

def find_pdf_url(session_slug: str, subject_code: str, subject_slug: str) -> str | None:
    """Scrape the session index page to find the PDF URL for a subject."""
    index_url = f"{BASE_INDEX_URL}/{session_slug}/"
    try:
        resp = requests.get(index_url, timeout=30)
        if resp.status_code != 200:
            print(f"  WARNING: Index page {session_slug} returned {resp.status_code}")
            return None
    except requests.RequestException as e:
        print(f"  WARNING: Failed to fetch index page {session_slug}: {e}")
        return None

    # Look for PDF links containing the subject code
    # Pattern: /Images/XXXXXX-subject-slug-code-session-grade-threshold-table.pdf
    pattern = rf'href="(/Images/\d+-[^"]*{subject_code}[^"]*grade-threshold[^"]*\.pdf)"'
    matches = re.findall(pattern, resp.text, re.IGNORECASE)

    if matches:
        return f"https://www.cambridgeinternational.org{matches[0]}"

    # Try alternate pattern without subject slug
    pattern2 = rf'href="(/Images/[^"]*{subject_code}[^"]*\.pdf)"'
    matches2 = re.findall(pattern2, resp.text, re.IGNORECASE)
    if matches2:
        return f"https://www.cambridgeinternational.org{matches2[0]}"

    return None


# ── Step 2: Parse PDF ──────────────────────────────────────

def parse_grade_boundary_pdf(pdf_bytes: bytes, subject_code: str, session: str) -> list[dict]:
    """Extract grade boundaries from a Cambridge threshold table PDF.

    The PDF format has each value on a separate line:
        Component 42
        80          <- max marks
        55          <- A threshold
        42          <- B threshold
        28          <- C threshold
        ...etc (D, E, F, G)

    Values may be a dash/bullet for "not available" (core components don't have A/B).
    """
    doc = fitz.open(stream=pdf_bytes, filetype="pdf")
    results = []

    for page in doc:
        text = page.get_text()
        lines = [l.strip() for l in text.split("\n") if l.strip()]

        i = 0
        while i < len(lines):
            # Look for "Component XX" lines
            match = re.match(r'^Component\s+(\d{2,3})$', lines[i])
            if not match:
                i += 1
                continue

            component = int(match.group(1))

            # Next 8 lines should be: max_marks, A, B, C, D, E, F, G
            values = []
            j = i + 1
            while j < len(lines) and len(values) < 8:
                val = lines[j].strip()
                # Stop if we hit another "Component" line or non-data
                if val.startswith("Component") or val.startswith("Grade") or val.startswith("Option"):
                    break
                # Parse value: number or dash/bullet (not available)
                try:
                    values.append(int(val))
                except ValueError:
                    values.append(None)  # dash, bullet, or other non-numeric
                j += 1

            if len(values) >= 8:
                max_marks = values[0]
                if max_marks is not None and max_marks > 0:
                    row_id = f"{subject_code}_{session}_{component}"
                    results.append({
                        "id": row_id,
                        "subject_code": subject_code,
                        "session": session,
                        "component": component,
                        "max_marks": max_marks,
                        "a_star": None,
                        "a": values[1],
                        "b": values[2],
                        "c": values[3],
                        "d": values[4],
                        "e": values[5],
                        "f": values[6],
                        "g": values[7],
                    })

            i = j  # skip past the values we consumed

    doc.close()
    return results


# ── Step 3: Insert into Supabase ───────────────────────────

def insert_boundaries(rows: list[dict], dry_run: bool = False) -> int:
    """Insert grade boundaries into Supabase via Management API."""
    if not rows:
        return 0

    if dry_run:
        for r in rows:
            print(f"  [DRY RUN] {r['id']}: max={r['max_marks']} A={r['a']} B={r['b']} C={r['c']} D={r['d']} E={r['e']} F={r['f']} G={r['g']}")
        return len(rows)

    # Build upsert SQL
    values = []
    for r in rows:
        vals = [
            f"'{r['id']}'",
            f"'{r['subject_code']}'",
            f"'{r['session']}'",
            str(r['component']),
            str(r['max_marks']),
            str(r['a_star']) if r['a_star'] is not None else 'NULL',
            str(r['a']) if r['a'] is not None else 'NULL',
            str(r['b']) if r['b'] is not None else 'NULL',
            str(r['c']) if r['c'] is not None else 'NULL',
            str(r['d']) if r['d'] is not None else 'NULL',
            str(r['e']) if r['e'] is not None else 'NULL',
            str(r['f']) if r['f'] is not None else 'NULL',
            str(r['g']) if r['g'] is not None else 'NULL',
        ]
        values.append(f"({', '.join(vals)})")

    sql = f"""
    INSERT INTO grade_boundaries (id, subject_code, session, component, max_marks, a_star, a, b, c, d, e, f, g)
    VALUES {', '.join(values)}
    ON CONFLICT (id) DO UPDATE SET
        max_marks = EXCLUDED.max_marks,
        a_star = EXCLUDED.a_star,
        a = EXCLUDED.a, b = EXCLUDED.b, c = EXCLUDED.c,
        d = EXCLUDED.d, e = EXCLUDED.e, f = EXCLUDED.f, g = EXCLUDED.g;
    """

    project_ref = SUPABASE_URL.replace("https://", "").replace(".supabase.co", "")
    resp = requests.post(
        f"https://api.supabase.com/v1/projects/{project_ref}/database/query",
        headers={"Content-Type": "application/json", "Authorization": f"Bearer {MGMT_TOKEN}"},
        json={"query": sql},
        timeout=30,
    )

    if resp.status_code == 201:
        return len(rows)
    else:
        print(f"  WARNING: DB insert failed: {resp.status_code} {resp.text[:200]}")
        return 0


# ── Main ───────────────────────────────────────────────────

def main():
    parser = argparse.ArgumentParser(description="Ingest Cambridge grade boundaries")
    parser.add_argument("--dry-run", action="store_true", help="Parse but don't insert")
    parser.add_argument("--sessions", nargs="*", help="Only process these sessions (e.g. s24 w24)")
    args = parser.parse_args()

    # Filter sessions
    sessions_to_process = args.sessions if args.sessions else list(SESSION_MAP.keys())

    total_inserted = 0
    total_found = 0
    total_missing = 0

    for session_code in sorted(sessions_to_process):
        session_slug = SESSION_MAP.get(session_code)
        if not session_slug:
            print(f"Unknown session: {session_code}")
            continue

        print(f"\n{'='*60}")
        print(f"Session: {session_code} ({session_slug})")
        print(f"{'='*60}")

        for subject_code, subject_slug in SUBJECTS.items():
            pdf_url = find_pdf_url(session_slug, subject_code, subject_slug)

            if not pdf_url:
                print(f"  {subject_code} ({subject_slug}): PDF not found")
                total_missing += 1
                continue

            print(f"  {subject_code}: downloading {pdf_url.split('/')[-1]}...")

            try:
                pdf_resp = requests.get(pdf_url, timeout=30)
                if pdf_resp.status_code != 200:
                    print(f"  WARNING: Download failed: {pdf_resp.status_code}")
                    total_missing += 1
                    continue
            except requests.RequestException as e:
                print(f"  WARNING: Download error: {e}")
                total_missing += 1
                continue

            rows = parse_grade_boundary_pdf(pdf_resp.content, subject_code, session_code)
            total_found += len(rows)

            if rows:
                inserted = insert_boundaries(rows, dry_run=args.dry_run)
                total_inserted += inserted
                print(f"  {subject_code}: {len(rows)} components parsed, {inserted} inserted")
            else:
                print(f"  {subject_code}: WARNING: no boundaries parsed from PDF")

    print(f"\n{'='*60}")
    print(f"DONE: {total_found} boundaries found, {total_inserted} inserted, {total_missing} PDFs missing")


if __name__ == "__main__":
    main()
