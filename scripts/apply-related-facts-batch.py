import os
"""
Apply related_facts checkpoints to DB using batch SQL (fast).
Instead of 1 PATCH per row, does 50 UPDATEs per SQL query.

py -u scripts/apply-related-facts-batch.py
"""
import json, os, sys, time, glob, requests

sys.stdout.reconfigure(encoding="utf-8")

MGMT_TOKEN = os.environ["SUPABASE_ACCESS_TOKEN"]
MGMT_API = "https://api.supabase.com/v1/projects/lltcfjmshnhfmavlxpxr/database/query"
BASE = "c:/Users/sarma/OneDrive/Ambiente de Trabalho/tutor final/data"
BATCH_SQL = 50  # UPDATEs per SQL query


def run_sql(sql):
    for a in range(3):
        try:
            r = requests.post(MGMT_API, json={"query": sql}, headers={
                "Authorization": f"Bearer {MGMT_TOKEN}", "User-Agent": "supabase-cli/2.84.4",
            }, timeout=30)
            if r.status_code < 400:
                return True
            return False
        except Exception:
            if a < 2: time.sleep(3)
    return False


# Load ALL checkpoints
all_updates = {}

# Theory checkpoint
path1 = os.path.join(BASE, "related_facts_checkpoint.json")
if os.path.exists(path1):
    with open(path1, encoding="utf-8") as f:
        data = json.load(f)
    all_updates.update(data)
    print(f"Theory checkpoint: {len(data)}", flush=True)

# MC checkpoint
path2 = os.path.join(BASE, "related_facts_mc_checkpoint.json")
if os.path.exists(path2):
    with open(path2, encoding="utf-8") as f:
        data = json.load(f)
    all_updates.update(data)
    print(f"MC checkpoint: {len(data)}", flush=True)

print(f"Total to apply: {len(all_updates)}\n", flush=True)

# Build batch SQL and execute
items = list(all_updates.items())
applied = 0
errors = 0

for i in range(0, len(items), BATCH_SQL):
    batch = items[i:i+BATCH_SQL]
    sql_parts = []
    for qid, rf in batch:
        safe_id = qid.replace("'", "''")
        safe_rf = json.dumps(rf).replace("'", "''")
        sql_parts.append(f"UPDATE exam_questions SET related_facts = '{safe_rf}'::jsonb WHERE id = '{safe_id}';")

    sql = "\n".join(sql_parts)
    ok = run_sql(sql)
    if ok:
        applied += len(batch)
    else:
        errors += len(batch)

    if applied % 500 == 0 or i + BATCH_SQL >= len(items):
        print(f"  {applied}/{len(items)} applied ({errors} errors)", flush=True)

    time.sleep(0.5)

print(f"\nDONE: {applied} applied, {errors} errors", flush=True)
