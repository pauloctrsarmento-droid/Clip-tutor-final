"""
Driver helper for Wave 2 (Sonnet matcher) and Wave 3 (Opus reviewer).

Subcommands:
  render-sonnet <chunk_id>     -> writes prompt to data/audit/pending_chunks/<chunk_id>.sonnet.prompt.md
                                  prints absolute path on stdout.
  persist-sonnet <chunk_id> <response_path>
                              -> reads JSON response, validates, updates linkage_proposals.
                                 prints summary on stdout.
  mark-sonnet-failed <chunk_id> <raw_path> <reason>
                              -> marks every pending row in chunk as sonnet_failed.

  render-opus <chunk_id>       -> writes Opus reviewer prompt to data/audit/pending_chunks/<chunk_id>.opus.prompt.md
  persist-opus <chunk_id> <response_path>
                              -> updates linkage_proposals with reviewed payload.
  mark-opus-failed <chunk_id> <raw_path> <reason>

  list-pending-sonnet          -> prints chunk_ids whose proposals are still status='pending'.
  list-pending-opus            -> prints chunk_ids whose proposals are status='sonnet_done'.
  status                       -> print status counts.

Idempotent: render-* always overwrites; persist-* uses WHERE clauses so re-running
on already-advanced rows is a no-op.
"""
from __future__ import annotations

import json
import sys
import urllib.error
import urllib.parse
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent.parent
sys.stdout.reconfigure(encoding="utf-8")
sys.stderr.reconfigure(encoding="utf-8")

SUPABASE_URL = "https://lltcfjmshnhfmavlxpxr.supabase.co"
PROJECT_REF = "lltcfjmshnhfmavlxpxr"
SERVICE_KEY = ACCESS_TOKEN = None
for line in (ROOT / "web" / ".env.local").read_text().splitlines():
    if line.startswith("SUPABASE_SERVICE_ROLE_KEY="):
        SERVICE_KEY = line.split("=", 1)[1].strip()
    elif line.startswith("SUPABASE_ACCESS_TOKEN="):
        ACCESS_TOKEN = line.split("=", 1)[1].strip()
if not SERVICE_KEY or not ACCESS_TOKEN:
    raise SystemExit("Missing SUPABASE_SERVICE_ROLE_KEY or SUPABASE_ACCESS_TOKEN in web/.env.local")

REST_HEADERS = {
    "apikey": SERVICE_KEY,
    "Authorization": f"Bearer {SERVICE_KEY}",
    "Content-Type": "application/json",
}
MGMT_URL = f"https://api.supabase.com/v1/projects/{PROJECT_REF}/database/query"
MGMT_HEADERS = {
    "Authorization": f"Bearer {ACCESS_TOKEN}",
    "Content-Type": "application/json",
    "User-Agent": "supabase-cli/2.84.4",
}

PENDING_DIR = ROOT / "data" / "audit" / "pending_chunks"
PENDING_DIR.mkdir(parents=True, exist_ok=True)

SONNET_TEMPLATE = (ROOT / "scripts" / "linkage" / "sonnet_prompt.md").read_text(encoding="utf-8")
OPUS_TEMPLATE = (ROOT / "scripts" / "linkage" / "opus_prompt.md").read_text(encoding="utf-8")

SUBJECT_NAMES = {
    "0610": "Biology",
    "0620": "Chemistry",
    "0625": "Physics",
    "0478": "Computer Science",
    "0500": "English Language",
}


def run_sql(sql: str) -> list:
    req = urllib.request.Request(
        MGMT_URL,
        data=json.dumps({"query": sql}).encode(),
        method="POST",
        headers=MGMT_HEADERS,
    )
    with urllib.request.urlopen(req, timeout=180) as resp:
        return json.loads(resp.read().decode())


def sql_quote(s: str) -> str:
    return s.replace("'", "''")


def fetch_chunk_questions(chunk_id: str) -> list[dict]:
    sql = f"""
        SELECT ai.id::text, ai.subject_code, ai.syllabus_topic_id::text,
               ai.marks, ai.response_type, ai.prompt_text,
               ai.parent_context, ai.mark_scheme, ai.command_word,
               st.topic_code, st.topic_name
        FROM assessment_items ai
        JOIN linkage_proposals lp ON lp.question_id = ai.id
        LEFT JOIN syllabus_topics st ON st.id = ai.syllabus_topic_id
        WHERE lp.chunk_id = '{sql_quote(chunk_id)}'
        ORDER BY ai.id;
    """
    return run_sql(sql)


def fetch_candidate_facts(syllabus_topic_id: str, subject_code: str) -> list[dict]:
    sql = f"""
        SELECT id, fact_text
        FROM atomic_facts
        WHERE is_active = true
          AND syllabus_topic_id = '{sql_quote(syllabus_topic_id)}'::uuid
          AND subject_code = '{sql_quote(subject_code)}'
        ORDER BY id;
    """
    return run_sql(sql)


# ── Sonnet rendering ───────────────────────────────────────────────────────────

def render_sonnet_prompt(chunk_id: str) -> Path:
    questions = fetch_chunk_questions(chunk_id)
    if not questions:
        raise SystemExit(f"No questions for chunk {chunk_id}")
    q0 = questions[0]
    subject_name = SUBJECT_NAMES.get(q0["subject_code"], q0["subject_code"])
    topic_code = q0["topic_code"] or "UNKNOWN"
    topic_name = q0["topic_name"] or "Unknown"

    facts = fetch_candidate_facts(q0["syllabus_topic_id"], q0["subject_code"])

    facts_block = "\n".join(f"- {f['id']}: {f['fact_text']}" for f in facts) or "(no candidate facts; propose new facts as needed)"

    q_blocks = []
    for i, q in enumerate(questions, 1):
        lines = [
            f"[Q{i}] id={q['id']}  marks={q['marks']}  type={q['response_type']}",
            f"prompt: {q['prompt_text']}",
        ]
        if q.get("parent_context"):
            lines.append(f"context: {q['parent_context']}")
        if q.get("mark_scheme"):
            lines.append(f"mark scheme: {q['mark_scheme']}")
        lines.append("---")
        q_blocks.append("\n".join(lines))

    prompt = SONNET_TEMPLATE
    # Hand-roll handlebars-style substitution; we don't need a real engine.
    prompt = prompt.replace("{{subject_name}}", subject_name)
    prompt = prompt.replace("{{topic_code}}", topic_code)
    prompt = prompt.replace("{{topic_name}}", topic_name)
    prompt = prompt.replace("{{n_facts}}", str(len(facts)))
    prompt = prompt.replace("{{n_questions}}", str(len(questions)))
    # Replace each-block bodies; the template uses {{#each candidate_facts}}...{{/each}}.
    prompt = _replace_each(prompt, "candidate_facts", facts_block)
    prompt = _replace_each(prompt, "questions", "\n".join(q_blocks))

    out = PENDING_DIR / f"{chunk_id}.sonnet.prompt.md"
    out.write_text(prompt, encoding="utf-8")
    print(str(out))
    print(f"  questions={len(questions)}  candidate_facts={len(facts)}  topic={topic_code}", file=sys.stderr)
    return out


def _replace_each(template: str, key: str, body: str) -> str:
    """Replace `{{#each KEY}}...{{/each}}` (whatever inner content) with `body`."""
    open_tag = "{{#each " + key + "}}"
    close_tag = "{{/each}}"
    start = template.find(open_tag)
    if start == -1:
        return template
    end = template.find(close_tag, start)
    if end == -1:
        return template
    return template[:start] + body + template[end + len(close_tag):]


# ── Sonnet persistence ─────────────────────────────────────────────────────────

def parse_sonnet_response(text: str) -> dict:
    """Tolerate code fences, leading/trailing prose; require a JSON object with `results` key."""
    s = text.strip()
    # strip code fence
    if s.startswith("```"):
        s = s.split("\n", 1)[1] if "\n" in s else s
        if s.endswith("```"):
            s = s[:-3]
        # also drop a leading `json\n`
        if s.lower().startswith("json\n"):
            s = s[5:]
    # fall back: find first `{` and matching last `}`
    if not s.lstrip().startswith("{"):
        i = s.find("{")
        j = s.rfind("}")
        if i == -1 or j == -1:
            raise ValueError("no JSON object found")
        s = s[i:j + 1]
    obj = json.loads(s)
    if not isinstance(obj, dict) or "results" not in obj:
        raise ValueError("missing top-level 'results' key")
    if not isinstance(obj["results"], list):
        raise ValueError("'results' is not a list")
    return obj


def persist_sonnet(chunk_id: str, response_path: str) -> None:
    raw = Path(response_path).read_text(encoding="utf-8")
    parsed = parse_sonnet_response(raw)

    # Build update statements per question
    expected_qs = {q["id"] for q in fetch_chunk_questions(chunk_id)}
    seen_qs = set()
    updates = []
    for r in parsed["results"]:
        qid = r.get("question_id")
        if not qid or qid not in expected_qs:
            print(f"  skipping unknown question_id={qid}", file=sys.stderr)
            continue
        if qid in seen_qs:
            print(f"  duplicate question_id={qid}", file=sys.stderr)
            continue
        seen_qs.add(qid)
        proposed = json.dumps(r.get("proposed_facts") or [])
        new_proposed = json.dumps(r.get("new_facts_proposed") or [])
        updates.append((qid, proposed, new_proposed))

    if not updates:
        print(f"  no valid results found in response for {chunk_id}", file=sys.stderr)
        return

    raw_for_sql = sql_quote(raw)
    # Build a single multi-statement update with $$-quoted JSONB literals.
    parts = []
    for qid, proposed, new_proposed in updates:
        proposed_sql = proposed.replace("$linkage$", "$_linkage_$")
        new_sql = new_proposed.replace("$linkage$", "$_linkage_$")
        parts.append(f"""
            UPDATE linkage_proposals
            SET status='sonnet_done',
                proposed_facts=$linkage${proposed_sql}$linkage$::jsonb,
                new_facts_proposed=$linkage${new_sql}$linkage$::jsonb,
                sonnet_raw_response='{raw_for_sql}',
                matcher_model='claude-sonnet-4-6'
            WHERE chunk_id='{sql_quote(chunk_id)}'
              AND question_id='{qid}'::uuid
              AND status='pending';
        """)
    full_sql = "\n".join(parts)
    run_sql(full_sql)
    missing = expected_qs - seen_qs
    print(f"  persisted={len(seen_qs)}  missing={len(missing)}  chunk={chunk_id}")
    if missing:
        print(f"  WARN: missing question_ids: {sorted(missing)[:5]}{'...' if len(missing)>5 else ''}", file=sys.stderr)


def mark_sonnet_failed(chunk_id: str, raw_path: str, reason: str) -> None:
    raw = Path(raw_path).read_text(encoding="utf-8") if raw_path and Path(raw_path).exists() else ""
    sql = f"""
        UPDATE linkage_proposals
        SET status='sonnet_failed',
            sonnet_raw_response='{sql_quote(raw)}',
            error_message='{sql_quote(reason)}',
            retry_count=2
        WHERE chunk_id='{sql_quote(chunk_id)}' AND status='pending';
    """
    run_sql(sql)
    print(f"  marked sonnet_failed: {chunk_id} reason={reason}")


# ── Opus rendering ─────────────────────────────────────────────────────────────

def render_opus_prompt(chunk_id: str) -> Path:
    """Render Opus reviewer prompt covering every sonnet_done question in the chunk.

    The opus_prompt.md template is question-scoped; we wrap it for chunk-scoped
    dispatch: a header and one question-block per question.
    """
    sql = f"""
        SELECT lp.question_id::text, lp.proposed_facts, lp.new_facts_proposed,
               ai.subject_code, ai.syllabus_topic_id::text, ai.marks,
               ai.prompt_text, ai.parent_context, ai.mark_scheme,
               st.topic_code, st.topic_name
        FROM linkage_proposals lp
        JOIN assessment_items ai ON ai.id = lp.question_id
        LEFT JOIN syllabus_topics st ON st.id = ai.syllabus_topic_id
        WHERE lp.chunk_id = '{sql_quote(chunk_id)}'
          AND lp.status = 'sonnet_done'
        ORDER BY lp.question_id;
    """
    rows = run_sql(sql)
    if not rows:
        raise SystemExit(f"No sonnet_done rows for chunk {chunk_id}")
    r0 = rows[0]
    subject_name = SUBJECT_NAMES.get(r0["subject_code"], r0["subject_code"])
    topic_code = r0["topic_code"] or "UNKNOWN"
    topic_name = r0["topic_name"] or "Unknown"

    facts = fetch_candidate_facts(r0["syllabus_topic_id"], r0["subject_code"])
    facts_listing = "\n".join(f"- {f['id']}: {f['fact_text']}" for f in facts) or "(no candidate facts)"

    header = (
        f"You are reviewing question-fact link proposals for "
        f"{subject_name} topic {topic_code} ({topic_name}).\n\n"
        f"CANDIDATE FACTS for this topic:\n{facts_listing}\n\n"
        f"For EACH question below, apply the rubric in the per-question template "
        f"and return ONE JSON object wrapping all results in a top-level `results` array, "
        f"in the same order as the input questions. Each entry uses the exact schema "
        f"described, plus a `question_id` field. Output strictly the JSON object — no prose.\n\n"
        f"Schema for each entry:\n"
        f'{{ "question_id": "...", "approved_facts": [...], "new_facts_approved": [...], '
        f'"rejection_notes": "...", "agreement_signal": "high|medium|low" }}\n\n'
        f"Bar: a fact is approved only if knowing it is NECESSARY to answer correctly. "
        f"Topical relatedness is not enough.\n\n"
        f"------\n\n"
    )

    blocks = []
    for i, r in enumerate(rows, 1):
        proposed = r.get("proposed_facts") or []
        new_proposed = r.get("new_facts_proposed") or []
        block = [
            f"[Q{i}] id={r['question_id']}  marks={r['marks']}",
            f"prompt: {r['prompt_text']}",
        ]
        if r.get("parent_context"):
            block.append(f"context: {r['parent_context']}")
        if r.get("mark_scheme"):
            block.append(f"mark scheme: {r['mark_scheme']}")
        block.append(f"sonnet.proposed_facts: {json.dumps(proposed)}")
        block.append(f"sonnet.new_facts_proposed: {json.dumps(new_proposed)}")
        block.append("---")
        blocks.append("\n".join(block))

    prompt = header + "\n".join(blocks) + "\n\nReturn the JSON object now."
    out = PENDING_DIR / f"{chunk_id}.opus.prompt.md"
    out.write_text(prompt, encoding="utf-8")
    print(str(out))
    print(f"  questions={len(rows)}  candidate_facts={len(facts)}  topic={topic_code}", file=sys.stderr)
    return out


def persist_opus(chunk_id: str, response_path: str) -> None:
    raw = Path(response_path).read_text(encoding="utf-8")
    parsed = parse_sonnet_response(raw)  # same JSON-with-results envelope

    expected = {r["question_id"] for r in run_sql(f"""
        SELECT question_id::text FROM linkage_proposals
        WHERE chunk_id='{sql_quote(chunk_id)}' AND status='sonnet_done';
    """)}
    seen = set()
    parts = []
    raw_sql = sql_quote(raw)
    for r in parsed["results"]:
        qid = r.get("question_id")
        if not qid or qid not in expected:
            print(f"  skipping unknown question_id={qid}", file=sys.stderr)
            continue
        if qid in seen:
            print(f"  duplicate question_id={qid}", file=sys.stderr)
            continue
        seen.add(qid)
        approved = json.dumps(r.get("approved_facts") or [])
        new_approved = json.dumps(r.get("new_facts_approved") or [])
        signal = r.get("agreement_signal") or "medium"
        if signal not in ("high", "medium", "low"):
            signal = "medium"
        approved_sql = approved.replace("$linkage$", "$_linkage_$")
        new_sql = new_approved.replace("$linkage$", "$_linkage_$")
        parts.append(f"""
            UPDATE linkage_proposals
            SET status='reviewed',
                approved_facts=$linkage${approved_sql}$linkage$::jsonb,
                new_facts_approved=$linkage${new_sql}$linkage$::jsonb,
                agreement_signal='{signal}',
                opus_raw_response='{raw_sql}',
                reviewer_model='claude-opus-4-7',
                reviewed_at=now()
            WHERE chunk_id='{sql_quote(chunk_id)}'
              AND question_id='{qid}'::uuid
              AND status='sonnet_done';
        """)
    if not parts:
        print(f"  no valid results found in response for {chunk_id}", file=sys.stderr)
        return
    run_sql("\n".join(parts))
    missing = expected - seen
    print(f"  reviewed={len(seen)}  missing={len(missing)}  chunk={chunk_id}")
    if missing:
        print(f"  WARN: missing question_ids: {sorted(missing)[:5]}{'...' if len(missing)>5 else ''}", file=sys.stderr)


def mark_opus_failed(chunk_id: str, raw_path: str, reason: str) -> None:
    raw = Path(raw_path).read_text(encoding="utf-8") if raw_path and Path(raw_path).exists() else ""
    sql = f"""
        UPDATE linkage_proposals
        SET status='opus_failed',
            opus_raw_response='{sql_quote(raw)}',
            error_message='{sql_quote(reason)}'
        WHERE chunk_id='{sql_quote(chunk_id)}' AND status='sonnet_done';
    """
    run_sql(sql)
    print(f"  marked opus_failed: {chunk_id} reason={reason}")


# ── Listing ────────────────────────────────────────────────────────────────────

def list_pending_sonnet() -> None:
    rows = run_sql(
        "SELECT chunk_id, count(*)::int AS n FROM linkage_proposals "
        "WHERE status='pending' GROUP BY chunk_id ORDER BY chunk_id;"
    )
    for r in rows:
        print(f"{r['chunk_id']}\t{r['n']}")


def list_pending_opus() -> None:
    rows = run_sql(
        "SELECT chunk_id, count(*)::int AS n FROM linkage_proposals "
        "WHERE status='sonnet_done' GROUP BY chunk_id ORDER BY chunk_id;"
    )
    for r in rows:
        print(f"{r['chunk_id']}\t{r['n']}")


def status() -> None:
    rows = run_sql(
        "SELECT status, count(*)::int AS n FROM linkage_proposals GROUP BY status ORDER BY status;"
    )
    for r in rows:
        print(f"{r['status']}\t{r['n']}")


def main() -> None:
    if len(sys.argv) < 2:
        print(__doc__)
        sys.exit(2)
    cmd = sys.argv[1]
    args = sys.argv[2:]
    if cmd == "render-sonnet":
        render_sonnet_prompt(args[0])
    elif cmd == "persist-sonnet":
        persist_sonnet(args[0], args[1])
    elif cmd == "mark-sonnet-failed":
        mark_sonnet_failed(args[0], args[1] if len(args) > 1 else "", args[2] if len(args) > 2 else "unknown")
    elif cmd == "render-opus":
        render_opus_prompt(args[0])
    elif cmd == "persist-opus":
        persist_opus(args[0], args[1])
    elif cmd == "mark-opus-failed":
        mark_opus_failed(args[0], args[1] if len(args) > 1 else "", args[2] if len(args) > 2 else "unknown")
    elif cmd == "list-pending-sonnet":
        list_pending_sonnet()
    elif cmd == "list-pending-opus":
        list_pending_opus()
    elif cmd == "status":
        status()
    else:
        print(f"unknown command: {cmd}")
        sys.exit(2)


if __name__ == "__main__":
    main()
