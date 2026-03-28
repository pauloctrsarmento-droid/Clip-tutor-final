import os
"""
Apply MC topic classifications from checkpoint to DB using batch SQL.
50 UPDATEs per query instead of 1 PATCH per row.

py -u scripts/apply-mc-topics-batch.py
"""
import json, os, sys, time, requests

sys.stdout.reconfigure(encoding="utf-8")

MGMT_TOKEN = os.environ["SUPABASE_ACCESS_TOKEN"]
MGMT_API = "https://api.supabase.com/v1/projects/lltcfjmshnhfmavlxpxr/database/query"
SUPABASE_URL = "https://lltcfjmshnhfmavlxpxr.supabase.co"
SERVICE_KEY = os.environ["SUPABASE_SERVICE_ROLE_KEY"]
H = {"apikey": SERVICE_KEY, "Authorization": f"Bearer {SERVICE_KEY}"}
BASE = "c:/Users/sarma/OneDrive/Ambiente de Trabalho/tutor final/data"
BATCH_SQL = 50


def run_sql(sql):
    for a in range(3):
        try:
            r = requests.post(MGMT_API, json={"query": sql}, headers={
                "Authorization": f"Bearer {MGMT_TOKEN}", "User-Agent": "supabase-cli/2.84.4",
            }, timeout=30)
            return r.status_code < 400
        except Exception:
            if a < 2: time.sleep(3)
    return False


# Load checkpoint
path = os.path.join(BASE, "mc_topics_checkpoint.json")
with open(path, encoding="utf-8") as f:
    checkpoint = json.load(f)
print(f"Checkpoint: {len(checkpoint)} classifications\n", flush=True)

# Get topic UUID map
r = requests.get(f"{SUPABASE_URL}/rest/v1/syllabus_topics?select=id,topic_code", headers=H, timeout=10)
topic_uuids = {t["topic_code"]: t["id"] for t in r.json()}
print(f"Topic UUIDs: {len(topic_uuids)}", flush=True)

# Build updates
items = [(qid, topic_uuids.get(tc)) for qid, tc in checkpoint.items() if topic_uuids.get(tc)]
print(f"To apply: {len(items)}\n", flush=True)

applied = 0
errors = 0

for i in range(0, len(items), BATCH_SQL):
    batch = items[i:i+BATCH_SQL]
    sql_parts = []
    for qid, uuid in batch:
        safe_id = qid.replace("'", "''")
        sql_parts.append(f"UPDATE exam_questions SET syllabus_topic_id = '{uuid}' WHERE id = '{safe_id}';")

    ok = run_sql("\n".join(sql_parts))
    if ok:
        applied += len(batch)
    else:
        errors += len(batch)

    if applied % 500 == 0 or i + BATCH_SQL >= len(items):
        print(f"  {applied}/{len(items)} applied ({errors} errors)", flush=True)

    time.sleep(0.5)

print(f"\nDONE: {applied} applied, {errors} errors", flush=True)
