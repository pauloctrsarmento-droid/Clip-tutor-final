"""
Wave 4: apply approved linkage proposals to assessment_items + atomic_facts.

Reads:   linkage_proposals WHERE status='reviewed'
Writes:  assessment_items.related_facts, assessment_items.linkage_audit,
         atomic_facts (new rows from new_facts_approved, deduped per run),
         linkage_proposals.status='applied', applied_at.

Idempotent on re-run: the unique partial index on linkage_proposals
(question_id WHERE status='applied') prevents double-application.
"""
import json
import sys
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent.parent
sys.stdout.reconfigure(encoding="utf-8")

SUPABASE_URL = "https://lltcfjmshnhfmavlxpxr.supabase.co"
SERVICE_KEY = ACCESS_TOKEN = None
for line in (ROOT / "web" / ".env.local").read_text().splitlines():
    if line.startswith("SUPABASE_SERVICE_ROLE_KEY="):
        SERVICE_KEY = line.split("=", 1)[1].strip()
    elif line.startswith("SUPABASE_ACCESS_TOKEN="):
        ACCESS_TOKEN = line.split("=", 1)[1].strip()

# Fix A — credential guard
if not SERVICE_KEY or not ACCESS_TOKEN:
    sys.exit("FATAL: SUPABASE_SERVICE_ROLE_KEY / SUPABASE_ACCESS_TOKEN not found in web/.env.local")

REST_HEADERS = {
    "apikey": SERVICE_KEY,
    "Authorization": f"Bearer {SERVICE_KEY}",
    "Content-Type": "application/json",
    "Prefer": "return=minimal",
}
MGMT_HEADERS = {
    "Authorization": f"Bearer {ACCESS_TOKEN}",
    "Content-Type": "application/json",
    "User-Agent": "supabase-cli/2.84.4",
}
MGMT_URL = "https://api.supabase.com/v1/projects/lltcfjmshnhfmavlxpxr/database/query"


def run_sql(sql: str) -> list:
    import time as _t
    data = json.dumps({"query": sql}).encode()
    delay = 1.0
    for attempt in range(6):
        try:
            req = urllib.request.Request(MGMT_URL, data=data, method="POST", headers=MGMT_HEADERS)
            with urllib.request.urlopen(req, timeout=180) as resp:
                return json.loads(resp.read().decode())
        except urllib.error.HTTPError as e:
            if e.code in (429, 503, 502, 504) and attempt < 5:
                _t.sleep(delay)
                delay *= 2
                continue
            raise


def fetch_reviewed() -> list[dict]:
    return run_sql("""
        SELECT lp.id::text AS proposal_id,
               lp.question_id::text,
               lp.approved_facts,
               lp.new_facts_approved,
               lp.matcher_model,
               lp.reviewer_model,
               lp.agreement_signal,
               ai.subject_code,
               ai.syllabus_topic_id::text,
               st.topic_code,
               st.topic_name
        FROM linkage_proposals lp
        JOIN assessment_items ai ON ai.id = lp.question_id
        LEFT JOIN syllabus_topics st ON st.id = ai.syllabus_topic_id
        WHERE lp.status='reviewed';
    """)


def existing_fact_ids() -> set[str]:
    rows = run_sql("SELECT id FROM atomic_facts WHERE is_active=true;")
    return {r["id"] for r in rows}


def insert_new_facts(facts: list[dict]) -> None:
    """REST insert into atomic_facts. Each fact dict already has id, fact_text, ..."""
    if not facts:
        return
    BATCH = 200
    for i in range(0, len(facts), BATCH):
        batch = facts[i : i + BATCH]
        data = json.dumps(batch).encode()
        req = urllib.request.Request(
            f"{SUPABASE_URL}/rest/v1/atomic_facts",
            data=data,
            method="POST",
            headers=REST_HEADERS,
        )
        with urllib.request.urlopen(req, timeout=120) as resp:
            # Fix B — accept HTTP 204 from `Prefer: return=minimal`
            if resp.status >= 300:
                raise RuntimeError(f"atomic_facts insert failed: {resp.status} {resp.read()!r}")


def main() -> None:
    print("Reading reviewed proposals ...", file=sys.stderr)
    proposals = fetch_reviewed()
    print(f"  {len(proposals)} ready to apply", file=sys.stderr)
    if not proposals:
        return

    fact_ids = existing_fact_ids()

    # ── Stage 1: dedupe + insert new atomic_facts ──
    new_facts_to_create: dict[str, dict] = {}  # id -> row
    duplicate_count = 0
    for p in proposals:
        for nf in (p.get("new_facts_approved") or []):
            proposed_id = nf["proposed_id"]
            # Dedupe: if Sonnet/Opus suggested the same id twice across proposals, keep first.
            if proposed_id in fact_ids:
                duplicate_count += 1
                continue
            if proposed_id in new_facts_to_create:
                duplicate_count += 1
                continue
            new_facts_to_create[proposed_id] = {
                "id": proposed_id,
                "subject_code": p["subject_code"],
                "syllabus_topic_id": p["syllabus_topic_id"],
                "topic_id": p.get("topic_code") or p["syllabus_topic_id"],
                "topic_name": p.get("topic_name") or "Generated",
                "fact_text": nf["fact_text"],
                "flashcard_front": nf.get("flashcard_front"),
                "core_or_extended": "core",
                "difficulty": 3,
                "is_active": True,
            }

    if duplicate_count:
        print(f"  skipped {duplicate_count} duplicate proposed_ids (already exist or proposed earlier in run)", file=sys.stderr)

    if new_facts_to_create:
        print(f"  inserting {len(new_facts_to_create)} new atomic_facts ...", file=sys.stderr)
        insert_new_facts(list(new_facts_to_create.values()))
        fact_ids.update(new_facts_to_create.keys())

    # ── Stage 2: apply per-question — batched UPDATEs ──
    print(f"  applying {len(proposals)} proposals ...", file=sys.stderr)
    applied = failed = 0
    BATCH_PER_CALL = 50
    batch_sql: list[str] = []
    for p in proposals:
        approved = []
        for a in (p.get("approved_facts") or []):
            if isinstance(a, dict):
                fid = a.get("fact_id") or a.get("id") or a.get("proposed_id")
                if fid:
                    approved.append(fid)
            elif isinstance(a, str):
                approved.append(a)
        new_ids = []
        for nf in (p.get("new_facts_approved") or []):
            if isinstance(nf, dict):
                pid = nf.get("proposed_id") or nf.get("fact_id")
                if pid:
                    new_ids.append(pid)
            elif isinstance(nf, str):
                new_ids.append(nf)
        all_ids = approved + new_ids

        # Defensive: every id must be in fact_ids by now.
        unknown = [i for i in all_ids if i not in fact_ids]
        if unknown or not all_ids:
            print(f"    SKIP {p['question_id']} — unknown_or_empty: {unknown or '[]'}", file=sys.stderr)
            failed += 1
            continue

        # Dollar-quoting: impossible to escape from regardless of content.
        # question_id/proposal_id are UUID text ([0-9a-f-]) — single-quote interp is safe for these.
        rf = json.dumps(all_ids)
        audit = json.dumps({
            "matcher_model": p["matcher_model"],
            "reviewer_model": p["reviewer_model"],
            "agreement_signal": p["agreement_signal"],
            "applied_at": "now",
        })

        batch_sql.append(f"""UPDATE assessment_items
            SET related_facts = $rf${rf}$rf$::jsonb,
                linkage_audit = $audit${audit}$audit$::jsonb
            WHERE id = '{p["question_id"]}';
            UPDATE linkage_proposals
            SET status='applied', applied_at=now()
            WHERE id = '{p["proposal_id"]}';""")
        applied += 1
        if len(batch_sql) >= BATCH_PER_CALL:
            run_sql("\n".join(batch_sql))
            batch_sql = []
            if applied % 500 == 0:
                print(f"    applied {applied} so far ...", file=sys.stderr)

    if batch_sql:
        run_sql("\n".join(batch_sql))

    print(f"Applied {applied}, skipped {failed}", file=sys.stderr)


if __name__ == "__main__":
    main()
