"""
Wave 1 preflight: chunk approved V1 questions by syllabus_topic_id and insert
pending rows into linkage_proposals so subsequent waves can resume cleanly.

Idempotent: re-running skips question_ids that already have a non-rejected
proposal row.
"""
import json
import sys
import urllib.request
from pathlib import Path
from collections import defaultdict

ROOT = Path(__file__).resolve().parent.parent.parent
sys.stdout.reconfigure(encoding="utf-8")

SUPABASE_URL = "https://lltcfjmshnhfmavlxpxr.supabase.co"
SERVICE_KEY = ACCESS_TOKEN = None
for line in (ROOT / "web" / ".env.local").read_text().splitlines():
    if line.startswith("SUPABASE_SERVICE_ROLE_KEY="):
        SERVICE_KEY = line.split("=", 1)[1].strip()
    elif line.startswith("SUPABASE_ACCESS_TOKEN="):
        ACCESS_TOKEN = line.split("=", 1)[1].strip()

if not SERVICE_KEY or not ACCESS_TOKEN:
    sys.exit("FATAL: SUPABASE_SERVICE_ROLE_KEY / SUPABASE_ACCESS_TOKEN not found in web/.env.local")

REST_HEADERS = {
    "apikey": SERVICE_KEY,
    "Authorization": f"Bearer {SERVICE_KEY}",
    "Content-Type": "application/json",
    "Prefer": "return=minimal",
}
MGMT_URL = "https://api.supabase.com/v1/projects/lltcfjmshnhfmavlxpxr/database/query"
MGMT_HEADERS = {
    "Authorization": f"Bearer {ACCESS_TOKEN}",
    "Content-Type": "application/json",
    "User-Agent": "supabase-cli/2.84.4",
}

CHUNK_MAX = 50  # questions per Sonnet chunk; spec budget assumes this


def run_sql(sql: str) -> list:
    data = json.dumps({"query": sql}).encode()
    req = urllib.request.Request(MGMT_URL, data=data, method="POST", headers=MGMT_HEADERS)
    with urllib.request.urlopen(req, timeout=120) as resp:
        return json.loads(resp.read().decode())


def fetch_questions() -> list[dict]:
    """All approved V1 questions in commercial subjects."""
    sql = """
        SELECT id::text, subject_code, syllabus_topic_id::text, marks,
               response_type, prompt_text, parent_context,
               mark_scheme, command_word
        FROM assessment_items
        WHERE status='approved'
          AND subject_code IN ('0610','0620','0625','0478','0500');
    """
    return run_sql(sql)


def fetch_facts() -> list[dict]:
    sql = """
        SELECT id, syllabus_topic_id::text, fact_text, topic_id, subject_code
        FROM atomic_facts
        WHERE is_active=true
          AND subject_code IN ('0610','0620','0625','0478','0500');
    """
    return run_sql(sql)


def fetch_topic_codes() -> dict[str, str]:
    """syllabus_topic_id (uuid) -> topic_code (e.g. 'CHEM_T11')."""
    rows = run_sql("SELECT id::text, topic_code FROM syllabus_topics;")
    return {r["id"]: r["topic_code"] for r in rows}


def fetch_already_proposed() -> set[str]:
    """Question ids that already have a non-rejected proposal row."""
    rows = run_sql(
        "SELECT DISTINCT question_id::text "
        "FROM linkage_proposals WHERE status <> 'rejected';"
    )
    return {r["question_id"] for r in rows}


def chunk_topic(topic_code: str, questions: list[dict]) -> list[tuple[str, list[dict]]]:
    """Split a topic's questions into <=CHUNK_MAX chunks, named topic_code_chunk_NN."""
    out = []
    for i in range(0, len(questions), CHUNK_MAX):
        chunk_id = f"{topic_code}_chunk_{(i // CHUNK_MAX) + 1:02d}"
        out.append((chunk_id, questions[i : i + CHUNK_MAX]))
    return out


def insert_pending(rows: list[dict]) -> None:
    """Bulk insert via REST API (chunked to avoid huge payloads)."""
    BATCH = 500
    for i in range(0, len(rows), BATCH):
        batch = rows[i : i + BATCH]
        data = json.dumps(batch).encode()
        req = urllib.request.Request(
            f"{SUPABASE_URL}/rest/v1/linkage_proposals",
            data=data,
            method="POST",
            headers=REST_HEADERS,
        )
        with urllib.request.urlopen(req, timeout=120) as resp:
            if resp.status >= 300:
                raise RuntimeError(f"Insert failed: {resp.status} {resp.read()!r}")
        print(f"  inserted batch {i // BATCH + 1} ({len(batch)} rows)", file=sys.stderr)


def main() -> None:
    print("Fetching questions, facts, topic codes ...", file=sys.stderr)
    questions = fetch_questions()
    facts = fetch_facts()
    topic_code_by_id = fetch_topic_codes()
    skip = fetch_already_proposed()
    print(f"  {len(questions)} approved questions, {len(facts)} active facts, {len(skip)} already proposed", file=sys.stderr)

    by_topic: dict[str, list[dict]] = defaultdict(list)
    for q in questions:
        if q["id"] in skip:
            continue
        by_topic[q["syllabus_topic_id"]].append(q)

    facts_by_topic: dict[str, list[dict]] = defaultdict(list)
    for f in facts:
        facts_by_topic[f["syllabus_topic_id"]].append(f)

    chunks_summary = []
    rows_to_insert: list[dict] = []

    for topic_id, qs in by_topic.items():
        topic_code = topic_code_by_id.get(topic_id, f"UNKNOWN_{topic_id[:8]}")
        for chunk_id, chunk_qs in chunk_topic(topic_code, qs):
            for q in chunk_qs:
                rows_to_insert.append({
                    "question_id": q["id"],
                    "chunk_id": chunk_id,
                    "matcher_model": "claude-sonnet-4-6",  # set at dispatch, used as default
                    "status": "pending",
                })
            chunks_summary.append({
                "chunk_id": chunk_id,
                "topic_code": topic_code,
                "topic_id": topic_id,
                "question_count": len(chunk_qs),
                "candidate_fact_count": len(facts_by_topic.get(topic_id, [])),
            })

    if not rows_to_insert:
        print("Nothing to insert — all approved questions already have proposals.", file=sys.stderr)
    else:
        print(f"Inserting {len(rows_to_insert)} pending rows across {len(chunks_summary)} chunks ...", file=sys.stderr)
        insert_pending(rows_to_insert)

    audit_path = ROOT / "data" / "audit" / "linkage_chunks.json"
    audit_path.parent.mkdir(parents=True, exist_ok=True)
    audit_path.write_text(json.dumps({
        "chunks": chunks_summary,
        "total_questions": sum(c["question_count"] for c in chunks_summary),
        "total_chunks": len(chunks_summary),
    }, indent=2))
    print(f"Wrote chunk summary to {audit_path}", file=sys.stderr)


if __name__ == "__main__":
    main()
