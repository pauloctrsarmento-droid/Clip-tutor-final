"""
Apply ALL pending checkpoint data to the DB via Supabase REST API (fast).
Handles: MC text + Mark scheme mark_points.

Usage: py -u scripts/apply-checkpoints.py
"""

import json
import os
import sys
import time
import glob
import requests

sys.stdout.reconfigure(encoding="utf-8")
print("Applying all checkpoints to DB...\n", flush=True)

SUPABASE_URL = "https://lltcfjmshnhfmavlxpxr.supabase.co"
SERVICE_KEY = os.environ["SUPABASE_SERVICE_ROLE_KEY"]
MGMT_TOKEN = os.environ["SUPABASE_ACCESS_TOKEN"]
MGMT_API = "https://api.supabase.com/v1/projects/lltcfjmshnhfmavlxpxr/database/query"
BASE = "c:/Users/sarma/OneDrive/Ambiente de Trabalho/tutor final/data"

HEADERS = {"apikey": SERVICE_KEY, "Authorization": f"Bearer {SERVICE_KEY}"}


def rest_patch(qid, updates):
    """Update a single exam_questions row via REST API."""
    r = requests.patch(
        f"{SUPABASE_URL}/rest/v1/exam_questions?id=eq.{qid}",
        json=updates,
        headers={**HEADERS, "Content-Type": "application/json", "Prefer": "return=minimal"},
        timeout=10,
    )
    return r.status_code < 400


def sql(query):
    for a in range(5):
        try:
            r = requests.post(MGMT_API, json={"query": query}, headers={
                "Authorization": f"Bearer {MGMT_TOKEN}", "User-Agent": "supabase-cli/2.84.4"}, timeout=15)
            return r.json()
        except Exception:
            time.sleep(3 * (a + 1))
    return []


# ============================================================
# 1. Apply MC text checkpoint
# ============================================================
mc_path = os.path.join(BASE, "mc_text_llm_checkpoint.json")
if os.path.exists(mc_path):
    print("=== MC TEXT ===", flush=True)
    with open(mc_path, encoding="utf-8") as f:
        mc_data = json.load(f)

    total_updates = sum(len(qs) for qs in mc_data.values())
    print(f"  {len(mc_data)} papers, {total_updates} questions to update", flush=True)

    updated = 0
    errors = 0
    for paper_id, questions in mc_data.items():
        for qid, data in questions.items():
            ok = rest_patch(qid, {
                "question_text": data["question_text"],
                "mark_scheme": data["mark_scheme"],
            })
            if ok:
                updated += 1
            else:
                errors += 1

            if updated % 500 == 0 and updated > 0:
                print(f"  {updated}/{total_updates} updated...", flush=True)

    print(f"  Done: {updated} updated, {errors} errors\n", flush=True)
else:
    print("No MC text checkpoint found\n", flush=True)


# ============================================================
# 2. Apply Mark Scheme mark_points checkpoints
# ============================================================
print("=== MARK SCHEME MARK_POINTS ===", flush=True)
ms_files = glob.glob(os.path.join(BASE, "markscheme_llm_*.json"))

if not ms_files:
    print("  No mark scheme checkpoints found\n", flush=True)
else:
    total_qs = 0
    updated = 0
    errors = 0

    for ms_file in sorted(ms_files):
        code = os.path.basename(ms_file).replace("markscheme_llm_", "").replace(".json", "")
        with open(ms_file, encoding="utf-8") as f:
            ms_data = json.load(f)

        file_qs = sum(len(v) for v in ms_data.values())
        if file_qs == 0:
            continue

        print(f"  {code}: {len(ms_data)} papers, {file_qs} questions...", end="", flush=True)

        file_updated = 0
        for paper_id, questions in ms_data.items():
            for qid, data in questions.items():
                ok = rest_patch(qid, {
                    "marks": data["marks"],
                    "mark_points": data["mark_points"],
                })
                if ok:
                    updated += 1
                    file_updated += 1
                else:
                    errors += 1

        total_qs += file_qs
        print(f" {file_updated} updated", flush=True)

    print(f"  Total: {updated}/{total_qs} updated, {errors} errors\n", flush=True)


# ============================================================
# 3. Update exam_papers total_marks
# ============================================================
print("=== UPDATE EXAM_PAPERS TOTAL_MARKS ===", flush=True)
time.sleep(2)
sql("""UPDATE exam_papers ep SET total_marks = sub.total
    FROM (SELECT paper_id, sum(marks)::int AS total FROM exam_questions WHERE is_stem = false GROUP BY paper_id) sub
    WHERE ep.id = sub.paper_id""")
print("  Done\n", flush=True)


# ============================================================
# 4. Verify
# ============================================================
print("=== VERIFICATION ===", flush=True)
time.sleep(3)

r = sql("SELECT count(*)::int AS c FROM exam_questions WHERE question_type = 'multiple_choice' AND question_text LIKE 'MC Question%'")
print(f"  MC placeholders remaining: {r[0]['c'] if r else '?'}", flush=True)

time.sleep(1)
r = sql("SELECT count(*)::int AS c FROM exam_questions WHERE mark_points IS NOT NULL AND jsonb_array_length(mark_points) > 0 AND question_type != 'multiple_choice'")
print(f"  Theory with structured mark_points: {r[0]['c'] if r else '?'}", flush=True)

time.sleep(1)
r = sql("SELECT marks, count(*)::int AS c FROM exam_questions WHERE question_type != 'multiple_choice' GROUP BY marks ORDER BY marks")
if r:
    print("  Marks distribution:", flush=True)
    for row in r:
        print(f"    marks={row['marks']}: {row['c']}", flush=True)

print("\nDONE!", flush=True)
