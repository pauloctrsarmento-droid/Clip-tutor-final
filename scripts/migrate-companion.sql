-- Companion sessions link to their parent flashcard/quiz study_sessions row.
-- ON DELETE SET NULL keeps companion conversations even if the parent is purged.
ALTER TABLE study_sessions
  ADD COLUMN IF NOT EXISTS parent_session_id UUID
  REFERENCES study_sessions(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_sessions_parent
  ON study_sessions(parent_session_id);
