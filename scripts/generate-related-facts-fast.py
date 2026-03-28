import os
"""
Generate related_facts for exam questions that have syllabus_topic_id.
Groups by topic, sends questions + facts to LLM, applies via REST API.

py -u scripts/generate-related-facts-fast.py [--type theory|mc|all]
"""
import json, os, sys, time, requests

sys.stdout.reconfigure(encoding="utf-8")

OPENAI_KEY = os.environ["OPENAI_API_KEY"]
SUPABASE_URL = "https://lltcfjmshnhfmavlxpxr.supabase.co"
SERVICE_KEY = os.environ["SUPABASE_SERVICE_ROLE_KEY"]
H = {"apikey": SERVICE_KEY, "Authorization": f"Bearer {SERVICE_KEY}"}
BASE = "c:/Users/sarma/OneDrive/Ambiente de Trabalho/tutor final/data"
CHECKPOINT = os.path.join(BASE, "related_facts_checkpoint.json")
BATCH = 10

# Parse args
qtype = "theory"
if "--type" in sys.argv:
    idx = sys.argv.index("--type")
    qtype = sys.argv[idx + 1]

SYSTEM = """You are an expert Cambridge IGCSE curriculum specialist. For each exam question, identify which atomic facts from the provided list are DIRECTLY tested.

Rules:
- A fact is DIRECTLY tested if the student MUST know it to answer correctly
- Return 1-3 facts maximum per question — only the most directly relevant
- Score 0.9+ = essential, 0.7-0.89 = strongly relevant, 0.5-0.69 = supporting
- Do NOT return facts below 0.5
- If NO fact matches, return empty array

Return JSON: {"results": [{"question_id": "ID", "related_facts": [{"fact_id": "FID", "score": 0.95}]}]}"""

# Load checkpoint
checkpoint = {}
if os.path.exists(CHECKPOINT):
    with open(CHECKPOINT, encoding="utf-8") as f:
        checkpoint = json.load(f)
print(f"Checkpoint: {len(checkpoint)} already done", flush=True)

# Fetch questions with topic
print("Fetching questions...", flush=True)
all_qs = []
offset = 0
filter_type = ""
if qtype == "theory":
    filter_type = "&question_type=neq.multiple_choice"
elif qtype == "mc":
    filter_type = "&question_type=eq.multiple_choice"

while True:
    r = requests.get(
        f"{SUPABASE_URL}/rest/v1/exam_questions?syllabus_topic_id=not.is.null{filter_type}&select=id,syllabus_topic_id,question_text,question_number&order=id&offset={offset}&limit=1000",
        headers=H, timeout=15)
    batch = r.json()
    all_qs.extend(batch)
    if len(batch) < 1000: break
    offset += len(batch)

remaining = [q for q in all_qs if q["id"] not in checkpoint]
print(f"  {len(all_qs)} total, {len(remaining)} remaining\n", flush=True)

# Fetch all facts
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

# Group facts by topic
facts_by_topic = {}
for f in all_facts:
    tid = f.get("syllabus_topic_id")
    if not tid: continue
    if tid not in facts_by_topic:
        facts_by_topic[tid] = []
    facts_by_topic[tid].append({"id": f["id"], "text": f["fact_text"][:150]})

print(f"  {len(all_facts)} facts across {len(facts_by_topic)} topics\n", flush=True)

# Group questions by topic
qs_by_topic = {}
for q in remaining:
    tid = q["syllabus_topic_id"]
    if tid not in qs_by_topic:
        qs_by_topic[tid] = []
    qs_by_topic[tid].append(q)

# Process
topics_done = 0
total_topics = len(qs_by_topic)
classified = len(checkpoint)

for tid, questions in qs_by_topic.items():
    topic_facts = facts_by_topic.get(tid, [])
    topics_done += 1

    if not topic_facts:
        for q in questions:
            checkpoint[q["id"]] = []
        continue

    facts_text = "\n".join(f"- {f['id']}: {f['text']}" for f in topic_facts[:50])

    for i in range(0, len(questions), BATCH):
        batch = questions[i:i+BATCH]
        qs_text = "\n".join(f"- {q['id']}: {q['question_text'][:150]}" for q in batch)

        print(f"  Topic {topics_done}/{total_topics}, batch {i//BATCH+1} ({len(batch)} qs)...", end="", flush=True)

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
            for item in parsed.get("results", []):
                if isinstance(item, dict) and "question_id" in item:
                    checkpoint[item["question_id"]] = item.get("related_facts", [])
                    classified += 1

            print(f" {classified} total", flush=True)
        except Exception as e:
            print(f" ERROR: {e}", flush=True)

        if classified % 500 < BATCH:
            with open(CHECKPOINT, "w", encoding="utf-8") as f:
                json.dump(checkpoint, f, ensure_ascii=False)
        time.sleep(0.3)

# Save
with open(CHECKPOINT, "w", encoding="utf-8") as f:
    json.dump(checkpoint, f, ensure_ascii=False)
print(f"\nClassified: {len(checkpoint)}", flush=True)

# Apply to DB
print("Applying to DB...", flush=True)
applied = 0
for qid, rf in checkpoint.items():
    r = requests.patch(
        f"{SUPABASE_URL}/rest/v1/exam_questions?id=eq.{qid}",
        json={"related_facts": rf},
        headers={**H, "Content-Type": "application/json", "Prefer": "return=minimal"},
        timeout=10)
    applied += 1
    if applied % 500 == 0:
        print(f"  {applied}...", flush=True)

print(f"  {applied} applied\nDONE", flush=True)
