-- ============================================================
-- CLIP Tutor — Question Exposure Tracking
-- Prevents showing same questions twice across quiz/flashcard modes
-- ============================================================

CREATE TABLE IF NOT EXISTS question_exposure (
  student_id UUID NOT NULL REFERENCES students(id),
  question_id TEXT NOT NULL,          -- exam_questions.id or atomic_facts.id
  mode TEXT NOT NULL CHECK (mode IN ('flashcard', 'quiz', 'exam_practice')),
  session_id UUID,
  created_at TIMESTAMPTZ DEFAULT now(),
  PRIMARY KEY (student_id, question_id, mode)
);

CREATE INDEX IF NOT EXISTS idx_exposure_student ON question_exposure(student_id, mode);
CREATE INDEX IF NOT EXISTS idx_exposure_paper ON question_exposure(question_id);

ALTER TABLE question_exposure ENABLE ROW LEVEL SECURITY;

CREATE POLICY "public_read_exposure" ON question_exposure FOR SELECT USING (true);
CREATE POLICY "service_write_exposure" ON question_exposure FOR ALL USING (auth.role() = 'service_role');
