# Question ↔ Atomic Fact Linkage — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Backfill `assessment_items.related_facts` for all 6 004 approved V1 questions using a Sonnet 4.6 matcher + Opus 4.7 reviewer pipeline, then lock the schema and ship the V1 quiz cutover so quiz answers update fact mastery and feed the flashcard SR algorithm.

**Architecture:** Multi-wave pipeline. Sonnet sub-agents (Wave 2) propose fact links; Opus sub-agents (Wave 3) review. Both persist to `linkage_proposals`. Wave 4 applies approved links to `assessment_items` and creates new approved `atomic_facts`. Wave 5 verifies and locks the schema (NOT NULL + CHECK + two triggers). Wave 6 ships the cutover. Orchestrator (Opus 4.7 in this Claude Code session) coordinates everything via the `Agent` tool — zero external API cost on the user's Anthropic Max plan.

**Tech Stack:** Postgres (Supabase Management API for DDL via curl, REST API + service_role for data), Python 3 (urllib, no third-party deps), TypeScript strict (Next.js 16 App Router), Tailwind, Playwright MCP for E2E. Sub-agents via Claude Code's `Agent` tool with `model: "sonnet"` / `"opus"`.

**Spec:** `docs/superpowers/specs/2026-05-06-question-fact-linkage-design.md` (v3 — two rounds of Opus forensic review)

**Verification strategy:** Project has no vitest setup (verified — none in `web/package.json`, no config). Per project rule "never add dependencies without asking", do **not** add a test framework. Verification per task:
1. `pnpm --dir web tsc --noEmit` after every TypeScript edit (Gate D)
2. SQL queries via Management API for data invariants (Gates A, K)
3. Negative SQL inserts after constraints applied (Gate B)
4. Orchestrator manual sample reading (Gate C)
5. Playwright MCP E2E on production URL after deploy (Gate E)

**Commit cadence:** One commit per static-artifact task in Phase 1. Phase 2 has no commits (data-only writes to Supabase). Phase 3 batches all cutover edits into one feat commit before push.

---

## File Structure

### New files (committed in Phase 1)
- `scripts/migrate-related-facts-add.sql` — Migration 1: add columns + audit table
- `scripts/migrate-related-facts-lock.sql` — Migration 2: NOT NULL + CHECK + triggers
- `scripts/linkage/__init__.py` — empty package marker
- `scripts/linkage/sonnet_prompt.md` — Sonnet 4.6 matcher prompt template
- `scripts/linkage/opus_prompt.md` — Opus 4.7 reviewer prompt template
- `scripts/linkage/preflight.py` — Wave 1: chunk topics, insert pending rows
- `scripts/linkage/apply_proposals.py` — Wave 4: write approved links to assessment_items, create new atomic_facts
- `scripts/linkage/gates.py` — Wave 5: Gate A, Gate K, Gate B SQL queries

### Modified files (committed in Phase 3)
- `web/src/lib/services/orchestrators/quiz.ts` — add `related_facts` to SELECT, remove `null` hack in evaluateAnswer
- `web/src/lib/constants.ts` — remove `"0500"` from `QUIZ_DISABLED_SUBJECTS`
- `scripts/insert-batch-v2.py` — add `validate_related_facts` enforcement

### Frontend files already in working tree (folded into Phase 3 cutover commit)
- `web/src/components/quiz/quiz-question.tsx`
- `web/src/app/study/quiz/session/page.tsx`
- `web/src/components/quiz/diagram-renderer.tsx` (untracked)
- `web/src/components/quiz/diagrams/*.tsx` (untracked, 6 files)

### Generated audit files (Phase 2 runtime, not committed)
- `data/audit/linkage_chunks.json` — preflight output (for inspection)
- `data/audit/linkage_report.json` — final report (committed at end of Phase 3)

---

# Phase 1: Static artifacts

## Task 1: Wave 0 — WIP commit of working tree

**Files:**
- No new files. Stage existing modified + untracked working-tree files.

- [ ] **Step 1: Verify the expected files are dirty**

Run:
```bash
git status --short web/ | grep -E "(quiz-question|diagram-renderer|diagrams|orchestrators/quiz|study/quiz/session/page)"
```

Expected output (or matching subset):
```
 M web/src/app/study/quiz/session/page.tsx
 M web/src/components/quiz/quiz-question.tsx
 M web/src/lib/services/orchestrators/quiz.ts
?? web/src/components/quiz/diagram-renderer.tsx
?? web/src/components/quiz/diagrams/
```

If quiz.ts is no longer modified (because someone reverted it), STOP. The cutover code must be in the working tree before this WIP commit. Manually re-apply or restore from a previous commit before continuing.

- [ ] **Step 2: Stage exactly those files**

```bash
git add web/src/lib/services/orchestrators/quiz.ts \
        web/src/components/quiz/quiz-question.tsx \
        web/src/app/study/quiz/session/page.tsx \
        web/src/components/quiz/diagram-renderer.tsx \
        web/src/components/quiz/diagrams/
```

- [ ] **Step 3: Verify staged set**

```bash
git diff --cached --stat
```

Expected: 4 modified + 7 new files (1 dispatcher + 6 diagram components). No unrelated files staged.

- [ ] **Step 4: Commit (LOCAL ONLY — do NOT push)**

```bash
git commit -m "wip(quiz): V1 cutover staging for fact-linkage pipeline"
```

The commit is preserved across orchestrator crashes. At Wave 6a Step 6 we will fold it into a final feat commit.

- [ ] **Step 5: Confirm not pushed**

```bash
git log origin/master..HEAD --oneline
```

Expected: one line — the WIP commit. If multiple lines appear, something is unexpected — investigate before proceeding.

---

## Task 2: Migration 1 — add `related_facts`, `linkage_audit` columns + `linkage_proposals` table

**Files:**
- Create: `scripts/migrate-related-facts-add.sql`

- [ ] **Step 1: Write the SQL file**

```sql
-- Migration 1: nullable columns + audit table.
-- Run BEFORE the backfill pipeline.
-- Pair with scripts/migrate-related-facts-lock.sql which applies AFTER Wave 5 Gate A passes.

ALTER TABLE assessment_items
  ADD COLUMN IF NOT EXISTS related_facts JSONB,
  ADD COLUMN IF NOT EXISTS linkage_audit JSONB;

COMMENT ON COLUMN assessment_items.related_facts IS
  'JSONB array of atomic_fact ids that this question tests. Required for fact mastery updates after the lock migration.';
COMMENT ON COLUMN assessment_items.linkage_audit IS
  '{ matcher_model, reviewer_model, rationales, applied_at } — pipeline provenance.';

CREATE TABLE IF NOT EXISTS linkage_proposals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  question_id UUID NOT NULL REFERENCES assessment_items(id) ON DELETE RESTRICT,
  chunk_id TEXT NOT NULL,
  matcher_model TEXT NOT NULL,
  reviewer_model TEXT,
  proposed_facts JSONB,
  approved_facts JSONB,
  new_facts_proposed JSONB,
  new_facts_approved JSONB,
  sonnet_raw_response TEXT,
  opus_raw_response TEXT,
  error_message TEXT,
  retry_count INTEGER NOT NULL DEFAULT 0,
  agreement_signal TEXT CHECK (agreement_signal IN ('high', 'medium', 'low')),
  status TEXT NOT NULL CHECK (status IN (
    'pending', 'sonnet_done', 'sonnet_failed',
    'reviewed', 'opus_failed', 'needs_human_review',
    'applied', 'rejected'
  )),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  reviewed_at TIMESTAMPTZ,
  applied_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_linkage_proposals_status ON linkage_proposals(status);
CREATE INDEX IF NOT EXISTS idx_linkage_proposals_question_id ON linkage_proposals(question_id);
CREATE INDEX IF NOT EXISTS idx_linkage_proposals_chunk_id ON linkage_proposals(chunk_id);

CREATE UNIQUE INDEX IF NOT EXISTS uniq_linkage_proposals_applied_per_question
  ON linkage_proposals(question_id)
  WHERE status = 'applied';
```

- [ ] **Step 2: Apply the migration**

Read `web/.env.local` for `SUPABASE_ACCESS_TOKEN`. Send the SQL to the Management API:

```bash
curl -sS -X POST "https://api.supabase.com/v1/projects/lltcfjmshnhfmavlxpxr/database/query" \
  -H "Authorization: Bearer $SUPABASE_ACCESS_TOKEN" \
  -H "Content-Type: application/json" \
  -d "$(jq -Rs '{query: .}' < scripts/migrate-related-facts-add.sql)"
```

Expected response: `[]` (empty array — DDL produces no rows).

- [ ] **Step 3: Verify columns + table exist**

```sql
SELECT column_name FROM information_schema.columns
WHERE table_name='assessment_items' AND column_name IN ('related_facts','linkage_audit')
ORDER BY column_name;

SELECT column_name FROM information_schema.columns
WHERE table_name='linkage_proposals' ORDER BY ordinal_position;
```

Expected: 2 rows for first query; 17 rows for second (matching the schema above).

- [ ] **Step 4: Commit**

```bash
git add scripts/migrate-related-facts-add.sql
git commit -m "feat(db): migration 1 for fact linkage — add columns and audit table"
```

---

## Task 3: Sonnet matcher prompt template

**Files:**
- Create: `scripts/linkage/sonnet_prompt.md`
- Create: `scripts/linkage/__init__.py` (empty file, makes the dir a package)

- [ ] **Step 1: Create empty package marker**

```bash
mkdir -p scripts/linkage
touch scripts/linkage/__init__.py
```

- [ ] **Step 2: Write the prompt template**

Copy the canonical version from spec §"Sonnet 4.6 matcher" verbatim into `scripts/linkage/sonnet_prompt.md`. The orchestrator will read this file and substitute `{{...}}` placeholders at dispatch time.

The exact contents are in the spec at `docs/superpowers/specs/2026-05-06-question-fact-linkage-design.md` lines 339–381. Copy it line-for-line. Do not paraphrase. Do not "improve" it — the spec went through two reviews; deviations break R4.

- [ ] **Step 3: Verify the file is valid markdown and contains required placeholders**

Run:
```bash
grep -E "\{\{(subject_name|topic_code|topic_name|n_facts|n_questions|candidate_facts|questions)\}\}" scripts/linkage/sonnet_prompt.md | wc -l
```

Expected: at least 6 (one per placeholder family). If fewer, the copy was incomplete.

- [ ] **Step 4: Commit**

```bash
git add scripts/linkage/__init__.py scripts/linkage/sonnet_prompt.md
git commit -m "feat(linkage): Sonnet matcher prompt template"
```

---

## Task 4: Opus reviewer prompt template

**Files:**
- Create: `scripts/linkage/opus_prompt.md`

- [ ] **Step 1: Write the prompt template**

Copy the canonical version from spec §"Opus 4.7 reviewer" verbatim into `scripts/linkage/opus_prompt.md`. The exact contents are in the spec at `docs/superpowers/specs/2026-05-06-question-fact-linkage-design.md` lines 385–423.

Same rule as Task 3: copy line-for-line. The Opus prompt requires fields `approved_facts`, `new_facts_approved`, `rejection_notes`, `agreement_signal` — verify these appear in your output.

- [ ] **Step 2: Verify required output fields are mentioned**

```bash
grep -E "(approved_facts|new_facts_approved|rejection_notes|agreement_signal)" scripts/linkage/opus_prompt.md | wc -l
```

Expected: at least 4. (One mention each, more is fine.)

- [ ] **Step 3: Commit**

```bash
git add scripts/linkage/opus_prompt.md
git commit -m "feat(linkage): Opus reviewer prompt template"
```

---

## Task 5: Preflight script

**Files:**
- Create: `scripts/linkage/preflight.py`

The preflight script reads `assessment_items` (status='approved') and `atomic_facts` (is_active), groups by `syllabus_topic_id`, chunks topics with >50 questions into multiple chunks, and INSERTs one `linkage_proposals` row per question with status='pending' and the assigned `chunk_id`. It also writes a JSON snapshot to `data/audit/linkage_chunks.json` for inspection.

- [ ] **Step 1: Write the script**

```python
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
            if resp.status not in (200, 201):
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
```

- [ ] **Step 2: Verify the script imports cleanly**

```bash
python -c "import ast; ast.parse(open('scripts/linkage/preflight.py').read()); print('OK')"
```

Expected: `OK`. (No execution yet — that's Task 9.)

- [ ] **Step 3: Commit**

```bash
git add scripts/linkage/preflight.py
git commit -m "feat(linkage): preflight script — chunk by topic, insert pending rows"
```

---

## Task 6: Apply-proposals script (Wave 4)

**Files:**
- Create: `scripts/linkage/apply_proposals.py`

The apply script reads `linkage_proposals` rows where `status='reviewed'`, writes `approved_facts` to `assessment_items.related_facts`, INSERTs new approved atomic_facts (deduplicated within the run), then sets `status='applied'`. Idempotent — re-runs do nothing for already-applied rows.

- [ ] **Step 1: Write the script**

```python
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
    data = json.dumps({"query": sql}).encode()
    req = urllib.request.Request(MGMT_URL, data=data, method="POST", headers=MGMT_HEADERS)
    with urllib.request.urlopen(req, timeout=180) as resp:
        return json.loads(resp.read().decode())


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
               ai.syllabus_topic_id::text
        FROM linkage_proposals lp
        JOIN assessment_items ai ON ai.id = lp.question_id
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
            if resp.status not in (200, 201):
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
    for p in proposals:
        for nf in (p.get("new_facts_approved") or []):
            proposed_id = nf["proposed_id"]
            # Dedupe: if Sonnet/Opus suggested the same id twice across proposals, keep first.
            if proposed_id in fact_ids or proposed_id in new_facts_to_create:
                continue
            new_facts_to_create[proposed_id] = {
                "id": proposed_id,
                "subject_code": p["subject_code"],
                "syllabus_topic_id": p["syllabus_topic_id"],
                "topic_id": proposed_id.rsplit("_F", 1)[0] if "_F" in proposed_id else None,
                "fact_text": nf["fact_text"],
                "flashcard_front": nf.get("flashcard_front"),
                "core_or_extended": "core",
                "difficulty": 3,
                "is_active": True,
            }

    if new_facts_to_create:
        print(f"  inserting {len(new_facts_to_create)} new atomic_facts ...", file=sys.stderr)
        insert_new_facts(list(new_facts_to_create.values()))
        fact_ids.update(new_facts_to_create.keys())

    # ── Stage 2: apply per-question — one transactional UPDATE per row ──
    print(f"  applying {len(proposals)} proposals ...", file=sys.stderr)
    applied = failed = 0
    for p in proposals:
        approved = [a["fact_id"] for a in (p.get("approved_facts") or [])]
        new_ids = [nf["proposed_id"] for nf in (p.get("new_facts_approved") or [])]
        all_ids = approved + new_ids

        # Defensive: every id must be in fact_ids by now.
        unknown = [i for i in all_ids if i not in fact_ids]
        if unknown or not all_ids:
            print(f"    SKIP {p['question_id']} — unknown_or_empty: {unknown or '[]'}", file=sys.stderr)
            failed += 1
            continue

        # SQL-quote-safe JSON via Python json.dumps, escaped for SQL string literal.
        rf = json.dumps(all_ids).replace("'", "''")
        audit = json.dumps({
            "matcher_model": p["matcher_model"],
            "reviewer_model": p["reviewer_model"],
            "agreement_signal": p["agreement_signal"],
            "applied_at": "now",
        }).replace("'", "''")

        sql = f"""
            UPDATE assessment_items
            SET related_facts = '{rf}'::jsonb,
                linkage_audit = '{audit}'::jsonb
            WHERE id = '{p["question_id"]}';

            UPDATE linkage_proposals
            SET status='applied', applied_at=now()
            WHERE id = '{p["proposal_id"]}';
        """
        run_sql(sql)
        applied += 1

    print(f"Applied {applied}, skipped {failed}", file=sys.stderr)


if __name__ == "__main__":
    main()
```

- [ ] **Step 2: Syntax-check**

```bash
python -c "import ast; ast.parse(open('scripts/linkage/apply_proposals.py').read()); print('OK')"
```

Expected: `OK`.

- [ ] **Step 3: Commit**

```bash
git add scripts/linkage/apply_proposals.py
git commit -m "feat(linkage): apply approved proposals to assessment_items + atomic_facts"
```

---

## Task 7: Gates SQL helpers

**Files:**
- Create: `scripts/linkage/gates.py`

Centralizes the SQL queries used by Wave 5 gates so the orchestrator can run them by importing functions instead of stringifying SQL inline.

- [ ] **Step 1: Write the gates module**

```python
"""
Wave 5 verification gates as importable functions.
Each function returns a tuple (passed: bool, detail: str).
"""
import json
import sys
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent.parent
sys.stdout.reconfigure(encoding="utf-8")

ACCESS_TOKEN = None
for line in (ROOT / "web" / ".env.local").read_text().splitlines():
    if line.startswith("SUPABASE_ACCESS_TOKEN="):
        ACCESS_TOKEN = line.split("=", 1)[1].strip()

MGMT_URL = "https://api.supabase.com/v1/projects/lltcfjmshnhfmavlxpxr/database/query"
MGMT_HEADERS = {
    "Authorization": f"Bearer {ACCESS_TOKEN}",
    "Content-Type": "application/json",
    "User-Agent": "supabase-cli/2.84.4",
}


def run_sql(sql: str) -> list:
    data = json.dumps({"query": sql}).encode()
    req = urllib.request.Request(MGMT_URL, data=data, method="POST", headers=MGMT_HEADERS)
    with urllib.request.urlopen(req, timeout=120) as resp:
        return json.loads(resp.read().decode())


def gate_a_data_clean() -> tuple[bool, str]:
    """No approved question may have null or empty related_facts; every fact_id must exist active."""
    unlinked = run_sql("""
        SELECT count(*)::int AS n
        FROM assessment_items
        WHERE status='approved'
          AND (related_facts IS NULL OR jsonb_array_length(related_facts) = 0);
    """)[0]["n"]
    if unlinked > 0:
        return False, f"Gate A: {unlinked} approved questions still unlinked"

    missing = run_sql("""
        WITH refs AS (
          SELECT DISTINCT jsonb_array_elements_text(related_facts) AS fact_id
          FROM assessment_items
          WHERE status='approved' AND related_facts IS NOT NULL
        )
        SELECT count(*)::int AS n
        FROM refs r
        LEFT JOIN atomic_facts af ON af.id = r.fact_id AND af.is_active
        WHERE af.id IS NULL;
    """)[0]["n"]
    if missing > 0:
        return False, f"Gate A: {missing} fact_ids reference unknown or inactive atomic_facts"

    return True, "Gate A passed: 0 unlinked, 0 dangling refs"


def gate_k_kill_switch() -> tuple[bool, str]:
    """Halt if too many chunks have empty approvals OR low agreement is widespread."""
    flagged = run_sql("""
        WITH per_chunk AS (
          SELECT chunk_id,
                 count(*) AS questions,
                 count(*) FILTER (
                   WHERE jsonb_array_length(coalesce(approved_facts, '[]'::jsonb)) = 0
                     AND jsonb_array_length(coalesce(new_facts_approved, '[]'::jsonb)) = 0
                 ) AS empty_approvals
          FROM linkage_proposals
          WHERE status IN ('reviewed','applied')
          GROUP BY chunk_id
        )
        SELECT chunk_id, questions, empty_approvals
        FROM per_chunk
        WHERE questions >= 5
          AND empty_approvals::float / questions > 0.5;
    """)
    if flagged:
        return False, f"Gate K: {len(flagged)} chunks have >50% empty approvals: {[r['chunk_id'] for r in flagged]}"

    rate = run_sql("""
        SELECT (count(*) FILTER (WHERE agreement_signal='low'))::float
               / NULLIF(count(*), 0) AS low_rate
        FROM linkage_proposals
        WHERE status IN ('reviewed','applied') AND agreement_signal IS NOT NULL;
    """)[0]["low_rate"]
    if rate is not None and rate > 0.05:
        return False, f"Gate K: low_agreement rate {rate:.1%} exceeds 5% threshold"

    return True, "Gate K passed: no flagged chunks, low_rate within threshold"


def gate_b_constraints_active() -> tuple[bool, str]:
    """Negative tests against the live constraints. Must run AFTER Migration 2 applied."""
    tests = []

    # Test 1: insert without related_facts must fail
    sql1 = """
        INSERT INTO assessment_items (subject_code, prompt_text, marks, status, response_type)
        VALUES ('0620', '__gate_b_test_1__', 1, 'draft', 'text');
    """
    try:
        run_sql(sql1)
        run_sql("DELETE FROM assessment_items WHERE prompt_text='__gate_b_test_1__';")
        return False, "Gate B test 1: insert without related_facts SHOULD have failed but succeeded"
    except urllib.error.HTTPError as e:
        body = e.read().decode()
        if "null value" not in body.lower() and "not-null" not in body.lower():
            return False, f"Gate B test 1: failed for wrong reason: {body[:200]}"
        tests.append("test 1 passed (NOT NULL)")

    # Test 2: bogus fact_id must fail
    sql2 = """
        INSERT INTO assessment_items (subject_code, prompt_text, marks, status, response_type, related_facts)
        VALUES ('0620', '__gate_b_test_2__', 1, 'draft', 'text', '["__FAKE_FACT_ID__"]'::jsonb);
    """
    try:
        run_sql(sql2)
        run_sql("DELETE FROM assessment_items WHERE prompt_text='__gate_b_test_2__';")
        return False, "Gate B test 2: insert with bogus fact_id SHOULD have failed"
    except urllib.error.HTTPError as e:
        body = e.read().decode()
        if "__FAKE_FACT_ID__" not in body:
            return False, f"Gate B test 2: failed for wrong reason: {body[:200]}"
        tests.append("test 2 passed (existence trigger)")

    # Test 3: deactivating a referenced fact must fail
    referenced = run_sql("""
        SELECT jsonb_array_elements_text(related_facts) AS fact_id
        FROM assessment_items
        WHERE status='approved' AND related_facts IS NOT NULL
        LIMIT 1;
    """)
    if not referenced:
        return False, "Gate B test 3: no referenced facts found to test deactivation against"
    target = referenced[0]["fact_id"]
    try:
        run_sql(f"UPDATE atomic_facts SET is_active=false WHERE id='{target}';")
        # Rollback if it somehow succeeded (it shouldn't)
        run_sql(f"UPDATE atomic_facts SET is_active=true WHERE id='{target}';")
        return False, f"Gate B test 3: deactivating referenced fact {target} SHOULD have failed"
    except urllib.error.HTTPError as e:
        body = e.read().decode()
        if "still referenced" not in body.lower():
            return False, f"Gate B test 3: failed for wrong reason: {body[:200]}"
        tests.append("test 3 passed (atomic_facts protection)")

    return True, "Gate B passed: " + ", ".join(tests)


if __name__ == "__main__":
    cmd = sys.argv[1] if len(sys.argv) > 1 else "all"
    if cmd in ("a", "all"):
        ok, msg = gate_a_data_clean(); print(f"[{'PASS' if ok else 'FAIL'}] {msg}")
    if cmd in ("k", "all"):
        ok, msg = gate_k_kill_switch(); print(f"[{'PASS' if ok else 'FAIL'}] {msg}")
    if cmd in ("b", "all"):
        ok, msg = gate_b_constraints_active(); print(f"[{'PASS' if ok else 'FAIL'}] {msg}")
```

- [ ] **Step 2: Syntax-check**

```bash
python -c "import ast; ast.parse(open('scripts/linkage/gates.py').read()); print('OK')"
```

- [ ] **Step 3: Commit**

```bash
git add scripts/linkage/gates.py
git commit -m "feat(linkage): Wave 5 gates (A data clean, K kill-switch, B constraints active)"
```

---

## Task 8: Migration 2 SQL file (lock — applied later)

**Files:**
- Create: `scripts/migrate-related-facts-lock.sql`

This file is **only created** in this task — application happens in Task 14 (Wave 5 Step 3), strictly after Gate A and Gate K pass.

- [ ] **Step 1: Write the SQL**

```sql
-- Migration 2: lock related_facts schema. NON-REVERTIBLE BY DESIGN.
-- Apply ONLY after Wave 5 Gate A passes (zero unlinked questions) and Gate K
-- passes (no systemically broken chunks).

-- ── Defense 1: every fact_id in related_facts points to an active atomic_fact ──
CREATE OR REPLACE FUNCTION check_related_facts_exist() RETURNS trigger AS $$
DECLARE
  _missing_count INTEGER;
  _missing_ids TEXT;
BEGIN
  IF TG_OP = 'UPDATE' AND OLD.related_facts IS NOT DISTINCT FROM NEW.related_facts THEN
    RETURN NEW;
  END IF;

  WITH refs AS (
    SELECT jsonb_array_elements_text(NEW.related_facts) AS _fact_id
  )
  SELECT count(*), string_agg(refs._fact_id, ', ')
    INTO _missing_count, _missing_ids
  FROM refs
  LEFT JOIN atomic_facts af
    ON af.id = refs._fact_id AND af.is_active
  WHERE af.id IS NULL;

  IF _missing_count > 0 THEN
    RAISE EXCEPTION
      'related_facts references unknown or inactive atomic_fact: %', _missing_ids;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS assessment_items_check_facts ON assessment_items;
CREATE TRIGGER assessment_items_check_facts
  BEFORE INSERT OR UPDATE OF related_facts ON assessment_items
  FOR EACH ROW EXECUTE FUNCTION check_related_facts_exist();

-- ── Defense 2: cannot soft-delete an atomic_fact still referenced by an approved item ──
CREATE OR REPLACE FUNCTION protect_referenced_atomic_facts() RETURNS trigger AS $$
DECLARE
  _ref_count INTEGER;
BEGIN
  IF TG_OP = 'UPDATE'
     AND OLD.is_active = true
     AND NEW.is_active = false
  THEN
    SELECT count(*) INTO _ref_count
    FROM assessment_items
    WHERE status = 'approved'
      AND related_facts ? OLD.id;

    IF _ref_count > 0 THEN
      RAISE EXCEPTION
        'cannot deactivate atomic_fact %: still referenced by % approved assessment_items.related_facts', OLD.id, _ref_count;
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS atomic_facts_protect_referenced ON atomic_facts;
CREATE TRIGGER atomic_facts_protect_referenced
  BEFORE UPDATE OF is_active ON atomic_facts
  FOR EACH ROW EXECUTE FUNCTION protect_referenced_atomic_facts();

-- ── Defense 3: NOT NULL + CHECK array-shape AND element-type ──
ALTER TABLE assessment_items
  ALTER COLUMN related_facts SET NOT NULL,
  ADD CONSTRAINT related_facts_non_empty CHECK (
    jsonb_typeof(related_facts) = 'array'
    AND jsonb_array_length(related_facts) >= 1
    AND NOT EXISTS (
      SELECT 1
      FROM jsonb_array_elements(related_facts) AS elem
      WHERE jsonb_typeof(elem) <> 'string'
    )
  );
```

- [ ] **Step 2: Verify SQL parses (syntax sanity)**

There's no offline parser in scope; relying on apply-time errors at Task 14 is acceptable. Just confirm the file is non-empty and contains the three sections:

```bash
grep -c "Defense" scripts/migrate-related-facts-lock.sql
```

Expected: 3.

- [ ] **Step 3: Commit**

```bash
git add scripts/migrate-related-facts-lock.sql
git commit -m "feat(db): migration 2 for fact linkage — schema lock (apply post-backfill)"
```

---

# Phase 2: Pipeline runtime (no commits — pure data writes to Supabase)

## Task 9: Wave 1 — run preflight

- [ ] **Step 1: Execute preflight**

```bash
python scripts/linkage/preflight.py
```

Expected stderr:
```
Fetching questions, facts, topic codes ...
  6004 approved questions, 1854 active facts, 0 already proposed
Inserting 6004 pending rows across ~120 chunks ...
  inserted batch 1 (500 rows)
  ...
Wrote chunk summary to data/audit/linkage_chunks.json
```

If `already proposed` is non-zero on first run, investigate — pipeline may have been started before. Use the `linkage_proposals` resume query (see spec §Resumability) to confirm safe state before continuing.

- [ ] **Step 2: Verify pending row count**

```sql
SELECT count(*)::int AS n FROM linkage_proposals WHERE status='pending';
```

Expected: 6 004 (or fewer if some questions already had proposals — re-confirm against `data/audit/linkage_chunks.json`).

- [ ] **Step 3: Verify chunk size distribution**

```sql
SELECT chunk_id, count(*) AS n
FROM linkage_proposals
WHERE status='pending'
GROUP BY chunk_id
ORDER BY n DESC LIMIT 5;
```

Expected: max chunk has ≤50 questions. If any chunk has more, the chunking logic in preflight is broken — investigate before Wave 2.

---

## Task 10: Wave 2 — Sonnet matching dispatch loop

This task is **orchestrator runtime** — the orchestrator (Opus 4.7 in this Claude Code session) dispatches Sonnet sub-agents one chunk at a time using the `Agent` tool. There is no Python script for the dispatch loop itself; the loop is the orchestrator's behavior.

- [ ] **Step 1: Read the Sonnet prompt template**

Open `scripts/linkage/sonnet_prompt.md` and verify it loads cleanly. Identify all `{{...}}` placeholders.

- [ ] **Step 2: Query pending chunks**

```sql
SELECT chunk_id, array_agg(question_id::text) AS question_ids
FROM linkage_proposals WHERE status='pending'
GROUP BY chunk_id
ORDER BY chunk_id;
```

This list is the work queue. ~120 chunks expected.

- [ ] **Step 3: For each chunk, dispatch a Sonnet sub-agent**

For chunk `<chunk_id>`:

a. Pull the chunk's questions:
```sql
SELECT id::text, marks, response_type, prompt_text, parent_context, mark_scheme, command_word
FROM assessment_items
WHERE id IN (<question_ids from Step 2>);
```

b. Pull candidate facts for the chunk's topic:
```sql
SELECT af.id, af.fact_text
FROM atomic_facts af
JOIN assessment_items ai ON ai.syllabus_topic_id = af.syllabus_topic_id
WHERE ai.id = <any question_id from this chunk>::uuid
  AND af.is_active=true;
```

c. Render the Sonnet prompt template by substituting `subject_name`, `topic_code`, `topic_name`, `n_facts`, `candidate_facts`, `n_questions`, `questions`. Topic code/name from `syllabus_topics` table.

d. Dispatch via `Agent` tool:
```
Agent({
  description: "Sonnet matcher for <chunk_id>",
  subagent_type: "general-purpose",
  model: "sonnet",
  prompt: <rendered template>
})
```

e. Parse the sub-agent's JSON response. Expected shape: `{"results": [{question_id, proposed_facts, new_facts_proposed}, ...]}`.

f. On parse failure, retry once with the system prefix `"Your previous response was not valid JSON. Return strictly the schema described, nothing else."` Increment `linkage_proposals.retry_count` to 1.

g. On second failure, mark all questions in the chunk:
```sql
UPDATE linkage_proposals
SET status='sonnet_failed',
    sonnet_raw_response='<raw response>',
    error_message='<short reason>',
    retry_count=2
WHERE chunk_id='<chunk_id>' AND status='pending';
```

h. On success, for each `result` in the response:
```sql
UPDATE linkage_proposals
SET status='sonnet_done',
    proposed_facts='<json>'::jsonb,
    new_facts_proposed='<json>'::jsonb,
    sonnet_raw_response='<raw response>',
    matcher_model='claude-sonnet-4-6'
WHERE question_id='<result.question_id>'::uuid AND chunk_id='<chunk_id>';
```

i. On 429/529 errors: exponential backoff 30s → 60s → 120s. After 3rd backoff failure, mark `sonnet_failed` with `error_message='rate_limit_exhausted'`. Pause pipeline; resume later.

- [ ] **Step 4: Run dispatches in waves of 8 in parallel**

Spec budget assumes ~8 parallel agents. Use multiple `Agent` tool calls in a single message for parallelism.

- [ ] **Step 5: Verify all chunks are processed**

```sql
SELECT status, count(*)::int AS n
FROM linkage_proposals
GROUP BY status;
```

Expected: `pending=0`, `sonnet_done` + `sonnet_failed` = 6004. If `pending` > 0, return to Step 3 for those chunks.

If `sonnet_failed` > 100 (>~1.5% of total), pause and inspect: there may be a systemic issue (prompt bug, rate limits). Surface to user before continuing.

---

## Task 11: Wave 3 — Opus review dispatch loop

Same shape as Task 10 but reviewing Sonnet's output.

- [ ] **Step 1: Read the Opus prompt template**

Open `scripts/linkage/opus_prompt.md`.

- [ ] **Step 2: Query Sonnet-done proposals**

```sql
SELECT chunk_id, array_agg(question_id::text) AS question_ids
FROM linkage_proposals WHERE status='sonnet_done'
GROUP BY chunk_id;
```

- [ ] **Step 3: For each chunk, dispatch an Opus sub-agent**

For each question in the chunk, render an Opus prompt that includes:
- The question (id, prompt_text, mark_scheme)
- The candidate facts list
- Sonnet's proposed_facts and new_facts_proposed for that question (read from linkage_proposals)

Dispatch as ONE Opus sub-agent per chunk (not per question — chunk-level batching keeps token cost down):

```
Agent({
  description: "Opus reviewer for <chunk_id>",
  subagent_type: "general-purpose",
  model: "opus",
  prompt: <rendered template, includes all chunk's questions>
})
```

- [ ] **Step 4: Parse and persist**

Expected response: same `{"results": [...]}` wrapper, where each entry has `question_id`, `approved_facts`, `new_facts_approved`, `rejection_notes`, `agreement_signal`.

For each result:
```sql
UPDATE linkage_proposals
SET status='reviewed',
    approved_facts='<json>'::jsonb,
    new_facts_approved='<json>'::jsonb,
    agreement_signal='<high|medium|low>',
    opus_raw_response='<raw>',
    reviewer_model='claude-opus-4-7',
    reviewed_at=now()
WHERE question_id='<id>'::uuid AND status='sonnet_done';
```

Same retry policy + rate-limit policy as Wave 2. New status on parse-failure: `opus_failed`.

- [ ] **Step 5: Verify all reviewed**

```sql
SELECT status, count(*)::int AS n FROM linkage_proposals GROUP BY status;
```

Expected: `sonnet_done=0`, `reviewed` + `opus_failed` + `sonnet_failed` = 6004. If `sonnet_done` > 0, return to Step 3.

---

## Task 12: Wave 4 — apply approved proposals

- [ ] **Step 1: Run the apply script**

```bash
python scripts/linkage/apply_proposals.py
```

Expected stderr:
```
Reading reviewed proposals ...
  ~5800 ready to apply
  inserting ~50 new atomic_facts ...
  applying ~5800 proposals ...
Applied 5800, skipped 0
```

(Numbers approximate — `sonnet_failed` and `opus_failed` rows are not applied.)

- [ ] **Step 2: Verify applied count matches expected**

```sql
SELECT status, count(*)::int AS n FROM linkage_proposals GROUP BY status;
```

Expected: `applied + sonnet_failed + opus_failed` = 6004. Skipped count from Step 1 must be 0 (any skipped row indicates a code path that should be investigated).

- [ ] **Step 3: Spot-check 5 random updates**

```sql
SELECT id, related_facts, jsonb_array_length(related_facts) AS n_facts
FROM assessment_items
WHERE status='approved' AND related_facts IS NOT NULL
ORDER BY random() LIMIT 5;
```

Each row must show a non-empty array of fact_ids that look like `BIO_T1_2_F03` or similar.

---

## Task 13: Wave 5 Step 1 — Gate A (data clean)

- [ ] **Step 1: Run Gate A**

```bash
python scripts/linkage/gates.py a
```

Expected: `[PASS] Gate A passed: 0 unlinked, 0 dangling refs`.

If FAIL: do NOT proceed to Step 2. Investigate:
- Unlinked → some questions never got a `reviewed` proposal. Re-run Wave 2/3 for the missing chunks.
- Dangling refs → the apply script wrote a fact_id that doesn't exist in `atomic_facts`. Bug in apply_proposals.py — fix and re-run.

---

## Task 14: Wave 5 Step 2 — Gate K (kill-switch)

- [ ] **Step 1: Run Gate K**

```bash
python scripts/linkage/gates.py k
```

Expected: `[PASS] Gate K passed: no flagged chunks, low_rate within threshold`.

If FAIL: pipeline halts. Inspect the flagged chunks manually. Common causes:
- Prompt bug — the Sonnet prompt template has a placeholder error → re-run those chunks
- Topic with no relevant facts — Sonnet correctly proposes new facts, Opus correctly approves; should not trigger Gate K. If it does, the threshold is wrong; revise per real data.
- Model regression — check for any Anthropic incident; consider backing off and retrying tomorrow.

---

## Task 15: Wave 5 Step 3 — apply Migration 2 (the lock)

- [ ] **Step 1: Apply Migration 2**

```bash
curl -sS -X POST "https://api.supabase.com/v1/projects/lltcfjmshnhfmavlxpxr/database/query" \
  -H "Authorization: Bearer $SUPABASE_ACCESS_TOKEN" \
  -H "Content-Type: application/json" \
  -d "$(jq -Rs '{query: .}' < scripts/migrate-related-facts-lock.sql)"
```

Expected response: `[]`.

If it errors with "column contains null values": some questions still lack `related_facts`. Re-run Gate A. If A passes but Migration 2 still fails, check for race condition (a draft was inserted between Gate A and Migration 2 — should not happen in this pipeline but if it does, investigate before retrying).

- [ ] **Step 2: Verify constraints are live**

```sql
SELECT conname FROM pg_constraint
WHERE conrelid='assessment_items'::regclass AND conname='related_facts_non_empty';

SELECT tgname FROM pg_trigger
WHERE tgrelid='assessment_items'::regclass AND tgname='assessment_items_check_facts';

SELECT tgname FROM pg_trigger
WHERE tgrelid='atomic_facts'::regclass AND tgname='atomic_facts_protect_referenced';
```

All three queries must return one row each.

---

## Task 16: Wave 5 Step 4 — Gate B (negative tests)

- [ ] **Step 1: Run Gate B**

```bash
python scripts/linkage/gates.py b
```

Expected: `[PASS] Gate B passed: test 1 passed (NOT NULL), test 2 passed (existence trigger), test 3 passed (atomic_facts protection)`.

If any test fails: STOP. The lock did not apply correctly. Inspect Migration 2 application result and re-apply if needed.

---

## Task 17: Wave 5 Step 5 — Gate C (orchestrator manual sample audit)

This step is performed by the orchestrator (Opus 4.7 in this session) reading and judging 20 random samples directly.

- [ ] **Step 1: Pull 20 random samples**

```sql
SELECT ai.id, ai.prompt_text, ai.parent_context, ai.mark_scheme,
       jsonb_agg(jsonb_build_object('id', af.id, 'text', af.fact_text)) AS linked_facts
FROM assessment_items ai
JOIN atomic_facts af ON af.id = ANY(SELECT jsonb_array_elements_text(ai.related_facts))
WHERE ai.status='approved'
  AND ai.id IN (
    SELECT id FROM assessment_items WHERE status='approved' ORDER BY random() LIMIT 20
  )
GROUP BY ai.id;
```

- [ ] **Step 2: Read each sample and judge**

For each sample, ask: "If a student has to answer this question correctly, is each linked fact necessary?" Mark each link as DEFENSIBLE or QUESTIONABLE.

Pass criterion: ≥18/20 questions have all-DEFENSIBLE linked facts.

- [ ] **Step 3: If <18/20, identify the pattern**

If 3+ questionable samples, identify the common failure (specific topic? specific question type? specific fact reused incorrectly?). Re-run Wave 3 for those chunks with a tightened Opus prompt. Then re-run Gates A → K → C (B already passed and stays passed).

- [ ] **Step 4: Record audit summary**

Write to `data/audit/linkage_report.json`:
```json
{
  "run_at": "2026-05-06T...",
  "total_questions": 6004,
  "applied": <n>,
  "sonnet_failed": <n>,
  "opus_failed": <n>,
  "needs_human_review": <n>,
  "new_atomic_facts_created": <n>,
  "gate_a": "passed",
  "gate_k": "passed",
  "gate_b": "passed",
  "gate_c_sample_size": 20,
  "gate_c_defensible": <n>
}
```

(File committed at the very end of Phase 3, Task 24.)

---

## Task 18: ⛔ Checkpoint — present report to user

This is a hard pause. The orchestrator does NOT proceed to Phase 3 without explicit user approval.

- [ ] **Step 1: Summarize the run for the user**

In the chat, post:
- Total V1 questions linked: ___
- New atomic_facts created: ___
- Failures: sonnet_failed=___, opus_failed=___, needs_human_review=___
- Gates A/K/B/C: all passed
- Sample of 3 random (question, fact_text) pairs for spot inspection

- [ ] **Step 2: Ask explicitly for approval**

"All gates passed. Ready to push the V1 cutover to production. Approve?"

- [ ] **Step 3: Wait for user response**

Do NOT proceed without an explicit yes. If the user requests changes, return to whichever wave is needed.

---

# Phase 3: Cutover

## Task 19: Wave 6a — edit `quiz.ts`

**Files:**
- Modify: `web/src/lib/services/orchestrators/quiz.ts`

- [ ] **Step 1: Add `related_facts` to the SELECT**

In `fetchApprovedItems`, change:
```ts
.select(
  "id, prompt_text, parent_context, marks, response_type, correct_answer, mark_scheme, mcq_options, figures, syllabus_topic_id, subject_code, difficulty, command_word"
)
```
to:
```ts
.select(
  "id, prompt_text, parent_context, marks, response_type, correct_answer, mark_scheme, mcq_options, figures, syllabus_topic_id, subject_code, difficulty, command_word, related_facts"
)
```

- [ ] **Step 2: Remove the `related_facts: null` hack in `evaluateAnswer`**

Locate this block (after the `if (!itemRes.data) throw ...` line):
```ts
const r = itemRes.data as Record<string, unknown>;
const question: Record<string, unknown> = {
  ...r,
  question_text: r.prompt_text,
  related_facts: null,
};
```

Remove the `related_facts: null,` line. The spread of `r` already brings `related_facts` from the row.

- [ ] **Step 3: Verify the change with grep**

```bash
grep -n "related_facts" web/src/lib/services/orchestrators/quiz.ts
```

Expected: 2 hits — one in the SELECT string, one in the comment in fetchApprovedItems describing figures (no `related_facts: null` anywhere). If a third hit appears as `related_facts: null`, the removal in Step 2 missed.

(No commit yet — Phase 3 batches all edits into one feat commit at Task 23.)

---

## Task 20: Wave 6a — edit `constants.ts`

**Files:**
- Modify: `web/src/lib/constants.ts`

- [ ] **Step 1: Remove `"0500"` from `QUIZ_DISABLED_SUBJECTS`**

Change:
```ts
export const QUIZ_DISABLED_SUBJECTS = new Set(["0520", "0504", "0500", "0475"]);
```
to:
```ts
export const QUIZ_DISABLED_SUBJECTS = new Set(["0520", "0504", "0475"]);
```

- [ ] **Step 2: Verify**

```bash
grep -n "QUIZ_DISABLED_SUBJECTS" web/src/lib/constants.ts
```

Expected: one line, the new set. `"0500"` must NOT appear in that line.

---

## Task 21: Wave 6a — add validator to `insert-batch-v2.py`

**Files:**
- Modify: `scripts/insert-batch-v2.py`

- [ ] **Step 1: Add the validator function near the top, after the imports**

Insert this block after the existing import lines (around line 28, after the renderer imports):

```python
def _load_active_fact_ids(rest_url: str, headers: dict) -> set[str]:
    """Pull all active atomic_fact ids once at script start."""
    out: set[str] = set()
    offset = 0
    while True:
        url = f"{rest_url}/rest/v1/atomic_facts?select=id&is_active=eq.true&limit=1000&offset={offset}"
        chunk = json.loads(urllib.request.urlopen(urllib.request.Request(url, headers=headers), timeout=30).read())
        out.update(r["id"] for r in chunk)
        if len(chunk) < 1000:
            break
        offset += 1000
    return out


def validate_related_facts(item: dict, candidate_fact_ids: set[str]) -> tuple[bool, str]:
    facts = item.get("related_facts")
    if not isinstance(facts, list) or len(facts) == 0:
        return False, "missing related_facts (must be non-empty array of strings)"
    for fact_id in facts:
        if not isinstance(fact_id, str):
            return False, f"related_facts entry is not a string: {fact_id!r}"
        if fact_id not in candidate_fact_ids:
            return False, f"related_facts references unknown atomic_fact: {fact_id}"
    return True, "ok"
```

- [ ] **Step 2: Wire the validator into the per-item validation chain**

Find the validation loop (currently around line 105: `for i, q in enumerate(generated, 1):`). Before the loop starts, add:

```python
# Load atomic_fact id whitelist for V5 — related_facts validation
print("Loading active atomic_fact ids ...", file=sys.stderr)
ACTIVE_FACT_IDS = _load_active_fact_ids(SUPABASE_URL, REST)
print(f"  {len(ACTIVE_FACT_IDS)} ids loaded", file=sys.stderr)
```

Inside the loop, after the existing MCQ-specific validators (right before `valid = not any("FAIL" in f for f in flags)`), add:

```python
    # V5 — related_facts is mandatory and must reference active atomic_facts
    rf_ok, rf_msg = validate_related_facts(q, ACTIVE_FACT_IDS)
    if not rf_ok:
        flags.append(f"V5_FAIL: {rf_msg}")
```

- [ ] **Step 3: Update the `norm` function to pass `related_facts` through**

Find the `norm()` function (around line 68). Add a final entry to the dict:

```python
        "mcq_options": q.get("mcq_options"),
        "figures": q.get("figures"),
        "related_facts": q.get("related_facts"),  # V5 — mandatory after lock migration
    }
```

- [ ] **Step 4: Update the INSERT payload to include `related_facts`**

Find the row construction near the end of the script (search for `assessment_items` insert payload). Add `"related_facts"` to the columns being sent. The exact location depends on the current script — locate by `INSERT INTO assessment_items` or the equivalent REST POST body. If the existing script builds rows from `q`, just ensure `q["related_facts"]` is in the row dict.

If unsure of the exact location, run a syntax check + a smoke test:
```bash
python -c "import ast; ast.parse(open('scripts/insert-batch-v2.py').read()); print('OK')"
```

- [ ] **Step 5: Verify**

```bash
grep -n "validate_related_facts\|related_facts" scripts/insert-batch-v2.py
```

Expected: the validator function definition + at least one call site + at least one occurrence in `norm()` + one in the INSERT payload.

---

## Task 22: Wave 6a Gate D — typecheck and build

- [ ] **Step 1: Typecheck**

```bash
pnpm --dir web tsc --noEmit
```

Expected: zero errors **in our code**. The `.next/dev/types/validator.ts` file may show one Next-internal error — that's not ours and is acceptable. To filter:

```bash
pnpm --dir web tsc --noEmit 2>&1 | grep -v "^\.next" | head -20
```

Expected output: empty.

- [ ] **Step 2: Production build**

```bash
pnpm --dir web build
```

Expected: build succeeds with no errors. Warnings about unused imports are acceptable.

---

## Task 23: Wave 6a — fold WIP commit and push

- [ ] **Step 1: Confirm working-tree state**

```bash
git status
```

Expected: 3 modified files (`quiz.ts`, `constants.ts`, `insert-batch-v2.py`). All other files (the WIP-committed quiz UI files) must NOT show — they are inside the WIP commit.

- [ ] **Step 2: Fold the WIP commit into staging**

```bash
git reset --soft HEAD~1
```

This rolls back the WIP commit but keeps everything staged. Now staging has: WIP files + the 3 new edits.

- [ ] **Step 3: Sanity check the staged set**

```bash
git diff --cached --stat
```

Expected (approximate):
```
 web/src/app/study/quiz/session/page.tsx              |   3 +
 web/src/components/quiz/diagram-renderer.tsx         |  91 (+)
 web/src/components/quiz/diagrams/bio-diagram.tsx     | (+)
 web/src/components/quiz/diagrams/circuit.tsx         | (+)
 web/src/components/quiz/diagrams/electron-shell.tsx  | (+)
 web/src/components/quiz/diagrams/graph.tsx           | (+)
 web/src/components/quiz/diagrams/organic-structure.tsx | (+)
 web/src/components/quiz/diagrams/periodic-table.tsx  | (+)
 web/src/components/quiz/quiz-question.tsx            |   8 +
 web/src/lib/constants.ts                             |   2 +-
 web/src/lib/services/orchestrators/quiz.ts           | NNN (-/+)
 scripts/insert-batch-v2.py                           | NN (+)
```

If `.claude/settings.local.json` or unrelated files appear, unstage them:
```bash
git restore --staged <file>
```

- [ ] **Step 4: Commit**

```bash
git commit -m "$(cat <<'EOF'
feat(quiz): V1 cutover with atomic-fact linkage

Quiz now serves the V1 commercial bank from `assessment_items` exclusively
for Bio/Chem/Phys/CS/EngLang. The legacy `exam_questions` fallback is
removed from the quiz path (Exam Practice and Past Papers still use it).

Every served question is linked to one or more `atomic_facts` (backfilled
via Sonnet 4.6 + Opus 4.7 pipeline; ~XYZ new facts created). Quiz answers
update both `student_topic_mastery` and `student_fact_mastery`, restoring
the flashcard SR signal.

Frontend renders structured diagrams via the new DiagramRenderer dispatcher
(electron shells, organic structures, circuits, periodic tables, graphs,
bio diagrams). EngLang (0500) is removed from QUIZ_DISABLED_SUBJECTS now
that V1 covers it. French/EngLit/Português remain disabled until V1
generation covers them.

Spec: docs/superpowers/specs/2026-05-06-question-fact-linkage-design.md (v3)
Plan: docs/superpowers/plans/2026-05-06-question-fact-linkage-implementation.md

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

- [ ] **Step 5: Push**

```bash
git push origin master
```

Expected: push succeeds. Vercel webhook triggers automatically.

---

## Task 24: Wait for Vercel deploy + Gate E (deterministic E2E)

- [ ] **Step 1: Poll Vercel for deploy state**

```bash
curl -sS "https://api.vercel.com/v6/deployments?projectId=prj_sxRP2uxtTSXP0NkZC9TYmWkBqrbY&teamId=team_RdDyI7DlhMFQBrPM3yAXAn4G&limit=1" \
  -H "Authorization: Bearer $VERCEL_TOKEN" | jq '.deployments[0] | {url, state, readyState}'
```

Re-run every ~30s until `state="READY"`. Should take ~3-5 minutes from push.

- [ ] **Step 2: Pre-test SQL setup**

Pick a Bio question scope to single result. Tighten filters until COUNT=1:
```sql
WITH counts AS (
  SELECT syllabus_topic_id, response_type, difficulty, count(*)::int AS n
  FROM assessment_items
  WHERE subject_code='0610' AND status='approved'
  GROUP BY syllabus_topic_id, response_type, difficulty
)
SELECT * FROM counts WHERE n=1 LIMIT 1;
```

If no `n=1` exists, broaden by removing `difficulty` or by adding more filters until you can isolate a single Q. Once isolated, capture `Q_TEST.id` and read `correct_answer` + `related_facts`:
```sql
SELECT id, prompt_text, response_type, correct_answer, related_facts
FROM assessment_items WHERE id='<the-isolated-id>';
```

- [ ] **Step 3: Clear exposure + mastery**

```sql
DELETE FROM question_exposure
WHERE student_id='<luisa_uuid>' AND question_id='<Q_TEST.id>' AND mode='quiz';

DELETE FROM student_fact_mastery
WHERE student_id='<luisa_uuid>'
  AND fact_id IN (SELECT jsonb_array_elements_text(related_facts) FROM assessment_items WHERE id='<Q_TEST.id>');
```

- [ ] **Step 4: Run Playwright smoke for direct quiz**

Via Playwright MCP:
1. Navigate to `https://web-blue-mu-83.vercel.app`
2. Login (PIN flow)
3. `/study/quiz` → choose Biology → choose the topic, response_type, difficulty that scopes to Q_TEST → count=1 → Start
4. Submit `<correct_answer>` → wait for evaluation feedback to render

- [ ] **Step 5: Assert mastery rows created**

```sql
SELECT fact_id, mastery_score, times_tested, last_seen
FROM student_fact_mastery
WHERE student_id='<luisa_uuid>'
  AND fact_id IN (<F_TEST list>);
```

Expected: one row per F_TEST entry, each with `times_tested=1`, `mastery_score>0`, `last_seen` within last 5 minutes. **If empty or wrong, halt and rollback** (Task 25 fallback).

- [ ] **Step 6: Repeat for EngLang (different subject path)**

Same recipe with subject_code='0500'.

- [ ] **Step 7: Negative case — French shows "Quiz unavailable"**

Navigate to `/study/quiz` → choose French. UI must show the disabled-subject state. No new DB rows.

- [ ] **Step 8: Chat-tutor positive case**

Navigate to chat-tutor for Bio. Prompt "quiz me on photosynthesis". Confirm tutor emits `launch_quiz` action and the frontend opens a quiz session. Answer the surfaced question. Verify mastery row updates for at least one of the linked facts.

- [ ] **Step 9: If any of Steps 5-8 fail, rollback**

```bash
git revert HEAD
git push origin master
```

Wait for Vercel to redeploy the previous state. Inspect logs and error patterns. The DB state (related_facts populated, constraints live) is preserved — they don't break the legacy quiz path. Once root cause is found, revert the revert and re-test.

---

## Task 25: Final memory + audit commit

- [ ] **Step 1: Update project memory**

Append to `C:\Users\sarma\.claude\projects\C--Users-sarma-OneDrive-Ambiente-de-Trabalho-tutor-final\memory\MEMORY.md`:

```markdown
- [session_2026_05_06_v1_quiz_cutover.md](session_2026_05_06_v1_quiz_cutover.md) — V1 quiz cutover live; 6 004 questions linked to atomic_facts; flashcard SR signal restored
```

Create the session memory file at the same path with the actual numbers from `data/audit/linkage_report.json`.

- [ ] **Step 2: Commit the audit JSON + memory pointer**

```bash
git add data/audit/linkage_report.json
git commit -m "docs(audit): linkage pipeline run report"
git push origin master
```

(The memory file lives in the user's home Claude directory, not the project — no commit needed for it.)

- [ ] **Step 3: Update task #8 in TaskList to completed**

This plan is then complete.

---

## Self-review checklist (run before handing off to executor)

The author of this plan is the same Opus 4.7 that will execute it. Quick fresh-eyes pass:

- **Spec coverage**: every R1-R11 from the spec maps to a task above (R1: Tasks 12+13+15; R2: Tasks 8+15+16; R3: Tasks 10+11; R4: Tasks 10+11; R5: Tasks 3+4 prompt content; R6: Tasks 3+4+12; R7: Task 2; R8: Phase 3 strict ordering; R9: Task 24 Step 8; R10: Task 20; R11: Task 21). ✅
- **Placeholder scan**: no TBDs, all SQL inline, all commands explicit. ✅
- **Type consistency**: `proposed_facts` / `approved_facts` / `new_facts_proposed` / `new_facts_approved` / `agreement_signal` used identically across spec, prompts, schema, and apply script. ✅
- **Decomposition**: 25 tasks across 3 phases, each task is one coherent unit, each step is 2-5 minutes. ✅
