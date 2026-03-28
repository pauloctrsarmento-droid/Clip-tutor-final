-- ============================================================
-- CLIP Tutor — Chat Tutor Migration
-- Run in Supabase SQL Editor AFTER block2 + block3 + block4
-- ============================================================

-- 1. Chat messages table (conversation history)
CREATE TABLE IF NOT EXISTS chat_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id UUID NOT NULL REFERENCES study_sessions(id) ON DELETE CASCADE,
  role TEXT NOT NULL CHECK (role IN ('user', 'assistant', 'system')),
  content TEXT NOT NULL,
  images TEXT[],              -- Supabase Storage URLs (chat-uploads/{session_id}/...)
  action JSONB,               -- parsed action from assistant messages
  internal JSONB,             -- parsed internal metadata from assistant messages
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_chat_messages_session ON chat_messages(session_id, created_at);

-- 2. Tutor memory table (per-subject session summaries)
CREATE TABLE IF NOT EXISTS tutor_memory (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id UUID NOT NULL REFERENCES students(id),
  subject_code TEXT NOT NULL,
  session_id UUID REFERENCES study_sessions(id),
  summary TEXT NOT NULL,
  key_points JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_tutor_memory_lookup ON tutor_memory(student_id, subject_code);

-- 3. Extend study_sessions for chat tutor
ALTER TABLE study_sessions ADD COLUMN IF NOT EXISTS running_summary TEXT;
ALTER TABLE study_sessions ADD COLUMN IF NOT EXISTS current_block_index INTEGER DEFAULT 0;
ALTER TABLE study_sessions ADD COLUMN IF NOT EXISTS block_phase TEXT DEFAULT 'intro';
ALTER TABLE study_sessions ADD COLUMN IF NOT EXISTS embedded_session_id UUID;
ALTER TABLE study_sessions ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'active';

-- 4. RLS
ALTER TABLE chat_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE tutor_memory ENABLE ROW LEVEL SECURITY;

CREATE POLICY "public_read_chat_messages" ON chat_messages FOR SELECT USING (true);
CREATE POLICY "service_write_chat_messages" ON chat_messages FOR ALL USING (auth.role() = 'service_role');

CREATE POLICY "public_read_tutor_memory" ON tutor_memory FOR SELECT USING (true);
CREATE POLICY "service_write_tutor_memory" ON tutor_memory FOR ALL USING (auth.role() = 'service_role');

-- 5. Verify
SELECT table_name FROM information_schema.tables
WHERE table_schema = 'public' AND table_name IN ('chat_messages', 'tutor_memory');

SELECT column_name FROM information_schema.columns
WHERE table_name = 'study_sessions' AND column_name IN ('running_summary', 'current_block_index', 'block_phase', 'embedded_session_id', 'status');
