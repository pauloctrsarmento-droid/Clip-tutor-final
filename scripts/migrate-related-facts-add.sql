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
