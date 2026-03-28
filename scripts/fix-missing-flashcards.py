import os
"""
Generate flashcard questions for the ~140 facts that are missing.
Run in terminal: py -u scripts/fix-missing-flashcards.py
"""
import json, sys, time, requests
sys.stdout.reconfigure(encoding="utf-8")

SUPABASE_URL = "https://lltcfjmshnhfmavlxpxr.supabase.co"
SERVICE_KEY = os.environ["SUPABASE_SERVICE_ROLE_KEY"]
OPENAI_KEY = os.environ["OPENAI_API_KEY"]
MGMT_TOKEN = os.environ["SUPABASE_ACCESS_TOKEN"]
MGMT_API = "https://api.supabase.com/v1/projects/lltcfjmshnhfmavlxpxr/database/query"
LANG_MAP = {"0520": "French", "0504": "Portuguese"}

def sql(query):
    r = requests.post(MGMT_API, json={"query": query}, headers={
        "Authorization": f"Bearer {MGMT_TOKEN}", "User-Agent": "supabase-cli/2.84.4"}, timeout=15)
    return r.json()

print("Fetching missing facts...", flush=True)
missing = sql("""SELECT af.id, af.fact_text, af.subject_code FROM atomic_facts af
WHERE af.is_active = true
AND NOT EXISTS (SELECT 1 FROM flashcard_questions fq WHERE fq.fact_id = af.id)
ORDER BY af.id""")
print(f"  {len(missing)} facts need questions\n", flush=True)

BATCH = 10
generated = 0

for i in range(0, len(missing), BATCH):
    batch = missing[i:i+BATCH]
    batch_num = i // BATCH + 1
    total_batches = (len(missing) + BATCH - 1) // BATCH

    user_msg = json.dumps([
        {"id": f["id"], "fact": f["fact_text"], "language": LANG_MAP.get(f["subject_code"], "English")}
        for f in batch
    ], ensure_ascii=False)

    print(f"  Batch {batch_num}/{total_batches}...", end="", flush=True)

    try:
        r = requests.post("https://api.openai.com/v1/chat/completions", json={
            "model": "gpt-4o-mini", "max_tokens": 4096, "temperature": 0.7,
            "response_format": {"type": "json_object"},
            "messages": [
                {"role": "system", "content": 'For each fact, generate 5 flashcard questions. Max 20 words each. French=French, Portuguese=Portuguese. Return JSON: {"results": [{"id": "ID", "questions": ["q1","q2","q3","q4","q5"]}]}'},
                {"role": "user", "content": user_msg},
            ],
        }, headers={"Authorization": f"Bearer {OPENAI_KEY}"}, timeout=60)

        resp = r.json()
        if "error" in resp:
            print(f" API ERROR: {resp['error']}", flush=True)
            time.sleep(5)
            continue
        parsed = json.loads(resp["choices"][0]["message"]["content"])
        rows = []
        for item in parsed.get("results", []):
            if not isinstance(item, dict): continue
            fid = item.get("id")
            qs = item.get("questions", [])
            if not fid or not qs: continue
            fact = next((f for f in batch if f["id"] == fid), None)
            lang = "fr" if fact and fact["subject_code"] == "0520" else "pt" if fact and fact["subject_code"] == "0504" else "en"
            for qq in qs[:5]:
                rows.append({"fact_id": fid, "question": qq, "language": lang})
            generated += 1

        if rows:
            requests.post(f"{SUPABASE_URL}/rest/v1/flashcard_questions", json=rows, headers={
                "apikey": SERVICE_KEY, "Authorization": f"Bearer {SERVICE_KEY}", "Prefer": "return=minimal",
            }, timeout=30)

        print(f" OK ({generated} total)", flush=True)
    except Exception as e:
        print(f" ERROR: {e}", flush=True)

    time.sleep(0.5)

print(f"\nDone: {generated} facts completed", flush=True)
time.sleep(2)
r = sql("SELECT count(*)::int AS c FROM flashcard_questions")
print(f"Total in DB: {r[0]['c']}", flush=True)
r = sql("SELECT count(DISTINCT fact_id)::int AS c FROM flashcard_questions")
print(f"Unique facts: {r[0]['c']}", flush=True)
