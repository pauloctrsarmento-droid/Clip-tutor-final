"""
Run SQL migrations against Supabase via Management API.
Usage: py scripts/run-migrations.py
"""
import json
import urllib.request
import sys
import os

MGMT_TOKEN = os.environ["SUPABASE_ACCESS_TOKEN"]
MGMT_API = "https://api.supabase.com/v1/projects/lltcfjmshnhfmavlxpxr/database/query"

BASE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))


def run_sql(sql, label="SQL"):
    """Execute SQL via Supabase Management API."""
    data = json.dumps({"query": sql}).encode("utf-8")
    req = urllib.request.Request(MGMT_API, data=data, method="POST", headers={
        "Authorization": f"Bearer {MGMT_TOKEN}",
        "Content-Type": "application/json",
        "User-Agent": "supabase-cli/2.84.4",
    })
    try:
        resp = urllib.request.urlopen(req)
        result = json.loads(resp.read().decode("utf-8"))
        return result
    except urllib.error.HTTPError as e:
        body = e.read().decode("utf-8")
        print(f"  ERROR running {label}: HTTP {e.code}")
        print(f"  {body[:500]}")
        return None


def run_sql_file(filepath, label):
    """Read and execute a .sql file."""
    print(f"\n{'='*60}")
    print(f"Running: {label}")
    print(f"File: {filepath}")
    print(f"{'='*60}")

    with open(filepath, encoding="utf-8") as f:
        sql = f.read()

    # Split into statements for better error handling
    # But for CREATE FUNCTION we need to keep $$ blocks together
    # So run the whole file at once
    result = run_sql(sql, label)

    if result is not None:
        # Print last result (the verify SELECT)
        if isinstance(result, list) and len(result) > 0:
            print(f"  Result: {json.dumps(result[-1] if isinstance(result[-1], dict) else result, indent=2)[:500]}")
        print(f"  OK")
    else:
        print(f"  FAILED — see error above")

    return result


def verify(query, expected_label):
    """Run a verification query and print result."""
    result = run_sql(query, expected_label)
    if result and isinstance(result, list) and len(result) > 0:
        print(f"  {expected_label}: {result[0]}")
    return result


def main():
    print("CLIP Tutor — Run Migrations")
    print("Target: lltcfjmshnhfmavlxpxr (Supabase)")

    # Step 1: migrate-block2.sql
    run_sql_file(os.path.join(BASE, "scripts", "migrate-block2.sql"), "Block 2 Migration")

    # Step 2: migrate-block3.sql
    run_sql_file(os.path.join(BASE, "scripts", "migrate-block3.sql"), "Block 3 Migration")

    # Step 3: Verification
    print(f"\n{'='*60}")
    print("Verification")
    print(f"{'='*60}")

    queries = [
        ("SELECT count(*)::int AS count FROM students", "students"),
        ("SELECT count(*)::int AS count FROM exam_papers", "exam_papers"),
        ("SELECT count(*)::int AS count FROM exam_questions", "exam_questions"),
        ("SELECT count(*)::int AS count FROM exam_calendar", "exam_calendar"),
        ("SELECT count(*)::int AS count FROM study_plan_entries", "study_plan_entries"),
        ("SELECT count(*)::int AS count FROM student_fact_mastery", "student_fact_mastery"),
        ("SELECT count(*)::int AS count FROM study_sessions", "study_sessions"),
    ]

    for query, label in queries:
        verify(query, label)

    print(f"\n{'='*60}")
    print("Migrations complete. Now run:")
    print("  py scripts/ingest-questions.py")
    print("  py scripts/seed-study-plan.py")
    print(f"{'='*60}")


if __name__ == "__main__":
    main()
