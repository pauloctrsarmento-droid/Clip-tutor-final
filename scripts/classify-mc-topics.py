"""
Classify MC questions by syllabus topic using OpenAI gpt-4o-mini.
Requires Task 1 (real text) to be complete first.

Usage: py -u scripts/classify-mc-topics.py
"""

import json
import os
import sys
import time
import requests

sys.stdout.reconfigure(encoding="utf-8")
print("Starting MC topic classification...", flush=True)

OPENAI_KEY = os.environ["OPENAI_API_KEY"]
SUPABASE_URL = "https://lltcfjmshnhfmavlxpxr.supabase.co"
SERVICE_KEY = os.environ["SUPABASE_SERVICE_ROLE_KEY"]
MGMT_TOKEN = os.environ["SUPABASE_ACCESS_TOKEN"]
MGMT_API = "https://api.supabase.com/v1/projects/lltcfjmshnhfmavlxpxr/database/query"

BATCH = 20
BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
CHECKPOINT = os.path.join(BASE_DIR, "data", "mc_topics_checkpoint.json")

TOPICS = {
    "0620": [
        ("CHEM_T1", "States of matter"), ("CHEM_T2", "Atoms, electrons and compounds"),
        ("CHEM_T3", "Stoichiometry"), ("CHEM_T4", "Electrochemistry"),
        ("CHEM_T5", "Chemical energetics"), ("CHEM_T6", "Chemical reactions"),
        ("CHEM_T7", "Acids, bases and salts"), ("CHEM_T8", "The periodic table"),
        ("CHEM_T9", "Metals"), ("CHEM_T10", "Chemistry of the environment"),
        ("CHEM_T11", "Organic chemistry"), ("CHEM_T12", "Experimental techniques"),
    ],
    "0625": [
        ("PHYS_T1", "Motion, forces, and energy"), ("PHYS_T2", "Thermal physics"),
        ("PHYS_T3", "Waves"), ("PHYS_T4", "Electricity and magnetism"),
        ("PHYS_T5", "Nuclear physics"), ("PHYS_T6", "Space physics"),
    ],
    "0610": [
        ("BIO_T1", "Classification of organisms"), ("BIO_T2", "Organisation of the organism"),
        ("BIO_T3", "Movement into and out of cells"), ("BIO_T4", "Biological molecules"),
        ("BIO_T5", "Enzymes"), ("BIO_T6", "Plant nutrition"), ("BIO_T7", "Human nutrition"),
        ("BIO_T8", "Transport in plants"), ("BIO_T9", "Transport in humans"),
        ("BIO_T10", "Diseases and immunity"), ("BIO_T11", "Gas exchange in humans"),
        ("BIO_T12", "Respiration"), ("BIO_T13", "Excretion in humans"),
        ("BIO_T14", "Coordination and response"), ("BIO_T15", "Drugs"),
        ("BIO_T16", "Reproduction"), ("BIO_T17", "Inheritance"),
        ("BIO_T18", "Variation and selection"), ("BIO_T19", "Organisms and environment"),
        ("BIO_T20", "Human influence on ecosystems"), ("BIO_T21", "Biotechnology"),
    ],
}


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


def main():
    # Load checkpoint
    checkpoint = {}
    if os.path.exists(CHECKPOINT):
        with open(CHECKPOINT, encoding="utf-8") as f:
            checkpoint = json.load(f)
    print(f"Checkpoint: {len(checkpoint)} already classified", flush=True)

    # Fetch topic UUID map
    print("Fetching topic UUIDs...", flush=True)
    topic_uuids = {}
    r = requests.get(f"{SUPABASE_URL}/rest/v1/syllabus_topics?select=id,topic_code", headers={
        "apikey": SERVICE_KEY, "Authorization": f"Bearer {SERVICE_KEY}",
    }, timeout=15)
    for row in r.json():
        topic_uuids[row["topic_code"]] = row["id"]
    print(f"  {len(topic_uuids)} topics mapped", flush=True)

    # Fetch MC questions without topic, with real text
    print("Fetching unclassified MC questions...", flush=True)
    mc_questions = []
    offset = 0
    while True:
        r = requests.get(
            f"{SUPABASE_URL}/rest/v1/exam_questions?question_type=eq.multiple_choice&syllabus_topic_id=is.null&select=id,subject_code,question_text,question_number&order=id&offset={offset}&limit=1000",
            headers={"apikey": SERVICE_KEY, "Authorization": f"Bearer {SERVICE_KEY}"},
            timeout=15,
        )
        batch = r.json()
        mc_questions.extend(batch)
        if len(batch) < 1000:
            break
        offset += len(batch)

    # Filter out already done and placeholder text
    remaining = [q for q in mc_questions if q["id"] not in checkpoint and not q["question_text"].startswith("MC Question")]
    print(f"  {len(mc_questions)} total unclassified, {len(remaining)} remaining\n", flush=True)

    # Process by subject
    by_subject = {}
    for q in remaining:
        sc = q["subject_code"]
        if sc not in by_subject:
            by_subject[sc] = []
        by_subject[sc].append(q)

    for subject_code, questions in sorted(by_subject.items()):
        topics = TOPICS.get(subject_code)
        if not topics:
            print(f"  Skip {subject_code}: no topic list", flush=True)
            continue

        topic_list = "\n".join(f"- {code}: {name}" for code, name in topics)
        total_batches = (len(questions) + BATCH - 1) // BATCH
        print(f"\n{subject_code}: {len(questions)} questions, {total_batches} batches", flush=True)

        for i in range(0, len(questions), BATCH):
            batch = questions[i:i + BATCH]
            batch_num = i // BATCH + 1

            user_msg = json.dumps([
                {"id": q["id"], "text": q["question_text"][:200]}
                for q in batch
            ], ensure_ascii=False)

            print(f"  Batch {batch_num}/{total_batches}...", end="", flush=True)

            try:
                resp = requests.post("https://api.openai.com/v1/chat/completions", json={
                    "model": "gpt-4o-mini",
                    "max_tokens": 2048,
                    "response_format": {"type": "json_object"},
                    "messages": [
                        {"role": "system", "content": f"Classify each IGCSE {subject_code} question into one topic.\n\nTopics:\n{topic_list}\n\nReturn JSON: {{\"results\": [{{\"id\": \"Q_ID\", \"topic_code\": \"CODE\"}}]}}"},
                        {"role": "user", "content": user_msg},
                    ],
                }, headers={"Authorization": f"Bearer {OPENAI_KEY}"}, timeout=45)

                results = json.loads(resp.json()["choices"][0]["message"]["content"])
                items = results.get("results", [])

                count = 0
                for item in items:
                    if isinstance(item, dict) and "id" in item and "topic_code" in item:
                        checkpoint[item["id"]] = item["topic_code"]
                        count += 1

                print(f" {count} classified", flush=True)

            except Exception as e:
                print(f" ERROR: {e}", flush=True)

            if batch_num % 10 == 0:
                with open(CHECKPOINT, "w", encoding="utf-8") as f:
                    json.dump(checkpoint, f)

            time.sleep(0.3)

    # Save final checkpoint
    with open(CHECKPOINT, "w", encoding="utf-8") as f:
        json.dump(checkpoint, f)

    # Apply to DB
    print(f"\nApplying {len(checkpoint)} classifications to DB...", flush=True)
    applied = 0
    for qid, topic_code in checkpoint.items():
        uuid = topic_uuids.get(topic_code)
        if not uuid:
            continue
        safe_id = qid.replace("'", "''")
        run_sql(f"UPDATE exam_questions SET syllabus_topic_id = '{uuid}' WHERE id = '{safe_id}'")
        applied += 1
        if applied % 500 == 0:
            print(f"  {applied} applied...", flush=True)
        time.sleep(0.1)

    print(f"  {applied} total applied", flush=True)

    # Verify
    time.sleep(2)
    r = run_sql("SELECT count(*)::int AS c FROM exam_questions WHERE question_type = 'multiple_choice' AND syllabus_topic_id IS NOT NULL")
    print(f"MC with topic: {r[0]['c'] if r else '?'}", flush=True)


if __name__ == "__main__":
    main()
