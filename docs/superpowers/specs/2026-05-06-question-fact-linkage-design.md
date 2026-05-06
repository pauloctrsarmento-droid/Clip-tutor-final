# Design — Question ↔ Atomic Fact Linkage (V1 Quiz Cutover)

**Date:** 2026-05-06
**Author:** Paulo (with Claude Opus 4.7)
**Status:** Approved, ready for implementation plan

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
        │  Verify & Lock (Wave 5)                  │
        │  Gate A: zero unlinked rows              │
        │  Gate B: constraint negative tests       │
        │  Gate C: orchestrator reads 20 samples   │
        │  Apply NOT NULL + CHECK + trigger        │
        └──────────────────┬───────────────────────┘
                           │
                ⛔ CHECKPOINT — user approves
                           │
                           ▼
        ┌──────────────────────────────────────────┐
        │  Cutover (Wave 6)                        │
        │  pnpm tsc → git push → Vercel deploy     │
        │  Smoke test via Playwright MCP            │
        └──────────────────────────────────────────┘
```

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

-- linkage_proposals: full audit trail of the AI pipeline
CREATE TABLE linkage_proposals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  question_id UUID NOT NULL REFERENCES assessment_items(id) ON DELETE CASCADE,
  proposed_by TEXT NOT NULL,        -- e.g. 'sonnet-4.6'
  reviewed_by TEXT,                 -- e.g. 'opus-4.7'
  proposed_facts JSONB NOT NULL,    -- [{ fact_id, rationale }]
  approved_facts JSONB,             -- final list after review
  new_facts_proposed JSONB,         -- [{ proposed_id, fact_text, flashcard_front, rationale }]
  new_facts_approved JSONB,         -- subset created in atomic_facts
  status TEXT NOT NULL CHECK (status IN ('pending', 'reviewed', 'applied', 'rejected')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  reviewed_at TIMESTAMPTZ,
  applied_at TIMESTAMPTZ
);

CREATE INDEX idx_linkage_proposals_status ON linkage_proposals(status);
CREATE INDEX idx_linkage_proposals_question_id ON linkage_proposals(question_id);
```

### Migration 2 — Lock (run after Wave 5 Gate A passes)

```sql
-- Existence trigger: every fact_id in related_facts must point to an active atomic_fact
CREATE OR REPLACE FUNCTION check_related_facts_exist() RETURNS trigger AS $$
DECLARE
  fact_id TEXT;
BEGIN
  FOR fact_id IN SELECT jsonb_array_elements_text(NEW.related_facts) LOOP
    IF NOT EXISTS (SELECT 1 FROM atomic_facts WHERE id = fact_id AND is_active) THEN
      RAISE EXCEPTION 'related_facts contains unknown or inactive atomic_fact: %', fact_id;
    END IF;
  END LOOP;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER assessment_items_check_facts
  BEFORE INSERT OR UPDATE OF related_facts ON assessment_items
  FOR EACH ROW EXECUTE FUNCTION check_related_facts_exist();

-- NOT NULL + CHECK length ≥ 1
ALTER TABLE assessment_items
  ALTER COLUMN related_facts SET NOT NULL,
  ADD CONSTRAINT related_facts_non_empty CHECK (
    jsonb_typeof(related_facts) = 'array'
    AND jsonb_array_length(related_facts) >= 1
  );
```

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

For each question, return:
{
  "question_id": "...",
  "proposed_facts": [
    { "fact_id": "FACT_ID", "rationale": "one short sentence — WHY this fact is necessary to answer the question correctly" }
  ],
  "new_facts_proposed": [
    { "proposed_id": "{{topic_code}}_GEN_F01", "fact_text": "...", "flashcard_front": "...", "rationale": "why no existing fact covers what this question tests" }
  ]
}

STRICT RULES:
- A fact only counts if knowing it is **necessary** to answer the question correctly. "Topically related" is NOT enough.
- No upper limit on `proposed_facts` length — link every necessary fact, including all of them for multi-mark questions.
- If nothing in the candidates fits, populate `new_facts_proposed`. Never leave both `proposed_facts` and `new_facts_proposed` empty.
- Do NOT invent fact_ids that aren't in the candidate list (use `new_facts_proposed` if you need a new one).
- Output ONLY JSON. No prose.

Field names match the DB columns in `linkage_proposals` (`proposed_facts`, `new_facts_proposed`) so the orchestrator persists output verbatim.
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

Return:
{
  "approved_facts": [{ "fact_id": "...", "rationale": "..." }],
  "new_facts_approved": [{ "proposed_id": "...", "fact_text": "...", "flashcard_front": "...", "rationale": "..." }],
  "rejection_notes": "free text — why anything was removed/rejected"
}

STRICT RULES:
- approved_facts MAY be empty ONLY if new_facts_approved has entries (never both empty).
- Use "necessary to answer correctly" as the bar — not "related".
- Output ONLY JSON. No prose.

Field names match the `linkage_proposals` columns (`approved_facts`, `new_facts_approved`) for verbatim persistence.
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

## Execution timeline

| T+ | Phase | Wall-clock | Action |
|----|-------|-----------|--------|
| 0  | Approval | — | This spec approved → proceed |
| 5  | Migration 1 | 3 min | Add columns + audit table |
| 10 | Wave 1 | 5 min | Pre-flight: chunking |
| 10–45 | Wave 2 | 35 min | ~120 Sonnet sub-agents (waves of 8) |
| 45–80 | Wave 3 | 35 min | ~120 Opus sub-agents (waves of 5) |
| 80–85 | Wave 4 | 5 min | Apply to assessment_items + atomic_facts |
| 85–95 | Wave 5 | 10 min | Gates A/B/C + Migration 2 (lock) |
| 95 | ⛔ CHECKPOINT | — | User reviews report, approves cutover |
| 100 | Wave 6 | 5 min | tsc, commit, push, Vercel deploy |
| 108 | Gate E | 7 min | Playwright smoke test on production URL |
| 115 | DONE | — | Memory updated, audit committed |

## Verification gates

| Gate | Stage | Pass criterion |
|------|-------|----------------|
| A | After Wave 4 | `SELECT count(*) FROM assessment_items WHERE status='approved' AND (related_facts IS NULL OR jsonb_array_length(related_facts) = 0)` returns **0** |
| A | After Wave 4 | All fact_ids in any `related_facts` exist in `atomic_facts` with `is_active=true` |
| B | After Migration 2 | Two negative SQL inserts both fail with explicit errors (no facts → NOT NULL violation; bogus fact_id → trigger raises EXCEPTION) |
| C | After Wave 5 | Orchestrator (Opus 4.7 in this session) reads 20 random `(question, related_facts)` pairs and rates ≥18/20 as defensible |
| D | Wave 6 | `pnpm tsc --noEmit` shows no new errors; `pnpm build` succeeds |
| E | Wave 6 | Playwright E2E: quiz works for Bio + EngLang; `student_fact_mastery` shows fresh rows in last 5 min; `launch_quiz` from chat tutor works; French shows "Quiz unavailable" |

## Rollback

After cutover, if anything breaks:

```bash
git revert HEAD     # undoes the cutover commit
git push            # Vercel re-deploys previous state in ~3 min
```

No DB rollback needed — `assessment_items.related_facts` data is harmless if not consumed; constraints continue to protect future inserts; new `atomic_facts` rows are valid additions to the bank either way. The revert is purely frontend; once investigated and fixed, revert the revert and continue.

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
