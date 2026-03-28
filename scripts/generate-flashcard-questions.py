"""
Generate 5 flashcard questions per atomic fact using OpenAI gpt-4o-mini.
Uses requests library (not urllib) for reliable HTTP on Windows.

Usage: py -u scripts/generate-flashcard-questions.py [--dry-run]
"""

import json
import os
import sys
import time
import requests

OPENAI_KEY = os.environ["OPENAI_API_KEY"]
SUPABASE_URL = "https://lltcfjmshnhfmavlxpxr.supabase.co"
SERVICE_KEY = os.environ["SUPABASE_SERVICE_ROLE_KEY"]
MGMT_TOKEN = os.environ["SUPABASE_ACCESS_TOKEN"]
MGMT_API = "https://api.supabase.com/v1/projects/lltcfjmshnhfmavlxpxr/database/query"

BATCH_SIZE = 20
DRY_RUN = "--dry-run" in sys.argv
BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
CHECKPOINT_FILE = os.path.join(BASE_DIR, "data", "flashcard_questions_checkpoint.json")
LANG_MAP = {"0520": "French", "0504": "Portuguese"}

SYSTEM_PROMPT = """For each fact, generate exactly 5 different flashcard questions, each from a different angle:
1. DEFINITION: "What is X?" or "Define X"
2. APPLICATION: "How would you use X?" or practical scenario
3. FORMULA/METHOD: "What is the formula for X?" or "How do you calculate X?"
4. COMPARISON: "What is the difference between X and Y?"
5. SCENARIO: concrete example with numbers or situation

Rules:
- Max 20 words per question
- For French facts: ALL questions in French
- For Portuguese facts: ALL questions in Portuguese
- Return JSON: {"results": [{"id": "ID", "questions": ["q1","q2","q3","q4","q5"]}]}"""


def run_sql(sql):
    for attempt in range(3):
        try:
            r = requests.post(MGMT_API, json={"query": sql}, headers={
                "Authorization": f"Bearer {MGMT_TOKEN}",
                "User-Agent": "supabase-cli/2.84.4",
            }, timeout=15)
            r.raise_for_status()
            return r.json()
        except Exception as e:
            if attempt < 2:
                time.sleep(3)
                continue
            raise


def rest_post(table, rows):
    for attempt in range(3):
        try:
            r = requests.post(f"{SUPABASE_URL}/rest/v1/{table}", json=rows, headers={
                "apikey": SERVICE_KEY,
                "Authorization": f"Bearer {SERVICE_KEY}",
                "Prefer": "return=minimal",
            }, timeout=30)
            r.raise_for_status()
            return True
        except Exception:
            if attempt < 2:
                time.sleep(2)
                continue
            return False


def call_openai(facts_batch):
    user_msg = json.dumps([
        {"id": f["id"], "fact": f["fact_text"], "subject": f["subject_code"],
         "language": LANG_MAP.get(f["subject_code"], "English")}
        for f in facts_batch
    ], ensure_ascii=False)

    try:
        r = requests.post("https://api.openai.com/v1/chat/completions", json={
            "model": "gpt-4o-mini",
            "max_tokens": 4096,
            "temperature": 0.7,
            "response_format": {"type": "json_object"},
            "messages": [
                {"role": "system", "content": SYSTEM_PROMPT},
                {"role": "user", "content": f"Generate 5 questions per fact:\n{user_msg}"},
            ],
        }, headers={
            "Authorization": f"Bearer {OPENAI_KEY}",
        }, timeout=45)
        r.raise_for_status()
        text = r.json()["choices"][0]["message"]["content"]
        parsed = json.loads(text)
        return parsed.get("results", parsed.get("questions", parsed.get("facts", [])))
    except Exception as e:
        print(f"  OpenAI error: {e}", flush=True)
        return []


def load_checkpoint():
    if os.path.exists(CHECKPOINT_FILE):
        with open(CHECKPOINT_FILE, encoding="utf-8") as f:
            return json.load(f)
    return {}


def save_checkpoint(data):
    os.makedirs(os.path.dirname(CHECKPOINT_FILE), exist_ok=True)
    with open(CHECKPOINT_FILE, "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False)


def main():
    print("=" * 60, flush=True)
    print("Generate 5 flashcard questions per fact", flush=True)
    print("=" * 60, flush=True)

    checkpoint = load_checkpoint()
    print(f"Checkpoint: {len(checkpoint)} facts already done", flush=True)

    print("Fetching facts...", flush=True)
    facts = run_sql("SELECT id, fact_text, subject_code FROM atomic_facts ORDER BY subject_code, id")
    print(f"  {len(facts)} facts total", flush=True)

    remaining = [f for f in facts if f["id"] not in checkpoint]
    print(f"  {len(remaining)} remaining\n", flush=True)

    if DRY_RUN:
        print(f"[DRY RUN] Would make {(len(remaining) + BATCH_SIZE - 1) // BATCH_SIZE} API calls", flush=True)
        return

    # Phase 1: Generate
    print("Phase 1: Generating questions...", flush=True)
    total_batches = (len(remaining) + BATCH_SIZE - 1) // BATCH_SIZE
    start = time.time()

    for i in range(0, len(remaining), BATCH_SIZE):
        batch = remaining[i:i + BATCH_SIZE]
        batch_num = i // BATCH_SIZE + 1

        results = call_openai(batch)

        for item in results:
            try:
                if not isinstance(item, dict):
                    continue
                fid = item.get("id")
                qs = item.get("questions", [])
                if fid and isinstance(qs, list) and len(qs) >= 1:
                    checkpoint[fid] = [q for q in qs[:5] if isinstance(q, str)]
            except Exception:
                pass

        # Progress every batch
        elapsed = time.time() - start
        rate = batch_num / elapsed if elapsed > 0 else 0
        left = (total_batches - batch_num) / rate if rate > 0 else 0
        print(f"  Batch {batch_num}/{total_batches} — {len(checkpoint)} facts done — ~{left:.0f}s left", flush=True)

        # Checkpoint every 200 facts
        if len(checkpoint) % 200 < BATCH_SIZE:
            save_checkpoint(checkpoint)

        time.sleep(0.3)

    save_checkpoint(checkpoint)
    total_qs = sum(len(qs) for qs in checkpoint.values())
    print(f"\nGeneration done: {len(checkpoint)} facts, {total_qs} questions", flush=True)

    # Phase 2: Insert
    print("\nPhase 2: Inserting into DB...", flush=True)
    rows = []
    for fid, questions in checkpoint.items():
        fact = next((f for f in facts if f["id"] == fid), None)
        lang = "fr" if fact and fact["subject_code"] == "0520" else "pt" if fact and fact["subject_code"] == "0504" else "en"
        for q in questions:
            rows.append({"fact_id": fid, "question": q, "language": lang})

    print(f"  {len(rows)} rows to insert", flush=True)

    INSERT_BATCH = 200
    for i in range(0, len(rows), INSERT_BATCH):
        batch = rows[i:i + INSERT_BATCH]
        rest_post("flashcard_questions", batch)
        done = min(i + INSERT_BATCH, len(rows))
        if done % 1000 == 0 or done == len(rows):
            print(f"  {done}/{len(rows)} inserted", flush=True)
        time.sleep(0.3)

    print(f"\nDONE!", flush=True)
    time.sleep(2)
    r = run_sql("SELECT count(*)::int AS c FROM flashcard_questions")
    print(f"Total in DB: {r[0]['c']}", flush=True)


if __name__ == "__main__":
    main()
