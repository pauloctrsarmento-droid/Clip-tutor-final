import os
"""
Classify MC questions by topic + apply to DB. All in one, fast.
Uses REST API for DB (not Management API).

py -u scripts/classify-mc-fast.py [--chunk N]  (default: all)
"""
import json, os, sys, time, requests

sys.stdout.reconfigure(encoding="utf-8")

OPENAI_KEY = os.environ["OPENAI_API_KEY"]
SUPABASE_URL = "https://lltcfjmshnhfmavlxpxr.supabase.co"
SERVICE_KEY = os.environ["SUPABASE_SERVICE_ROLE_KEY"]
H = {"apikey": SERVICE_KEY, "Authorization": f"Bearer {SERVICE_KEY}"}
BASE = "c:/Users/sarma/OneDrive/Ambiente de Trabalho/tutor final/data"
CHECKPOINT = os.path.join(BASE, "mc_topics_checkpoint.json")
BATCH = 20

TOPICS = {
    "0620": "CHEM_T1: States of matter, CHEM_T2: Atoms electrons compounds, CHEM_T3: Stoichiometry, CHEM_T4: Electrochemistry, CHEM_T5: Chemical energetics, CHEM_T6: Chemical reactions, CHEM_T7: Acids bases salts, CHEM_T8: Periodic table, CHEM_T9: Metals, CHEM_T10: Environment, CHEM_T11: Organic chemistry, CHEM_T12: Experimental techniques",
    "0625": "PHYS_T1: Motion forces energy, PHYS_T2: Thermal physics, PHYS_T3: Waves, PHYS_T4: Electricity magnetism, PHYS_T5: Nuclear physics, PHYS_T6: Space physics",
    "0610": "BIO_T1: Classification, BIO_T2: Organisation, BIO_T3: Movement cells, BIO_T4: Biological molecules, BIO_T5: Enzymes, BIO_T6: Plant nutrition, BIO_T7: Human nutrition, BIO_T8: Transport plants, BIO_T9: Transport humans, BIO_T10: Diseases immunity, BIO_T11: Gas exchange, BIO_T12: Respiration, BIO_T13: Excretion, BIO_T14: Coordination response, BIO_T15: Drugs, BIO_T16: Reproduction, BIO_T17: Inheritance, BIO_T18: Variation selection, BIO_T19: Organisms environment, BIO_T20: Human influence, BIO_T21: Biotechnology",
}

# Load checkpoint
checkpoint = {}
if os.path.exists(CHECKPOINT):
    with open(CHECKPOINT, encoding="utf-8") as f:
        checkpoint = json.load(f)
print(f"Checkpoint: {len(checkpoint)} already classified", flush=True)

# Get topic UUID map
r = requests.get(f"{SUPABASE_URL}/rest/v1/syllabus_topics?select=id,topic_code", headers=H, timeout=10)
topic_uuids = {t["topic_code"]: t["id"] for t in r.json()}
print(f"Topic UUIDs: {len(topic_uuids)}", flush=True)

# Fetch unclassified MC questions
all_qs = []
offset = 0
while True:
    r = requests.get(
        f"{SUPABASE_URL}/rest/v1/exam_questions?question_type=eq.multiple_choice&syllabus_topic_id=is.null&select=id,subject_code,question_text&order=id&offset={offset}&limit=1000",
        headers=H, timeout=15)
    batch = r.json()
    all_qs.extend(batch)
    if len(batch) < 1000: break
    offset += len(batch)

remaining = [q for q in all_qs if q["id"] not in checkpoint]
print(f"Remaining: {len(remaining)}\n", flush=True)

# Classify
total_batches = (len(remaining) + BATCH - 1) // BATCH
classified = 0

for i in range(0, len(remaining), BATCH):
    batch = remaining[i:i+BATCH]
    batch_num = i // BATCH + 1
    subj = batch[0]["subject_code"]
    topics = TOPICS.get(subj, "")
    if not topics:
        continue

    user_msg = json.dumps([{"id": q["id"], "text": q["question_text"][:150]} for q in batch])

    print(f"  {batch_num}/{total_batches}...", end="", flush=True)
    try:
        resp = requests.post("https://api.openai.com/v1/chat/completions", json={
            "model": "gpt-4o-mini", "max_tokens": 2048, "temperature": 0,
            "response_format": {"type": "json_object"},
            "messages": [
                {"role": "system", "content": f"Classify each question into one topic. Topics: {topics}. Return JSON: {{\"results\": [{{\"id\": \"ID\", \"topic_code\": \"CODE\"}}]}}"},
                {"role": "user", "content": user_msg},
            ],
        }, headers={"Authorization": f"Bearer {OPENAI_KEY}"}, timeout=45)

        result = json.loads(resp.json()["choices"][0]["message"]["content"])
        for item in result.get("results", []):
            if isinstance(item, dict) and "id" in item and "topic_code" in item:
                checkpoint[item["id"]] = item["topic_code"]
                classified += 1
        print(f" {classified} total", flush=True)
    except Exception as e:
        print(f" ERROR: {e}", flush=True)

    if batch_num % 20 == 0:
        with open(CHECKPOINT, "w", encoding="utf-8") as f:
            json.dump(checkpoint, f)
    time.sleep(0.3)

# Save final checkpoint
with open(CHECKPOINT, "w", encoding="utf-8") as f:
    json.dump(checkpoint, f)
print(f"\nClassified: {len(checkpoint)}", flush=True)

# Apply to DB via REST PATCH (fast)
print("Applying to DB...", flush=True)
applied = 0
for qid, topic_code in checkpoint.items():
    uuid = topic_uuids.get(topic_code)
    if not uuid: continue
    r = requests.patch(
        f"{SUPABASE_URL}/rest/v1/exam_questions?id=eq.{qid}",
        json={"syllabus_topic_id": uuid},
        headers={**H, "Content-Type": "application/json", "Prefer": "return=minimal"},
        timeout=10)
    applied += 1
    if applied % 500 == 0:
        print(f"  {applied}...", flush=True)

print(f"  {applied} applied", flush=True)
print("DONE", flush=True)
