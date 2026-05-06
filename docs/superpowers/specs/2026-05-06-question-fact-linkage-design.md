# Design — Question ↔ Atomic Fact Linkage (V1 Quiz Cutover)

**Date:** 2026-05-06
**Author:** Paulo (with Claude Opus 4.7)
**Status:** v2 — incorporates code-reviewer feedback (C1–C7, S1, S2, S6, S9)
**Reviewers:** Opus 4.7 forensic review run 2026-05-06; verdict downgraded from "ship" to "hold" pending these edits, then re-approved.

## Problem

The V1 commercial question bank (`assessment_items`, 6 004 approved questions across Bio/Chem/Phys/CS/EngLang) has zero linkage to `atomic_facts`. Without that linkage, every quiz attempt updates only `student_topic_mastery` — never `student_fact_mastery`. Consequences:

- The flashcard spaced-repetition algorithm reads `student_fact_mastery.mastery_score` to prioritise cards (never-seen first, then lowest score, mastered ≥0.8 are filtered out). With no quiz signal, every fact looks "new" forever.
- Quiz study and flashcard study run in silos. Luísa can master a topic via quiz and the flashcards still push the same cards.
- The legacy `exam_questions` had only 196/6 366 (3%) linked — the loop has been technically wired but practically dead since launch.

User declared this **non-negotiable** on 2026-05-06 (saved in memory: `feedback_question_fact_linkage.md`). Fact linkage must be present *before* the V1 quiz cutover ships, defended by a database constraint so it cannot regress, and applied to both the direct quiz and the chat-tutor-launched quiz (which share the same orchestrator).

## Hard requirements

| # | Requirement |
|---|---|
| R1 | Every approved row in `assessment_items` has `related_facts` with ≥1 entry, all referencing existing active rows in `atomic_facts`. |
| R2 | Postgres-level constraint prevents future inserts/updates that violate R1. Triple defense: NOT NULL + CHECK length≥1 + trigger validating existence. |
| R3 | Linking pipeline runs entirely on the user's Anthropic Max plan (Sonnet 4.6 + Opus 4.7 sub-agents via Claude Code's `Agent` tool). Zero external API cost. |
| R4 | Two independent models for matching and review (Sonnet proposes, Opus validates) — reduces correlated errors. |
| R5 | Cardinality of `related_facts` is **unbounded**: the LLM links every fact a question genuinely tests, judged by the criterion "is knowing this fact necessary to answer correctly?" — not "is it topically related?" |
| R6 | When no existing fact matches a question, Sonnet proposes a new `atomic_fact` (fact_text + flashcard_front + rationale); Opus reviews and approves/rejects creation. Bank grows organically rather than leaving gaps. |
| R7 | Auditable trail: every Sonnet→Opus exchange is persisted in a `linkage_proposals` table with rationales and statuses, queryable forever. |
| R8 | Quiz orchestrator cutover (committed but unpushed in working tree) lands **after** the backfill verifies clean (Gate A) and **after** constraints are applied (Gate B). |
| R9 | Both entry points are covered: direct quiz at `/study/quiz` and chat-tutor `launch_quiz` action — both call the same `startQuizSession` and `evaluateAnswer`. |
| R10 | EngLang (0500) is removed from `QUIZ_DISABLED_SUBJECTS` (now has 666 V1 questions). French (0520), EngLit (0475), and Português (0504) remain disabled until V1 generation covers them. |
| R11 | Future generation pipeline (`scripts/insert-batch-v2.py`) rejects batches without populated `related_facts` referencing real `atomic_facts.id`. |

## Architecture

The pipeline is a series of waves, each gated by SQL invariants. The orchestrator (Opus 4.7 in the Claude Code session) dispatches sub-agents in parallel for matching (Sonnet 4.6) and review (Opus 4.7), persisting state to `linkage_proposals` between waves so any wave can resume after failure without re-running prior work.

```
┌─────────────────────────────────────────────────────────────────┐
│  Orchestrator (Opus 4.7, this Claude Code session)              │
│  - reads assessment_items grouped by syllabus_topic_id          │
│  - reads atomic_facts grouped by syllabus_topic_id              │
│  - chunks topics (max 50 questions/chunk → ~120 chunks)         │
└──────────────────────────────┬──────────────────────────────────┘
                               │ dispatch ~120 sub-agents
                               ▼
        ┌──────────────────────────────────────────┐
        │  Sonnet 4.6 sub-agents (Wave 2, parallel)│
        │  Input: { questions[], candidate_facts[] }│
        │  Output: [{ q_id, matched[], new_facts[] }]│
        │  Persist: linkage_proposals.proposed_facts │
        └──────────────────┬───────────────────────┘
                           │
                           ▼
        ┌──────────────────────────────────────────┐
        │  Opus 4.7 sub-agents (Wave 3, parallel)  │
        │  Input: question + candidates + Sonnet's  │
        │         proposal                          │
        │  Validates each fact_id and new_fact      │
        │  Persist: linkage_proposals.approved_facts│
        └──────────────────┬───────────────────────┘
                           │
                           ▼
        ┌──────────────────────────────────────────┐
        │  Apply (Wave 4, sequential)              │
        │  UPDATE assessment_items.related_facts   │
        │  INSERT atomic_facts (new approved)      │
        │  UPDATE linkage_proposals.status='applied'│
        └──────────────────┬───────────────────────┘
                           │
                           ▼
        ┌──────────────────────────────────────────┐
        │  Verify & Lock (Wave 5) — strict order:  │
        │   1. Gate A — zero unlinked rows         │
        │   2. Gate K — kill-switch sweep (S9)     │
        │   3. Apply Migration 2 (NOT NULL,        │
        │      CHECK, both triggers)               │
        │   4. Gate B — negative constraint tests  │
        │      (must be AFTER lock applied — C3)   │
        │   5. Gate C — orchestrator reads 20      │
        │      random samples manually             │
        └──────────────────┬───────────────────────┘
                           │
                ⛔ CHECKPOINT — user approves
                           │
                           ▼
        ┌──────────────────────────────────────────┐
        │  Cutover (Wave 6)                        │
        │  pnpm tsc → git push → Vercel deploy     │
        │  Gate E: deterministic Playwright test   │
        └──────────────────────────────────────────┘
```

A separate **Wave 0** (working-tree preservation) precedes Migration 1 — see §Orchestrator behavior below.

## Database changes

### Migration 1 — Add columns and audit table (run before backfill)

```sql
-- assessment_items: new columns (nullable for now)
ALTER TABLE assessment_items
  ADD COLUMN related_facts JSONB,
  ADD COLUMN linkage_audit JSONB;

COMMENT ON COLUMN assessment_items.related_facts IS
  'JSONB array of atomic_fact ids that this question tests. Required for fact mastery updates.';
COMMENT ON COLUMN assessment_items.linkage_audit IS
  '{ matcher_model, reviewer_model, rationales, applied_at } — pipeline provenance.';

-- linkage_proposals: full audit trail of the AI pipeline (S2 — expanded fields for resumability + audit)
CREATE TABLE linkage_proposals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  question_id UUID NOT NULL REFERENCES assessment_items(id) ON DELETE CASCADE,
  chunk_id TEXT NOT NULL,                -- orchestrator's grouping key (e.g. 'CHEM_T11_chunk_03')
  matcher_model TEXT NOT NULL,           -- exact version string e.g. 'claude-sonnet-4-6'
  reviewer_model TEXT,                   -- e.g. 'claude-opus-4-7'
  proposed_facts JSONB,                  -- [{ fact_id, rationale }]
  approved_facts JSONB,                  -- final list after review
  new_facts_proposed JSONB,              -- [{ proposed_id, fact_text, flashcard_front, rationale }]
  new_facts_approved JSONB,              -- subset created in atomic_facts
  sonnet_raw_response TEXT,              -- verbatim model output (for re-parse if needed)
  opus_raw_response TEXT,
  error_message TEXT,                    -- when status indicates failure
  retry_count INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL CHECK (status IN (
    'pending',           -- chunk dispatched to Sonnet, no response yet
    'sonnet_done',       -- Sonnet returned valid JSON
    'sonnet_failed',     -- Sonnet returned malformed JSON after max retries
    'reviewed',          -- Opus reviewed and produced approved_facts
    'opus_failed',       -- Opus returned malformed JSON after max retries
    'needs_human_review',-- pipeline-level flag: orchestrator escalates this case
    'applied',           -- written to assessment_items.related_facts
    'rejected'           -- explicitly rejected, will not be applied
  )),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  reviewed_at TIMESTAMPTZ,
  applied_at TIMESTAMPTZ
);

CREATE INDEX idx_linkage_proposals_status ON linkage_proposals(status);
CREATE INDEX idx_linkage_proposals_question_id ON linkage_proposals(question_id);
CREATE INDEX idx_linkage_proposals_chunk_id ON linkage_proposals(chunk_id);

-- Resumability: at most one applied proposal per question
CREATE UNIQUE INDEX uniq_linkage_proposals_applied_per_question
  ON linkage_proposals(question_id)
  WHERE status = 'applied';
```

### Migration 2 — Lock (run after Wave 5 Gate A passes — see Wave 5 ordering)

```sql
-- ── Defense 1: every fact_id in related_facts points to an active atomic_fact ──
-- Single set-based query (C2 — replaces O(n) loop), parameter named with underscore
-- prefix to avoid any future shadowing of `fact_id` columns elsewhere.
CREATE OR REPLACE FUNCTION check_related_facts_exist() RETURNS trigger AS $$
DECLARE
  _missing_count INTEGER;
  _missing_ids TEXT;
BEGIN
  -- Cheap exit: if related_facts unchanged on UPDATE, skip validation.
  IF TG_OP = 'UPDATE' AND OLD.related_facts IS NOT DISTINCT FROM NEW.related_facts THEN
    RETURN NEW;
  END IF;

  -- One query: count refs that don't point to an active atomic_fact.
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

CREATE TRIGGER assessment_items_check_facts
  BEFORE INSERT OR UPDATE OF related_facts ON assessment_items
  FOR EACH ROW EXECUTE FUNCTION check_related_facts_exist();

-- ── Defense 2: cannot soft-delete an atomic_fact still referenced by an approved item ──
-- (C1 — without this, the "triple defense" claim was false: flipping is_active=false
-- on a referenced fact left silently broken pointers in assessment_items.)
CREATE OR REPLACE FUNCTION protect_referenced_atomic_facts() RETURNS trigger AS $$
DECLARE
  _ref_count INTEGER;
BEGIN
  -- Only care when transitioning is_active true -> false.
  IF TG_OP = 'UPDATE'
     AND OLD.is_active = true
     AND NEW.is_active = false
  THEN
    SELECT count(*) INTO _ref_count
    FROM assessment_items
    WHERE status = 'approved'
      AND related_facts ? OLD.id;        -- jsonb ? text — element-of test

    IF _ref_count > 0 THEN
      RAISE EXCEPTION
        'cannot deactivate atomic_fact %: still referenced by % approved assessment_items.related_facts', OLD.id, _ref_count;
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER atomic_facts_protect_referenced
  BEFORE UPDATE OF is_active ON atomic_facts
  FOR EACH ROW EXECUTE FUNCTION protect_referenced_atomic_facts();

-- ── Defense 3: NOT NULL + CHECK array-shape ──
-- The shape check is intentionally belt-and-braces: jsonb_array_length raises on
-- non-arrays, but the typeof check produces a friendlier constraint-violation
-- message. Do NOT simplify.
ALTER TABLE assessment_items
  ALTER COLUMN related_facts SET NOT NULL,
  ADD CONSTRAINT related_facts_non_empty CHECK (
    jsonb_typeof(related_facts) = 'array'
    AND jsonb_array_length(related_facts) >= 1
  );
```

**Migration 2 is non-revertible** without an explicit `DROP CONSTRAINT … DROP TRIGGER` follow-up migration. Once applied, every future `INSERT` and `UPDATE OF related_facts` on `assessment_items` must satisfy all three defenses. This is intentional — alignment with the non-negotiable rule.

## Orchestrator behavior

This section captures pipeline-level behaviors that the high-level diagram skips: working-tree safety, retry policy, resumability, kill-switch, and the Wave 4 race safety argument. The implementation plan must respect every invariant here.

### Wave 0 — Working-tree preservation (C4)

Before Migration 1 runs, the orchestrator must commit (or stash) the existing uncommitted V1 cutover changes so the multi-hour pipeline does not depend on local FS persistence:

```
Files currently modified locally (git status verified at spec time):
  web/src/lib/services/orchestrators/quiz.ts
  web/src/components/quiz/quiz-question.tsx
  web/src/app/study/quiz/session/page.tsx
  + untracked: web/src/components/quiz/diagram-renderer.tsx
              web/src/components/quiz/diagrams/*.tsx

Wave 0 action:
  git add <those files only>
  git commit -m "wip(quiz): V1 cutover staging for fact-linkage pipeline"
  (Do NOT push. Local commit only — preserves work across crashes.)
  At Wave 6, this WIP commit is amended into the proper cutover commit
  (or git reset --soft HEAD~1 → re-commit with final message).
```

### Sonnet retry policy (C7)

If Sonnet's response for a chunk fails JSON validation against the schema in §Sonnet 4.6 matcher:

1. **First failure** — retry once with the same input plus a system-prepended note: "Your previous response was not valid JSON. Return strictly the schema described, nothing else." Increment `linkage_proposals.retry_count` to 1.
2. **Second failure** — write `linkage_proposals.status = 'sonnet_failed'`, persist the raw response in `sonnet_raw_response`, log the error. Skip Opus for this chunk. Surface in the Wave 5 gate report.
3. **Per-question recovery** — if Sonnet returned valid JSON but is missing some `question_id`s from the input batch (partial coverage), the orchestrator marks only the missing questions as `sonnet_failed` and proceeds with the rest.

Same policy mirrored for Opus:
- 1 retry on parse failure → otherwise `status='opus_failed'`, surface in Wave 5.

### Resumability protocol (S1)

The pipeline may run for 3–4 hours and the Claude Code session may hit context limits, rate limits, or simply crash. Resume rules:

- Every Sonnet sub-agent persists output to `linkage_proposals` immediately on completion (no buffering in orchestrator memory beyond a single chunk).
- Every Opus sub-agent updates the same row to `status='reviewed'`.
- On orchestrator restart:
  ```sql
  -- Skip questions already linked
  SELECT id FROM assessment_items
  WHERE status='approved'
    AND id NOT IN (
      SELECT question_id FROM linkage_proposals
      WHERE status IN ('reviewed', 'applied')
    );
  -- These are the questions still needing matcher OR review.
  ```
- Wave 4 (apply) is idempotent: `UPDATE assessment_items SET related_facts = ... WHERE id = ?` is safe to re-run; the unique partial index `uniq_linkage_proposals_applied_per_question` prevents double-application.

### Kill-switch (S9 — Gate K)

Inside Wave 5, before applying Migration 2:

```sql
-- A chunk is "suspicious" if Opus rejected most of Sonnet's proposals
-- AND added little of its own. If too many chunks fail this test,
-- something is systemically wrong (bad prompt, bad candidate set, model
-- regression). Halt and surface for human review.

WITH per_chunk AS (
  SELECT
    chunk_id,
    count(*) AS questions_in_chunk,
    count(*) FILTER (
      WHERE jsonb_array_length(coalesce(approved_facts, '[]'::jsonb)) = 0
        AND jsonb_array_length(coalesce(new_facts_approved, '[]'::jsonb)) = 0
    ) AS empty_approvals
  FROM linkage_proposals
  WHERE status IN ('reviewed', 'applied')
  GROUP BY chunk_id
),
flagged AS (
  SELECT * FROM per_chunk
  WHERE questions_in_chunk >= 5
    AND empty_approvals::float / questions_in_chunk > 0.5
)
SELECT * FROM flagged;
```

If `flagged` returns any rows → **Gate K fails**. Pipeline halts. Orchestrator inspects sample chunks, identifies the systemic issue, and decides: re-run those chunks with a tweaked prompt, or escalate to user.

Additionally, the per-question `agreement_signal='low'` flag from Opus (see Opus prompt) is rolled up — if >5% of all questions have `low` agreement, also halt.

### Wave 4 race safety (C5)

Wave 4 writes to `assessment_items.related_facts` row-by-row over ~5 min. A live student answering a quiz at the same moment hits `quiz.ts → fetchApprovedItems → SELECT … FROM assessment_items` and `evaluateAnswer → SELECT * FROM assessment_items`. Could the student see partial state?

**Argument that it's safe**:
- Pre-cutover code currently in production reads from `exam_questions`, NOT `assessment_items`. The quiz path does not touch `assessment_items` at all until Wave 6 ships the cutover commit.
- During Wave 4, the V1 cutover code is still uncommitted (Wave 0 made it a local-only WIP commit). Production traffic to `/api/quiz/*` therefore touches only the legacy bank. Any read of `assessment_items` mid-Wave-4 is harmless because no consumer is using it.
- Even if a future hand-rolled cron or admin tool reads `assessment_items` mid-write, jsonb-typed `related_facts` writes are atomic at the row level — partial JSON values are not possible.

**Required pre-Wave-4 check**: orchestrator runs `git log origin/master..HEAD --oneline` and confirms the cutover changes are NOT pushed. If they are, Wave 4 is paused; the pipeline is reset to a known state before continuing.

## Sub-agent prompts (skeletons)

### Sonnet 4.6 matcher

```
You are linking IGCSE quiz questions to atomic facts that they test.

CONTEXT:
- Subject: {{subject_name}}
- Topic: {{topic_code}} — {{topic_name}}

CANDIDATE FACTS ({{n_facts}} total):
{{#each candidate_facts}}
- {{id}}: {{fact_text}}
{{/each}}

QUESTIONS TO LINK ({{n_questions}}):
{{#each questions}}
[Q{{i}}] id={{id}}  marks={{marks}}  type={{response_type}}
prompt: {{prompt_text}}
{{#if parent_context}}context: {{parent_context}}{{/if}}
{{#if mark_scheme}}mark scheme: {{mark_scheme}}{{/if}}
---
{{/each}}

Return ONE JSON object with this exact top-level shape (C6 — wrapped to remove ambiguity):
{
  "results": [
    {
      "question_id": "...",
      "proposed_facts": [
        { "fact_id": "FACT_ID", "rationale": "one short sentence — WHY this fact is necessary to answer the question correctly" }
      ],
      "new_facts_proposed": [
        { "proposed_id": "{{topic_code}}_GEN_F01", "fact_text": "...", "flashcard_front": "...", "rationale": "why no existing fact covers what this question tests" }
      ]
    }
    // ... one entry per input question, in the same order
  ]
}

STRICT RULES:
- A fact only counts if knowing it is **necessary** to answer the question correctly. "Topically related" is NOT enough.
- No upper limit on `proposed_facts` length — link every necessary fact, including all of them for multi-mark questions.
- If nothing in the candidates fits, populate `new_facts_proposed`. Never leave both `proposed_facts` and `new_facts_proposed` empty.
- Do NOT invent fact_ids that aren't in the candidate list (use `new_facts_proposed` if you need a new one).
- Output MUST be a single JSON object with key `results`. NOT a bare array. NOT multiple JSON objects concatenated. NO prose.
- Inner field names (`proposed_facts`, `new_facts_proposed`) match the DB columns in `linkage_proposals` for verbatim persistence.
```

### Opus 4.7 reviewer

```
You are auditing an AI's question-fact linking proposals. Be skeptical.

QUESTION:
id={{question.id}}  marks={{question.marks}}
prompt: {{question.prompt_text}}
{{#if mark_scheme}}mark scheme: {{mark_scheme}}{{/if}}

CANDIDATE FACTS:
{{candidate_facts_listing}}

SONNET PROPOSED:
proposed_facts: {{sonnet.proposed_facts}}
new_facts_proposed: {{sonnet.new_facts_proposed}}

For each entry in `proposed_facts`, decide:
- KEEP if the fact is genuinely necessary to answer correctly.
- REMOVE if it's only topically related, not tested.
- ADD missing facts that Sonnet overlooked (only from the candidate list).

For each entry in `new_facts_proposed`, decide:
- APPROVE if no existing candidate fact covers what the question tests, AND the new fact is well-formed (single concept, ≤2 sentences, IGCSE-appropriate).
- REJECT if an existing candidate already covers it (state which fact_id covers it).
- REWRITE the proposed_id, fact_text, or flashcard_front if it can be salvaged with edits.

Return a single JSON object:
{
  "approved_facts": [{ "fact_id": "...", "rationale": "..." }],
  "new_facts_approved": [{ "proposed_id": "...", "fact_text": "...", "flashcard_front": "...", "rationale": "..." }],
  "rejection_notes": "free text — why anything was removed/rejected",
  "agreement_signal": "high" | "medium" | "low"
}

`agreement_signal` is the reviewer's overall trust in Sonnet's pass for this question — `low` means the orchestrator should flag the chunk for human review. Use `low` whenever you remove >50% of Sonnet's proposed facts AND add nothing.

STRICT RULES:
- approved_facts MAY be empty ONLY if new_facts_approved has entries (never both empty).
- Use "necessary to answer correctly" as the bar — not "related".
- Output ONLY JSON (single object). No prose. No wrapping array.

Field names `approved_facts` and `new_facts_approved` match the `linkage_proposals` columns for verbatim persistence.
```

## Code changes

### `web/src/lib/services/orchestrators/quiz.ts`

Two changes after backfill applies:

1. Add `related_facts` to the SELECT in `fetchApprovedItems`:

   ```ts
   .select("id, prompt_text, parent_context, marks, response_type, correct_answer, mark_scheme, mcq_options, figures, syllabus_topic_id, subject_code, difficulty, command_word, related_facts")
   ```

2. Remove the `related_facts: null` hack in `evaluateAnswer`:

   ```ts
   // Before
   const question: Record<string, unknown> = {
     ...r,
     question_text: r.prompt_text,
     related_facts: null, // hack — remove
   };

   // After
   const question: Record<string, unknown> = {
     ...r,
     question_text: r.prompt_text,
     // related_facts comes through directly from the row
   };
   ```

The existing `extractFactIds` + `updateFactMastery` calls at the bottom of `evaluateAnswer` then activate automatically.

### `web/src/lib/constants.ts`

```ts
// Before
export const QUIZ_DISABLED_SUBJECTS = new Set(["0520", "0504", "0500", "0475"]);

// After (EngLang has V1 now)
export const QUIZ_DISABLED_SUBJECTS = new Set(["0520", "0504", "0475"]);
```

### `scripts/insert-batch-v2.py`

Add a validator function called for every item before insert:

```python
def _load_active_fact_ids() -> set[str]:
    """Pull all active atomic_fact ids once at script start."""
    res = supabase.table("atomic_facts").select("id").eq("is_active", True).execute()
    return {row["id"] for row in res.data}

def validate_related_facts(item: dict, candidate_fact_ids: set[str]) -> tuple[bool, str]:
    facts = item.get("related_facts")
    if not isinstance(facts, list) or len(facts) == 0:
        return False, "missing related_facts (must be non-empty array)"
    for fact_id in facts:
        if not isinstance(fact_id, str):
            return False, f"related_facts entry is not a string: {fact_id!r}"
        if fact_id not in candidate_fact_ids:
            return False, f"related_facts references unknown atomic_fact: {fact_id}"
    return True, "ok"
```

Wired into the existing per-item validation chain. Item rejected on failure → batch aborts with clear error before any insert hits Postgres.

### Frontend (no changes beyond what is already in working tree)

`web/src/app/study/quiz/session/page.tsx`, `web/src/components/quiz/quiz-question.tsx`, `web/src/components/quiz/diagram-renderer.tsx`, and `web/src/components/quiz/diagrams/*.tsx` already exist in the working tree (uncommitted) and need no further changes.

## Execution timeline (S1 — realistic re-budget; original 95-min estimate was optimistic)

Wall-clock budget reflects empirical sub-agent latency: a Sonnet sub-agent processing a 50-question chunk with full mark schemes typically takes 3–7 minutes; Opus reviewing that chunk takes another 3–7 minutes. Parallelism cuts the total but rate limits cap the parallelism. Plan for **3–4 hours total**, not 95 minutes.

| T+ (min) | Phase | Wall-clock | Action |
|----------|-------|-----------|--------|
| 0   | Approval | — | This spec approved → proceed |
| 0–5 | Wave 0 | 5 min | Stash/WIP-commit working tree (C4) |
| 5–10 | Migration 1 | 5 min | Add columns + audit table |
| 10–15 | Wave 1 | 5 min | Pre-flight chunking; verify multi-part assumption (S4) |
| 15–105 | Wave 2 | 60–90 min | ~120 Sonnet sub-agents in batches of ~8 parallel; persist each result to `linkage_proposals` immediately |
| 105–195 | Wave 3 | 60–90 min | ~120 Opus sub-agents in batches of ~5 parallel; same persistence rule |
| 195–205 | Wave 4 | 5–10 min | Idempotent apply: UPDATE assessment_items, INSERT new atomic_facts |
| 205–225 | Wave 5 | 15–20 min | Gate A → Gate K → apply Migration 2 → Gate B → Gate C |
| 225 | ⛔ CHECKPOINT | — | User reviews report, approves cutover |
| 225–230 | Wave 6a | 5 min | `pnpm tsc --noEmit` → Wave-0 WIP commit reset+amend → push |
| 230–235 | Vercel deploy | 3–5 min | Auto-deploy on push to master |
| 235–245 | Gate E | 7–10 min | Deterministic Playwright smoke (see Verification gates) |
| 245 | DONE | — | Memory updated, audit JSON committed |

**Total: ~4 hours.** If rate limits force longer waves, the resumability protocol allows a clean pause (e.g. day → next day) without losing work.

## Verification gates

Strict ordering inside Wave 5: **Gate A → Gate K → apply Migration 2 → Gate B → Gate C**. Gate B *requires* the lock to be live (else there is nothing to fail negatively against — C3).

| Gate | Stage | Pass criterion |
|------|-------|----------------|
| A | Wave 5 step 1 | `SELECT count(*) FROM assessment_items WHERE status='approved' AND (related_facts IS NULL OR jsonb_array_length(related_facts) = 0)` returns **0** |
| A | Wave 5 step 1 | Every fact_id appearing in any `related_facts` exists in `atomic_facts` with `is_active=true` (subquery scan, must return 0 missing) |
| K | Wave 5 step 2 | Kill-switch SQL (see §Orchestrator behavior — Gate K) returns 0 flagged chunks AND <5% of questions have `agreement_signal='low'`; otherwise halt |
| B | Wave 5 step 4 | Migration 2 already applied. Two negative SQL inserts both fail: (i) no `related_facts` → `null value … violates not-null`; (ii) bogus fact_id → `related_facts references unknown or inactive atomic_fact: …`. A third negative test: try `UPDATE atomic_facts SET is_active=false WHERE id=<one referenced fact>` → must fail with the protect_referenced_atomic_facts EXCEPTION (C1) |
| C | Wave 5 step 5 | Orchestrator (Opus 4.7 in this session) reads 20 random `(question, related_facts)` pairs and rates ≥18/20 as defensible |
| D | Wave 6 (build) | `pnpm tsc --noEmit` shows no new errors in our code; `pnpm build` succeeds |
| E | Wave 6 (live) | Deterministic Playwright E2E (see below) |

### Gate E — deterministic E2E (S6)

The original "fresh rows in last 5 min" criterion gives false positives if quiz answers happen to hit only already-mastered facts (no INSERT, only UPDATE that may not change `last_seen` precisely). Replaced with deterministic steps:

```
Pre-test setup (run via Supabase SQL):
  1. Identify ONE specific known V1 question with known related_facts:
     SELECT id, related_facts FROM assessment_items
     WHERE subject_code='0610' AND status='approved'
       AND jsonb_array_length(related_facts) >= 1
     ORDER BY id LIMIT 1;
     → call this Q_TEST, with linked_facts F_TEST = [...]
  2. DELETE FROM student_fact_mastery
     WHERE student_id=<luisa_id> AND fact_id = ANY(F_TEST);
     → guarantees clean slate for those facts.

Playwright test:
  3. Open https://web-blue-mu-83.vercel.app
  4. Login as Luísa (PIN)
  5. Navigate to a quiz session that will surface Q_TEST
     (or use an admin route that opens a session with a specific question_id).
  6. Submit the correct answer. Wait for evaluation feedback to render.

Post-test SQL assert:
  7. SELECT fact_id, mastery_score, times_tested, last_seen
     FROM student_fact_mastery
     WHERE student_id=<luisa_id> AND fact_id = ANY(F_TEST);
     → MUST return one row per F_TEST entry, each with times_tested = 1 AND
       mastery_score > 0 AND last_seen ≥ test_start_time.
  8. Repeat with EngLang question (different subject path) — same assertions.
  9. Negative case: open quiz for French — UI must show "Quiz unavailable"
     and NO new student_fact_mastery rows for that subject's facts.
  10. Chat tutor positive case: start a Bio chat session, prompt "quiz me on
      photosynthesis", confirm tutor emits launch_quiz, frontend opens quiz,
      answer it, re-run the SQL assert.
```

Any failure of step 7, 8, 9, or 10 → halt cutover, rollback (see §Rollback).

## Rollback

After cutover, if anything breaks:

```bash
git revert HEAD     # undoes the cutover commit
git push            # Vercel re-deploys previous state in ~3 min
```

No DB rollback needed — `assessment_items.related_facts` data is harmless if not consumed; constraints continue to protect future inserts; new `atomic_facts` rows are valid additions to the bank either way. The revert is purely frontend; once investigated and fixed, revert the revert and continue.

**Migration 2 is non-revertible by design (S7).** Once the NOT NULL + CHECK + both triggers are applied, future `INSERT`/`UPDATE` operations on `assessment_items` MUST send a non-empty `related_facts` array referencing only active `atomic_facts.id` values. This binds `scripts/insert-batch-v2.py` (and any successor) forever. If a future migration needs to relax this — for example to allow a temporary draft state without facts — it must be a separate, deliberate `DROP CONSTRAINT … DROP TRIGGER` migration with explicit user approval. The frontend rollback above does not affect this database invariant; the invariant is the whole point.

## Out of scope

- Backfilling `exam_questions.related_facts` (the legacy bank) — not consumed by the quiz path after cutover.
- French / EngLit / Português question generation — separate future spec.
- Re-linking flashcards explicitly to `atomic_facts.id` — already linked by virtue of `flashcard_questions.fact_id` FK.
- Math (0580) — has 318 facts but all `syllabus_topic_id IS NULL`; no V1 questions; leave for future.
- Replacing the existing topic mastery PL/pgSQL with one that also updates fact mastery server-side — current `evaluateAnswer` updates both client-side, fine for now.

## Decisions captured

| Choice | Decision | Rationale |
|--------|----------|-----------|
| Cardinality of related_facts | Unbounded; LLM picks all genuinely tested | User: "o mais preciso possível, não deixar facts vazios pela limitação" |
| Matching model | Sonnet 4.6 sub-agent | Cost zero on Max plan; fast |
| Review model | Opus 4.7 sub-agent | Two independent models reduce correlated errors; user can't review by hand |
| Sequencing | Backfill → lock → cutover (option C) | Bullet-proof; the lock prevents future regressions per non-negotiable rule |
| No-match fallback | Sonnet proposes new atomic_fact, Opus reviews | Avoids gaps; bank grows organically; aligned with 100% coverage stance |
| Backfill scope | V1 only (6 004) | Legacy bank discarded from quiz path; no need to backfill it |
