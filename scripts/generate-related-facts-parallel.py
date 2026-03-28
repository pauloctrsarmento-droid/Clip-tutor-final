import os
"""
Generate related_facts for MC questions using parallel threads.
Runs 5 threads simultaneously — each processing a different topic.

py -u scripts/generate-related-facts-parallel.py
"""
import json, os, sys, time, requests
from concurrent.futures import ThreadPoolExecutor, as_completed
from threading import Lock

sys.stdout.reconfigure(encoding="utf-8")

OPENAI_KEY = os.environ["OPENAI_API_KEY"]
SUPABASE_URL = "https://lltcfjmshnhfmavlxpxr.supabase.co"
SERVICE_KEY = os.environ["SUPABASE_SERVICE_ROLE_KEY"]
H = {"apikey": SERVICE_KEY, "Authorization": f"Bearer {SERVICE_KEY}"}
BASE = "c:/Users/sarma/OneDrive/Ambiente de Trabalho/tutor final/data"
CHECKPOINT = os.path.join(BASE, "related_facts_mc_checkpoint.json")
BATCH = 10
WORKERS = 5

SYSTEM = """You are an expert Cambridge IGCSE curriculum specialist. For each exam question, identify which atomic facts from the provided list are DIRECTLY tested.

Rules:
- A fact is DIRECTLY tested if the student MUST know it to answer correctly
- Return 1-3 facts maximum per question
- Score 0.9+ = essential, 0.7-0.89 = strongly relevant, 0.5-0.69 = supporting
- Do NOT return facts below 0.5
- If NO fact matches, return empty array

Return JSON: {"results": [{"question_id": "ID", "related_facts": [{"fact_id": "FID", "score": 0.95}]}]}"""

# Thread-safe checkpoint
checkpoint_lock = Lock()
checkpoint = {}
if os.path.exists(CHECKPOINT):
    with open(CHECKPOINT, encoding="utf-8") as f:
        checkpoint = json.load(f)
print(f"Checkpoint: {len(checkpoint)} already done", flush=True)

# Fetch MC questions with topic
print("Fetching MC questions with topic...", flush=True)
all_qs = []
offset = 0
while True:
    r = requests.get(
        f"{SUPABASE_URL}/rest/v1/exam_questions?question_type=eq.multiple_choice&syllabus_topic_id=not.is.null&select=id,syllabus_topic_id,question_text&order=id&offset={offset}&limit=1000",
        headers=H, timeout=15)
    batch = r.json()
    all_qs.extend(batch)
    if len(batch) < 1000: break
    offset += len(batch)

remaining = [q for q in all_qs if q["id"] not in checkpoint]
print(f"  {len(all_qs)} total MC with topic, {len(remaining)} remaining", flush=True)

# Fetch facts
print("Fetching facts...", flush=True)
all_facts = []
offset = 0
while True:
    r = requests.get(
        f"{SUPABASE_URL}/rest/v1/atomic_facts?is_active=eq.true&select=id,fact_text,syllabus_topic_id&order=id&offset={offset}&limit=1000",
        headers=H, timeout=15)
    batch = r.json()
    all_facts.extend(batch)
    if len(batch) < 1000: break
    offset += len(batch)

facts_by_topic = {}
for f in all_facts:
    tid = f.get("syllabus_topic_id")
    if tid:
        facts_by_topic.setdefault(tid, []).append({"id": f["id"], "text": f["fact_text"][:150]})

print(f"  {len(all_facts)} facts across {len(facts_by_topic)} topics\n", flush=True)

# Group remaining by topic
qs_by_topic = {}
for q in remaining:
    tid = q["syllabus_topic_id"]
    qs_by_topic.setdefault(tid, []).append(q)

# Build work items: (topic_id, batch_of_questions, facts_text)
work_items = []
for tid, questions in qs_by_topic.items():
    topic_facts = facts_by_topic.get(tid, [])
    if not topic_facts:
        with checkpoint_lock:
            for q in questions:
                checkpoint[q["id"]] = []
        continue
    facts_text = "\n".join(f"- {f['id']}: {f['text']}" for f in topic_facts[:50])
    for i in range(0, len(questions), BATCH):
        batch = questions[i:i+BATCH]
        work_items.append((tid, batch, facts_text))

print(f"Work items: {len(work_items)} batches across {len(qs_by_topic)} topics", flush=True)
print(f"Workers: {WORKERS} threads\n", flush=True)

# Counter
done_count = 0
done_lock = Lock()


def process_batch(item):
    global done_count
    tid, batch, facts_text = item
    qs_text = "\n".join(f"- {q['id']}: {q['question_text'][:150]}" for q in batch)

    try:
        resp = requests.post("https://api.openai.com/v1/chat/completions", json={
            "model": "gpt-4o-mini",
            "max_tokens": 4096,
            "response_format": {"type": "json_object"},
            "messages": [
                {"role": "system", "content": SYSTEM},
                {"role": "user", "content": f"TOPIC FACTS:\n{facts_text}\n\nQUESTIONS:\n{qs_text}"},
            ],
        }, headers={"Authorization": f"Bearer {OPENAI_KEY}"}, timeout=60)

        parsed = json.loads(resp.json()["choices"][0]["message"]["content"])
        results = {}
        for item_r in parsed.get("results", []):
            if isinstance(item_r, dict) and "question_id" in item_r:
                results[item_r["question_id"]] = item_r.get("related_facts", [])

        with checkpoint_lock:
            checkpoint.update(results)

        with done_lock:
            done_count += len(batch)

        return len(results)
    except Exception as e:
        return 0


# Run parallel
start = time.time()
completed = 0

with ThreadPoolExecutor(max_workers=WORKERS) as pool:
    futures = {pool.submit(process_batch, item): item for item in work_items}

    for i, future in enumerate(as_completed(futures), 1):
        result = future.result()
        completed += 1

        if completed % 20 == 0 or completed == len(work_items):
            elapsed = time.time() - start
            rate = completed / elapsed if elapsed > 0 else 0
            left = (len(work_items) - completed) / rate if rate > 0 else 0
            print(f"  {completed}/{len(work_items)} batches — {done_count} questions — {rate:.1f}/s — ~{left:.0f}s left", flush=True)

        # Save checkpoint periodically
        if completed % 50 == 0:
            with checkpoint_lock:
                with open(CHECKPOINT, "w", encoding="utf-8") as f:
                    json.dump(checkpoint, f, ensure_ascii=False)

# Final save
with open(CHECKPOINT, "w", encoding="utf-8") as f:
    json.dump(checkpoint, f, ensure_ascii=False)

elapsed = time.time() - start
print(f"\nClassified: {len(checkpoint)} in {elapsed:.0f}s", flush=True)

with_facts = sum(1 for v in checkpoint.values() if v)
print(f"With facts: {with_facts}, Without: {len(checkpoint) - with_facts}", flush=True)

# Apply to DB
print("\nApplying to DB...", flush=True)
applied = 0
for qid, rf in checkpoint.items():
    requests.patch(
        f"{SUPABASE_URL}/rest/v1/exam_questions?id=eq.{qid}",
        json={"related_facts": rf},
        headers={**H, "Content-Type": "application/json", "Prefer": "return=minimal"},
        timeout=10)
    applied += 1
    if applied % 500 == 0:
        print(f"  {applied}...", flush=True)

print(f"  {applied} applied\nDONE", flush=True)
