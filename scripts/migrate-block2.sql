-- ============================================================
-- CLIP Tutor — Block 2: Study System Schema
-- Run this in Supabase SQL Editor (Dashboard > SQL Editor)
-- Depends on Block 1 tables: subjects, syllabus_topics, atomic_facts
-- ============================================================

-- ============================================================
-- 1. Students
-- ============================================================
CREATE TABLE IF NOT EXISTS students (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  current_streak integer NOT NULL DEFAULT 0,
  longest_streak integer NOT NULL DEFAULT 0,
  last_study_date date,
  created_at timestamptz DEFAULT now()
);

INSERT INTO students (id, name)
VALUES ('00000000-0000-0000-0000-000000000001', 'Luísa')
ON CONFLICT (id) DO NOTHING;

-- ============================================================
-- 2. Exam Papers (metadata per paper)
-- ============================================================
CREATE TABLE IF NOT EXISTS exam_papers (
  id text PRIMARY KEY,                    -- e.g. "0620_s23_41"
  subject_code text NOT NULL,
  session text NOT NULL,                  -- e.g. "s23", "w22", "m19"
  variant text NOT NULL,                  -- e.g. "41", "42", "21"
  year integer NOT NULL,
  total_questions integer NOT NULL DEFAULT 0,
  total_marks integer NOT NULL DEFAULT 0,
  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_exam_papers_subject ON exam_papers(subject_code);

-- ============================================================
-- 3. Exam Questions (leaves only — stems stored as parent_context)
-- ============================================================
CREATE TABLE IF NOT EXISTS exam_questions (
  id text PRIMARY KEY,                    -- e.g. "0620_m19_42_q1a"
  paper_id text NOT NULL REFERENCES exam_papers(id) ON DELETE CASCADE,
  subject_code text NOT NULL,
  syllabus_topic_id uuid REFERENCES syllabus_topics(id) ON DELETE SET NULL,
  question_number integer NOT NULL,
  part_label text,                        -- "(a)", "(b)(i)", etc.
  group_id text,                          -- groups related sub-questions
  question_text text NOT NULL,
  parent_context text,                    -- stem text inherited from parent
  marks integer NOT NULL DEFAULT 1,
  correct_answer text,
  mark_scheme text,
  mark_points jsonb DEFAULT '[]'::jsonb,
  question_type text NOT NULL DEFAULT 'short',    -- short | structured
  response_type text NOT NULL DEFAULT 'text',     -- text | numeric | drawing | table | mcq | labelling
  has_diagram boolean NOT NULL DEFAULT false,
  fig_refs jsonb DEFAULT '[]'::jsonb,
  table_refs jsonb DEFAULT '[]'::jsonb,
  evaluation_ready boolean NOT NULL DEFAULT true,
  is_stem boolean NOT NULL DEFAULT false,
  part_order integer DEFAULT 0,
  sibling_count integer DEFAULT 1,
  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_eq_paper ON exam_questions(paper_id);
CREATE INDEX IF NOT EXISTS idx_eq_subject ON exam_questions(subject_code);
CREATE INDEX IF NOT EXISTS idx_eq_topic ON exam_questions(syllabus_topic_id);
CREATE INDEX IF NOT EXISTS idx_eq_response ON exam_questions(response_type);
CREATE INDEX IF NOT EXISTS idx_eq_eval ON exam_questions(evaluation_ready) WHERE evaluation_ready = true;
CREATE INDEX IF NOT EXISTS idx_eq_leaves ON exam_questions(is_stem) WHERE is_stem = false;

-- ============================================================
-- 4. Study Sessions
-- ============================================================
CREATE TABLE IF NOT EXISTS study_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id uuid NOT NULL DEFAULT '00000000-0000-0000-0000-000000000001'
    REFERENCES students(id) ON DELETE CASCADE,
  session_type text NOT NULL,             -- 'flashcard' | 'quiz' | 'review'
  subject_code text,
  syllabus_topic_id uuid REFERENCES syllabus_topics(id) ON DELETE SET NULL,
  started_at timestamptz NOT NULL DEFAULT now(),
  ended_at timestamptz,
  total_cards integer NOT NULL DEFAULT 0,
  correct_count integer NOT NULL DEFAULT 0,
  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_ss_student ON study_sessions(student_id);
CREATE INDEX IF NOT EXISTS idx_ss_started ON study_sessions(started_at DESC);

-- ============================================================
-- 5. Student Fact Mastery (per-fact spaced repetition)
-- ============================================================
CREATE TABLE IF NOT EXISTS student_fact_mastery (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id uuid NOT NULL DEFAULT '00000000-0000-0000-0000-000000000001'
    REFERENCES students(id) ON DELETE CASCADE,
  fact_id text NOT NULL REFERENCES atomic_facts(id) ON DELETE CASCADE,
  mastery_score real NOT NULL DEFAULT 0.0
    CHECK (mastery_score >= 0.0 AND mastery_score <= 1.0),
  consecutive_correct integer NOT NULL DEFAULT 0,
  times_tested integer NOT NULL DEFAULT 0,
  times_correct integer NOT NULL DEFAULT 0,
  last_seen timestamptz,
  last_error text,
  decay_applied_at timestamptz,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  UNIQUE (student_id, fact_id)
);

CREATE INDEX IF NOT EXISTS idx_sfm_student ON student_fact_mastery(student_id);
CREATE INDEX IF NOT EXISTS idx_sfm_score ON student_fact_mastery(student_id, mastery_score);
CREATE INDEX IF NOT EXISTS idx_sfm_last_seen ON student_fact_mastery(last_seen);

-- ============================================================
-- 6. Student Topic Mastery (aggregated marks per topic)
-- ============================================================
CREATE TABLE IF NOT EXISTS student_topic_mastery (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id uuid NOT NULL DEFAULT '00000000-0000-0000-0000-000000000001'
    REFERENCES students(id) ON DELETE CASCADE,
  syllabus_topic_id uuid NOT NULL REFERENCES syllabus_topics(id) ON DELETE CASCADE,
  total_marks_earned integer NOT NULL DEFAULT 0,
  total_marks_available integer NOT NULL DEFAULT 0,
  questions_attempted integer NOT NULL DEFAULT 0,
  questions_correct integer NOT NULL DEFAULT 0,
  last_practiced timestamptz,
  updated_at timestamptz DEFAULT now(),
  UNIQUE (student_id, syllabus_topic_id)
);

CREATE INDEX IF NOT EXISTS idx_stm_student ON student_topic_mastery(student_id);

-- ============================================================
-- 7. Flashcard Attempts
-- ============================================================
CREATE TABLE IF NOT EXISTS flashcard_attempts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id uuid NOT NULL DEFAULT '00000000-0000-0000-0000-000000000001'
    REFERENCES students(id) ON DELETE CASCADE,
  session_id uuid REFERENCES study_sessions(id) ON DELETE SET NULL,
  fact_id text NOT NULL REFERENCES atomic_facts(id) ON DELETE CASCADE,
  correct boolean NOT NULL,
  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_fa_session ON flashcard_attempts(session_id);
CREATE INDEX IF NOT EXISTS idx_fa_created ON flashcard_attempts(created_at DESC);

-- ============================================================
-- 8. Quiz Attempts
-- ============================================================
CREATE TABLE IF NOT EXISTS quiz_attempts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id uuid NOT NULL DEFAULT '00000000-0000-0000-0000-000000000001'
    REFERENCES students(id) ON DELETE CASCADE,
  session_id uuid REFERENCES study_sessions(id) ON DELETE SET NULL,
  question_id text NOT NULL REFERENCES exam_questions(id) ON DELETE CASCADE,
  marks_awarded integer NOT NULL DEFAULT 0,
  marks_available integer NOT NULL DEFAULT 1,
  self_graded boolean NOT NULL DEFAULT true,
  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_qa_session ON quiz_attempts(session_id);
CREATE INDEX IF NOT EXISTS idx_qa_question ON quiz_attempts(question_id);
CREATE INDEX IF NOT EXISTS idx_qa_created ON quiz_attempts(created_at DESC);

-- ============================================================
-- 9. Study Suggestions
-- ============================================================
CREATE TABLE IF NOT EXISTS study_suggestions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id uuid NOT NULL DEFAULT '00000000-0000-0000-0000-000000000001'
    REFERENCES students(id) ON DELETE CASCADE,
  syllabus_topic_id uuid NOT NULL REFERENCES syllabus_topics(id) ON DELETE CASCADE,
  reason text NOT NULL,
  reason_code text NOT NULL DEFAULT 'low_mastery',  -- 'never_seen' | 'stale' | 'low_mastery'
  priority integer NOT NULL DEFAULT 0,
  dismissed boolean NOT NULL DEFAULT false,
  acted_on boolean NOT NULL DEFAULT false,
  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_sug_active ON study_suggestions(student_id, dismissed) WHERE dismissed = false;

-- ============================================================
-- 10. Atomic mastery update function (PL/pgSQL)
-- ============================================================
CREATE OR REPLACE FUNCTION update_fact_mastery(
  p_student_id uuid,
  p_fact_id text,
  p_correct boolean
) RETURNS jsonb AS $$
DECLARE
  v_boost real := 0.35;
  v_penalty real := 0.20;
  v_threshold real := 0.80;
  v_decay_days integer := 14;
  v_decay_amount real := 0.10;
  v_score real;
  v_consecutive integer;
  v_tested integer;
  v_correct_count integer;
  v_existed boolean;
BEGIN
  -- Ensure row exists
  INSERT INTO student_fact_mastery (student_id, fact_id, mastery_score, consecutive_correct, times_tested, times_correct, last_seen, decay_applied_at)
  VALUES (p_student_id, p_fact_id, 0.0, 0, 0, 0, NULL, NULL)
  ON CONFLICT (student_id, fact_id) DO NOTHING
  RETURNING false INTO v_existed;

  -- Lock and read current values
  SELECT mastery_score, consecutive_correct, times_tested, times_correct
  INTO v_score, v_consecutive, v_tested, v_correct_count
  FROM student_fact_mastery
  WHERE student_id = p_student_id AND fact_id = p_fact_id
  FOR UPDATE;

  -- Apply decay if stale (not seen in 14+ days, decay not recently applied)
  IF v_score > 0 AND EXISTS (
    SELECT 1 FROM student_fact_mastery
    WHERE student_id = p_student_id AND fact_id = p_fact_id
      AND last_seen IS NOT NULL
      AND last_seen < now() - (v_decay_days || ' days')::interval
      AND (decay_applied_at IS NULL OR decay_applied_at < now() - (v_decay_days || ' days')::interval)
  ) THEN
    v_score := GREATEST(0.0, v_score - v_decay_amount);
  END IF;

  -- Apply correct/incorrect
  IF p_correct THEN
    v_score := LEAST(1.0, v_score + v_boost);
    v_consecutive := v_consecutive + 1;
    v_correct_count := v_correct_count + 1;
  ELSE
    v_score := GREATEST(0.0, v_score - v_penalty);
    v_consecutive := 0;
  END IF;

  v_tested := v_tested + 1;

  -- Update row
  UPDATE student_fact_mastery
  SET mastery_score = v_score,
      consecutive_correct = v_consecutive,
      times_tested = v_tested,
      times_correct = v_correct_count,
      last_seen = now(),
      decay_applied_at = COALESCE(decay_applied_at, now()),
      updated_at = now(),
      last_error = CASE WHEN NOT p_correct THEN to_char(now(), 'YYYY-MM-DD HH24:MI') ELSE last_error END
  WHERE student_id = p_student_id AND fact_id = p_fact_id;

  RETURN jsonb_build_object(
    'mastery_score', v_score,
    'mastered', v_score >= v_threshold,
    'consecutive_correct', v_consecutive,
    'times_tested', v_tested,
    'times_correct', v_correct_count
  );
END;
$$ LANGUAGE plpgsql;

-- ============================================================
-- 11. RLS Policies
-- ============================================================

-- Exam content: public read, service_role write
ALTER TABLE exam_papers ENABLE ROW LEVEL SECURITY;
ALTER TABLE exam_questions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "public_read_exam_papers" ON exam_papers FOR SELECT USING (true);
CREATE POLICY "service_write_exam_papers" ON exam_papers FOR ALL USING (auth.role() = 'service_role');

CREATE POLICY "public_read_exam_questions" ON exam_questions FOR SELECT USING (true);
CREATE POLICY "service_write_exam_questions" ON exam_questions FOR ALL USING (auth.role() = 'service_role');

-- Student data: public read (single user), service_role write
ALTER TABLE students ENABLE ROW LEVEL SECURITY;
ALTER TABLE study_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE student_fact_mastery ENABLE ROW LEVEL SECURITY;
ALTER TABLE student_topic_mastery ENABLE ROW LEVEL SECURITY;
ALTER TABLE flashcard_attempts ENABLE ROW LEVEL SECURITY;
ALTER TABLE quiz_attempts ENABLE ROW LEVEL SECURITY;
ALTER TABLE study_suggestions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "public_read_students" ON students FOR SELECT USING (true);
CREATE POLICY "service_write_students" ON students FOR ALL USING (auth.role() = 'service_role');

CREATE POLICY "public_read_study_sessions" ON study_sessions FOR SELECT USING (true);
CREATE POLICY "service_write_study_sessions" ON study_sessions FOR ALL USING (auth.role() = 'service_role');

CREATE POLICY "public_read_sfm" ON student_fact_mastery FOR SELECT USING (true);
CREATE POLICY "service_write_sfm" ON student_fact_mastery FOR ALL USING (auth.role() = 'service_role');

CREATE POLICY "public_read_stm" ON student_topic_mastery FOR SELECT USING (true);
CREATE POLICY "service_write_stm" ON student_topic_mastery FOR ALL USING (auth.role() = 'service_role');

CREATE POLICY "public_read_fa" ON flashcard_attempts FOR SELECT USING (true);
CREATE POLICY "service_write_fa" ON flashcard_attempts FOR ALL USING (auth.role() = 'service_role');

CREATE POLICY "public_read_qa" ON quiz_attempts FOR SELECT USING (true);
CREATE POLICY "service_write_qa" ON quiz_attempts FOR ALL USING (auth.role() = 'service_role');

CREATE POLICY "public_read_sug" ON study_suggestions FOR SELECT USING (true);
CREATE POLICY "service_write_sug" ON study_suggestions FOR ALL USING (auth.role() = 'service_role');

-- ============================================================
-- 12. Verify
-- ============================================================
SELECT 'students' AS tbl, count(*) FROM students
UNION ALL
SELECT 'exam_papers', count(*) FROM exam_papers
UNION ALL
SELECT 'exam_questions', count(*) FROM exam_questions
UNION ALL
SELECT 'study_sessions', count(*) FROM study_sessions
UNION ALL
SELECT 'student_fact_mastery', count(*) FROM student_fact_mastery
UNION ALL
SELECT 'student_topic_mastery', count(*) FROM student_topic_mastery
UNION ALL
SELECT 'flashcard_attempts', count(*) FROM flashcard_attempts
UNION ALL
SELECT 'quiz_attempts', count(*) FROM quiz_attempts
UNION ALL
SELECT 'study_suggestions', count(*) FROM study_suggestions;
