"""
Generate flashcard questions per atomic fact using OpenAI gpt-4o-mini.
Uses requests library (not urllib) for reliable HTTP on Windows.

Usage:
    py -u scripts/generate-flashcard-questions.py --phase=generate   # Generate only, don't touch DB
    py -u scripts/generate-flashcard-questions.py --phase=swap       # DELETE all + INSERT from checkpoint
    py -u scripts/generate-flashcard-questions.py --phase=full       # Both (default)
    py -u scripts/generate-flashcard-questions.py --dry-run          # Count API calls, no execution
"""

import json
import os
import sys
import time
import requests

OPENAI_KEY = os.environ["OPENAI_API_KEY"]
SUPABASE_URL = "https://lltcfjmshnhfmavlxpxr.supabase.co"
SERVICE_KEY = os.environ["SUPABASE_SERVICE_ROLE_KEY"]
REST_HEADERS = {
    "apikey": SERVICE_KEY,
    "Authorization": f"Bearer {SERVICE_KEY}",
    "Content-Type": "application/json",
}

BATCH_SIZE = 20
DRY_RUN = "--dry-run" in sys.argv

# Parse --phase flag
PHASE = "full"
for arg in sys.argv:
    if arg.startswith("--phase="):
        PHASE = arg.split("=", 1)[1]
if PHASE not in ("generate", "swap", "full"):
    print(f"ERROR: --phase must be 'generate', 'swap', or 'full' (got '{PHASE}')", flush=True)
    sys.exit(1)

BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
CHECKPOINT_FILE = os.path.join(BASE_DIR, "data", "flashcard_questions_checkpoint.json")
LANG_MAP = {"0520": "French", "0504": "Portuguese"}

SYSTEM_PROMPT = """For each fact, generate 3-5 flashcard questions that test understanding of THIS SPECIFIC FACT.

CRITICAL RULES:
- Every question MUST be answerable using ONLY the fact text provided — nothing else
- Do NOT invent formulas, comparisons, or examples that are not in the fact
- Do NOT ask about topics adjacent to the fact — stay ON the fact
- If the fact has no formula, do NOT ask "what is the formula for..."
- If the fact has no comparison, do NOT ask "what is the difference between..."
- Quality over quantity: 3 aligned questions > 5 forced ones

Valid question angles (use only those that fit the fact):
- Definition/identification: "What is X?", "Define X", "Name X"
- Causation: "Why does X happen?", "What causes X?"
- Mechanism: "How does X work?", "How is X formed?"
- Application: "How is X used?", "Give an example of X"
- Classification: "What type of X is this?"
- Only if applicable: Formula ("What is the formula for X?") OR Comparison ("Difference between X and Y?")

Rules:
- Max 20 words per question
- For French facts (subject 0520): ALL questions in French
- For Portuguese facts (subject 0504): ALL questions in Portuguese
- Return JSON: {"results": [{"id": "ID", "questions": ["q1","q2","q3"]}]}"""


def rest_get(path):
    """GET from PostgREST. Returns list or dict."""
    for attempt in range(3):
        try:
            r = requests.get(f"{SUPABASE_URL}/rest/v1/{path}", headers=REST_HEADERS, timeout=30)
            r.raise_for_status()
            return r.json()
        except Exception:
            if attempt < 2:
                time.sleep(3)
                continue
            raise


def fetch_all_facts():
    """Fetch all atomic_facts via REST (paginated if needed)."""
    all_facts = []
    offset = 0
    page_size = 1000
    while True:
        headers = dict(REST_HEADERS)
        headers["Range"] = f"{offset}-{offset + page_size - 1}"
        r = requests.get(
            f"{SUPABASE_URL}/rest/v1/atomic_facts?select=id,fact_text,subject_code&order=subject_code,id",
            headers=headers, timeout=30
        )
        r.raise_for_status()
        batch = r.json()
        if not batch:
            break
        all_facts.extend(batch)
        if len(batch) < page_size:
            break
        offset += page_size
    return all_facts


def fc_count():
    """Return count of flashcard_questions via REST HEAD with count=exact."""
    headers = dict(REST_HEADERS)
    headers["Prefer"] = "count=exact"
    headers["Range"] = "0-0"
    r = requests.get(f"{SUPABASE_URL}/rest/v1/flashcard_questions?select=id", headers=headers, timeout=30)
    r.raise_for_status()
    # Content-Range: 0-0/9770
    cr = r.headers.get("content-range", "")
    if "/" in cr:
        return int(cr.split("/")[1])
    return len(r.json())


def fc_delete_all():
    """DELETE all rows from flashcard_questions via REST."""
    # PostgREST requires a filter; use "id=not.is.null" to match all rows
    r = requests.delete(
        f"{SUPABASE_URL}/rest/v1/flashcard_questions?id=not.is.null",
        headers=REST_HEADERS, timeout=120
    )
    r.raise_for_status()
    return True


def fc_get_by_fact(fact_id):
    """Get flashcard_questions for a specific fact."""
    r = requests.get(
        f"{SUPABASE_URL}/rest/v1/flashcard_questions?fact_id=eq.{fact_id}&select=question&order=question",
        headers=REST_HEADERS, timeout=30
    )
    r.raise_for_status()
    return r.json()


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


def phase_generate():
    """Fetch facts, call OpenAI, save results to checkpoint file. DB untouched."""
    print("=" * 60, flush=True)
    print("PHASE A: Generate flashcard questions -> checkpoint file", flush=True)
    print("=" * 60, flush=True)

    checkpoint = load_checkpoint()
    print(f"Checkpoint: {len(checkpoint)} facts already done", flush=True)

    print("Fetching facts...", flush=True)
    facts = fetch_all_facts()
    print(f"  {len(facts)} facts total", flush=True)

    remaining = [f for f in facts if f["id"] not in checkpoint]
    print(f"  {len(remaining)} remaining\n", flush=True)

    if DRY_RUN:
        print(f"[DRY RUN] Would make {(len(remaining) + BATCH_SIZE - 1) // BATCH_SIZE} API calls", flush=True)
        return

    if len(remaining) == 0:
        print("Nothing to generate -- checkpoint already complete.", flush=True)
        return

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

        elapsed = time.time() - start
        rate = batch_num / elapsed if elapsed > 0 else 0
        left = (total_batches - batch_num) / rate if rate > 0 else 0
        print(f"  Batch {batch_num}/{total_batches} -- {len(checkpoint)} facts done -- ~{left:.0f}s left", flush=True)

        if len(checkpoint) % 200 < BATCH_SIZE:
            save_checkpoint(checkpoint)

        time.sleep(0.3)

    save_checkpoint(checkpoint)
    total_qs = sum(len(qs) for qs in checkpoint.values())
    print(f"\nGeneration done: {len(checkpoint)} facts, {total_qs} questions", flush=True)
    print(f"Checkpoint saved to: {CHECKPOINT_FILE}", flush=True)


def phase_swap():
    """Atomic swap: DELETE all existing flashcard_questions + INSERT from checkpoint."""
    print("=" * 60, flush=True)
    print("PHASE B: Atomic swap -- DELETE old + INSERT new", flush=True)
    print("=" * 60, flush=True)

    checkpoint = load_checkpoint()
    if not checkpoint:
        print("ERROR: No checkpoint file found. Run --phase=generate first.", flush=True)
        sys.exit(1)

    total_qs = sum(len(qs) for qs in checkpoint.values())
    print(f"Checkpoint: {len(checkpoint)} facts, {total_qs} questions ready", flush=True)

    # Fetch facts for language mapping
    print("Fetching facts for language mapping...", flush=True)
    facts = fetch_all_facts()
    subject_by_fact = {f["id"]: f["subject_code"] for f in facts}

    # Build rows
    rows = []
    for fid, questions in checkpoint.items():
        subject = subject_by_fact.get(fid)
        lang = "fr" if subject == "0520" else "pt" if subject == "0504" else "en"
        for q in questions:
            rows.append({"fact_id": fid, "question": q, "language": lang})

    print(f"  {len(rows)} rows to insert", flush=True)

    if DRY_RUN:
        print(f"[DRY RUN] Would DELETE all flashcard_questions and INSERT {len(rows)} new rows", flush=True)
        return

    # Pre-count
    pre_count = fc_count()
    print(f"  Pre-swap count: {pre_count}", flush=True)

    # DELETE all (short transition window starts here)
    print("\nDeleting old flashcard_questions...", flush=True)
    fc_delete_all()
    print("  Old rows deleted.", flush=True)

    # INSERT in batches
    print("\nInserting new rows...", flush=True)
    INSERT_BATCH = 200
    inserted = 0
    for i in range(0, len(rows), INSERT_BATCH):
        batch = rows[i:i + INSERT_BATCH]
        ok = rest_post("flashcard_questions", batch)
        if not ok:
            print(f"  ERROR: Insert batch failed at row {i}. Re-run with --phase=swap to retry.", flush=True)
            sys.exit(1)
        inserted += len(batch)
        if inserted % 1000 == 0 or inserted == len(rows):
            print(f"  {inserted}/{len(rows)} inserted", flush=True)
        time.sleep(0.1)

    # Post-validate
    print("\nValidating swap...", flush=True)
    time.sleep(2)
    post_count = fc_count()
    print(f"  Post-swap count: {post_count} (was {pre_count})", flush=True)

    # Spot-check NPK fact
    npk = fc_get_by_fact("CHEM_T10_2_F02")
    print(f"\n  NPK fact (CHEM_T10_2_F02) -- {len(npk)} questions:", flush=True)
    for row in npk:
        marker = "[BAD]" if "formula for calculating" in row["question"].lower() else "[OK] "
        print(f"  {marker} {row['question']}", flush=True)

    print(f"\nSWAP DONE!", flush=True)


def main():
    if PHASE == "generate":
        phase_generate()
    elif PHASE == "swap":
        phase_swap()
    else:  # full
        phase_generate()
        if not DRY_RUN:
            phase_swap()


if __name__ == "__main__":
    main()
