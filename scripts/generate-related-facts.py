"""
Generate related_facts for ALL exam questions (Theory + MC) using OpenAI.
Groups questions by topic, loads facts for that topic, asks AI to match.

Usage: py -u scripts/generate-related-facts.py
"""

import json
import os
import sys
import time
import requests

sys.stdout.reconfigure(encoding="utf-8")
print("Starting related_facts generation...", flush=True)

OPENAI_KEY = os.environ["OPENAI_API_KEY"]
SUPABASE_URL = "https://lltcfjmshnhfmavlxpxr.supabase.co"
SERVICE_KEY = os.environ["SUPABASE_SERVICE_ROLE_KEY"]
MGMT_TOKEN = os.environ["SUPABASE_ACCESS_TOKEN"]
MGMT_API = "https://api.supabase.com/v1/projects/lltcfjmshnhfmavlxpxr/database/query"

BATCH = 10
BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
CHECKPOINT = os.path.join(BASE_DIR, "data", "related_facts_checkpoint.json")

SYSTEM_PROMPT = """You are an expert Cambridge IGCSE curriculum specialist. For each exam question, identify which atomic facts from the provided list are DIRECTLY tested by the question.

Rules:
- A fact is DIRECTLY tested if the student MUST know that specific fact to answer correctly
- NOT tangentially related — DIRECTLY required
- For calculation questions: include the formula fact AND the concept fact
- For definition questions: include ONLY the definition fact
- For 'explain' questions: include the main concept + supporting facts needed
- Return 1-3 facts maximum per question — only the most directly relevant
- Score 0.9+ = essential (question cannot be answered without this fact)
- Score 0.7-0.89 = strongly relevant (very helpful)
- Score 0.5-0.69 = supporting (provides context)
- Do NOT return facts below 0.5
- If NO fact directly matches, return empty array []

Return JSON: {"results": [{"question_id": "ID", "related_facts": [{"fact_id": "FID", "score": 0.95}]}]}"""


def run_sql(sql):
    for attempt in range(3):
        try:
            r = requests.post(MGMT_API, json={"query": sql}, headers={
                "Authorization": f"Bearer {MGMT_TOKEN}", "User-Agent": "supabase-cli/2.84.4",
            }, timeout=15)
            r.raise_for_status()
            return r.json()
        except Exception:
            if attempt < 2: time.sleep(3)
    return []


def fetch_all(table, params=""):
    """Fetch all rows from a Supabase table via REST (handles pagination)."""
    all_rows = []
    offset = 0
    while True:
        sep = "&" if "?" in params else "?"
        url = f"{SUPABASE_URL}/rest/v1/{table}{params}{sep}offset={offset}&limit=1000&order=id"
        r = requests.get(url, headers={
            "apikey": SERVICE_KEY, "Authorization": f"Bearer {SERVICE_KEY}",
        }, timeout=15)
        batch = r.json()
        all_rows.extend(batch)
        if len(batch) < 1000:
            break
        offset += len(batch)
    return all_rows


def main():
    # Load checkpoint
    checkpoint = {}
    if os.path.exists(CHECKPOINT):
        with open(CHECKPOINT, encoding="utf-8") as f:
            checkpoint = json.load(f)
    print(f"Checkpoint: {len(checkpoint)} questions already done", flush=True)

    # Fetch all questions with topic
    print("Fetching questions with topics...", flush=True)
    questions = fetch_all("exam_questions", "?select=id,syllabus_topic_id,question_text,question_number,question_type&syllabus_topic_id=not.is.null")
    print(f"  {len(questions)} questions with topic", flush=True)

    # Fetch all facts
    print("Fetching atomic facts...", flush=True)
    facts = fetch_all("atomic_facts", "?select=id,fact_text,syllabus_topic_id&is_active=eq.true")
    print(f"  {len(facts)} active facts", flush=True)

    # Group facts by topic
    facts_by_topic = {}
    for f in facts:
        tid = f.get("syllabus_topic_id")
        if not tid:
            continue
        if tid not in facts_by_topic:
            facts_by_topic[tid] = []
        facts_by_topic[tid].append({"id": f["id"], "text": f["fact_text"]})

    # Group questions by topic
    questions_by_topic = {}
    for q in questions:
        if q["id"] in checkpoint:
            continue
        tid = q["syllabus_topic_id"]
        if tid not in questions_by_topic:
            questions_by_topic[tid] = []
        questions_by_topic[tid].append(q)

    # Count remaining
    remaining = sum(len(qs) for qs in questions_by_topic.values())
    print(f"  {remaining} questions remaining to process", flush=True)

    # Process topic by topic
    total_done = len(checkpoint)
    topics_done = 0
    total_topics = len(questions_by_topic)
    start = time.time()

    for topic_id, topic_questions in questions_by_topic.items():
        topic_facts = facts_by_topic.get(topic_id, [])
        topics_done += 1

        if not topic_facts:
            # No facts for this topic — skip
            for q in topic_questions:
                checkpoint[q["id"]] = []
            continue

        # Build facts context (truncate if too many)
        facts_text = "\n".join(f"- {f['id']}: {f['text'][:150]}" for f in topic_facts[:50])

        # Process in batches
        for i in range(0, len(topic_questions), BATCH):
            batch = topic_questions[i:i + BATCH]

            questions_text = "\n".join(
                f"- {q['id']}: {q['question_text'][:200]}"
                for q in batch
            )

            print(f"  Topic {topics_done}/{total_topics}, batch {i // BATCH + 1} ({len(batch)} qs, {len(topic_facts)} facts)...", end="", flush=True)

            try:
                resp = requests.post("https://api.openai.com/v1/chat/completions", json={
                    "model": "gpt-4o-mini",
                    "max_tokens": 4096,
                    "response_format": {"type": "json_object"},
                    "messages": [
                        {"role": "system", "content": SYSTEM_PROMPT},
                        {"role": "user", "content": f"TOPIC FACTS:\n{facts_text}\n\nQUESTIONS:\n{questions_text}"},
                    ],
                }, headers={"Authorization": f"Bearer {OPENAI_KEY}"}, timeout=60)

                parsed = json.loads(resp.json()["choices"][0]["message"]["content"])
                results = parsed.get("results", [])

                count = 0
                for item in results:
                    if isinstance(item, dict) and "question_id" in item:
                        rf = item.get("related_facts", [])
                        if isinstance(rf, list):
                            checkpoint[item["question_id"]] = rf
                            count += 1

                total_done += count
                elapsed = time.time() - start
                print(f" {count} matched (total: {total_done})", flush=True)

            except Exception as e:
                print(f" ERROR: {e}", flush=True)

            # Checkpoint every 500
            if total_done % 500 < BATCH:
                with open(CHECKPOINT, "w", encoding="utf-8") as f:
                    json.dump(checkpoint, f, ensure_ascii=False)

            time.sleep(0.3)

    # Final save
    with open(CHECKPOINT, "w", encoding="utf-8") as f:
        json.dump(checkpoint, f, ensure_ascii=False)

    print(f"\nGeneration complete: {len(checkpoint)} questions processed", flush=True)
    with_facts = sum(1 for v in checkpoint.values() if v)
    print(f"  {with_facts} with related_facts, {len(checkpoint) - with_facts} without", flush=True)

    # Apply to DB
    print("\nApplying to DB...", flush=True)
    applied = 0
    for qid, rf in checkpoint.items():
        safe_id = qid.replace("'", "''")
        safe_rf = json.dumps(rf).replace("'", "''")
        run_sql(f"UPDATE exam_questions SET related_facts = '{safe_rf}'::jsonb WHERE id = '{safe_id}'")
        applied += 1
        if applied % 500 == 0:
            print(f"  {applied}/{len(checkpoint)} applied...", flush=True)
        time.sleep(0.1)

    print(f"  {applied} total applied", flush=True)

    # Verify
    time.sleep(2)
    r = run_sql("SELECT count(*)::int AS c FROM exam_questions WHERE related_facts != '[]'")
    print(f"\nWith related_facts: {r[0]['c'] if r else '?'}", flush=True)
    r = run_sql("SELECT round(avg(jsonb_array_length(related_facts))::numeric, 1) AS avg FROM exam_questions WHERE related_facts != '[]'")
    print(f"Avg facts per question: {r[0]['avg'] if r else '?'}", flush=True)


if __name__ == "__main__":
    main()
