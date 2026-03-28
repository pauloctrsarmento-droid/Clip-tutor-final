"""
Generate flashcard_front questions for all atomic facts using OpenAI.
Batches 20 facts per API call. Updates atomic_facts in Supabase.

Usage: py scripts/generate-flashcard-fronts.py [--dry-run]
Cost estimate: ~$0.50 for 1,954 facts
"""

import json
import os
import sys
import time
import urllib.request

sys.stdout.reconfigure(encoding="utf-8")

OPENAI_KEY = os.environ["OPENAI_API_KEY"]
SUPABASE_URL = "https://lltcfjmshnhfmavlxpxr.supabase.co"
SERVICE_KEY = os.environ["SUPABASE_SERVICE_ROLE_KEY"]
MGMT_TOKEN = os.environ["SUPABASE_ACCESS_TOKEN"]
MGMT_API = "https://api.supabase.com/v1/projects/lltcfjmshnhfmavlxpxr/database/query"

BATCH_SIZE = 20
DRY_RUN = "--dry-run" in sys.argv

SYSTEM_PROMPT = """You generate flashcard questions from facts. For each fact, create a short question (max 15 words) that would elicit this fact as the answer.

Rules:
- Definitions: "Define X" or "What is X?"
- Processes: "Describe how X works" or "What happens when X?"
- Formulas: "What is the formula for X?"
- Lists: "Name the types of X" or "What are the X?"
- Comparisons: "How does X differ from Y?"
- For facts in French: generate the question in French
- For facts in Portuguese: generate the question in Portuguese
- All other subjects: question in English

Return ONLY a JSON array: [{"id": "FACT_ID", "question": "the question"}]
No other text, just the JSON array."""

LANG_MAP = {"0520": "French", "0504": "Portuguese"}


def run_sql(sql, retries=3):
    for attempt in range(retries):
        data = json.dumps({"query": sql}).encode("utf-8")
        req = urllib.request.Request(MGMT_API, data=data, method="POST", headers={
            "Authorization": f"Bearer {MGMT_TOKEN}",
            "Content-Type": "application/json",
            "User-Agent": "supabase-cli/2.84.4",
        })
        try:
            return json.loads(urllib.request.urlopen(req).read().decode("utf-8"))
        except urllib.error.HTTPError as e:
            if e.code == 429 and attempt < retries - 1:
                time.sleep(5 * (attempt + 1))
                continue
            raise


def call_openai(facts_batch):
    user_msg = json.dumps([
        {"id": f["id"], "fact": f["fact_text"], "subject": f["subject_code"],
         "language": LANG_MAP.get(f["subject_code"], "English")}
        for f in facts_batch
    ], ensure_ascii=False)

    body = json.dumps({
        "model": "gpt-4o",
        "max_tokens": 2048,
        "response_format": {"type": "json_object"},
        "messages": [
            {"role": "system", "content": SYSTEM_PROMPT},
            {"role": "user", "content": f"Generate questions for these facts:\n{user_msg}"},
        ],
    }).encode("utf-8")

    req = urllib.request.Request("https://api.openai.com/v1/chat/completions", data=body, headers={
        "Authorization": f"Bearer {OPENAI_KEY}",
        "Content-Type": "application/json",
    })

    for attempt in range(3):
        try:
            resp = urllib.request.urlopen(req, timeout=60)
            result = json.loads(resp.read().decode("utf-8"))
            text = result["choices"][0]["message"]["content"]
            parsed = json.loads(text)
            # Handle both {"questions": [...]} and [...] formats
            if isinstance(parsed, dict):
                return parsed.get("questions", parsed.get("results", []))
            return parsed
        except Exception as e:
            if attempt < 2:
                time.sleep(2)
                continue
            print(f"  OpenAI error after 3 retries: {e}")
            return []


def main():
    print("=" * 60)
    print("Generate flashcard_front for atomic facts")
    print("=" * 60)

    if DRY_RUN:
        print("[DRY RUN]\n")

    # Fetch all facts without flashcard_front
    print("Fetching facts...")
    result = run_sql("SELECT id, fact_text, subject_code FROM atomic_facts WHERE flashcard_front IS NULL OR flashcard_front = '' ORDER BY subject_code, id")
    facts = result
    print(f"  {len(facts)} facts need questions\n")

    if DRY_RUN:
        print(f"Would process {len(facts)} facts in {(len(facts) + BATCH_SIZE - 1) // BATCH_SIZE} batches")
        return

    generated = 0
    failed = 0
    total_batches = (len(facts) + BATCH_SIZE - 1) // BATCH_SIZE

    for i in range(0, len(facts), BATCH_SIZE):
        batch = facts[i:i + BATCH_SIZE]
        batch_num = i // BATCH_SIZE + 1

        questions = call_openai(batch)

        if not questions:
            failed += len(batch)
            print(f"  Batch {batch_num}/{total_batches}: FAILED (no response)")
            continue

        # Build id → question map
        q_map = {q["id"]: q["question"] for q in questions if "id" in q and "question" in q}

        # Update DB
        for fact in batch:
            question = q_map.get(fact["id"])
            if question:
                safe_q = question.replace("'", "''")
                safe_id = fact["id"].replace("'", "''")
                run_sql(f"UPDATE atomic_facts SET flashcard_front = '{safe_q}' WHERE id = '{safe_id}'")
                generated += 1
            else:
                failed += 1

        if batch_num % 5 == 0 or batch_num == total_batches:
            print(f"  Batch {batch_num}/{total_batches}: {generated} generated, {failed} failed")

        time.sleep(0.5)  # Rate limit buffer

    print(f"\n{'=' * 60}")
    print(f"DONE: {generated} generated, {failed} failed")

    # Verify
    time.sleep(2)
    result = run_sql("SELECT count(*)::int AS c FROM atomic_facts WHERE flashcard_front IS NOT NULL AND flashcard_front != ''")
    print(f"Facts with flashcard_front: {result[0]['c']}")

    # Sample
    result = run_sql("SELECT id, flashcard_front, left(fact_text, 60) AS fact FROM atomic_facts WHERE flashcard_front IS NOT NULL LIMIT 5")
    print("\nSamples:")
    for r in result:
        print(f"  {r['id']}")
        print(f"    Q: {r['flashcard_front']}")
        print(f"    A: {r['fact']}")


if __name__ == "__main__":
    main()
