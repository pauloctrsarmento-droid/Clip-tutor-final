-- ============================================================
-- CLIP Tutor — Block 3: Study Plan + Exam Calendar
-- Run this in Supabase SQL Editor AFTER migrate-block2.sql
-- Depends on: subjects, syllabus_topics, students
-- ============================================================

-- ============================================================
-- 1. Exam Calendar
-- ============================================================
CREATE TABLE IF NOT EXISTS exam_calendar (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id uuid NOT NULL DEFAULT '00000000-0000-0000-0000-000000000001'
    REFERENCES students(id) ON DELETE CASCADE,
  subject_code text NOT NULL,
  paper_name text NOT NULL,
  paper_code text NOT NULL,
  exam_date date NOT NULL,
  exam_time text NOT NULL DEFAULT 'PM',
  created_at timestamptz DEFAULT now(),
  UNIQUE (student_id, subject_code, paper_code)
);

CREATE INDEX IF NOT EXISTS idx_ec_student ON exam_calendar(student_id);
CREATE INDEX IF NOT EXISTS idx_ec_date ON exam_calendar(exam_date);

-- ============================================================
-- 2. Study Plan Entries
-- ============================================================
CREATE TABLE IF NOT EXISTS study_plan_entries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id uuid NOT NULL DEFAULT '00000000-0000-0000-0000-000000000001'
    REFERENCES students(id) ON DELETE CASCADE,
  plan_date date NOT NULL,
  subject_code text NOT NULL,
  title text NOT NULL,
  syllabus_topic_ids uuid[] DEFAULT '{}',
  planned_hours real NOT NULL,
  study_type text NOT NULL DEFAULT 'study',
  phase text NOT NULL DEFAULT 'full_time',
  status text NOT NULL DEFAULT 'pending',
  actual_date date,
  notes text,
  sort_order integer NOT NULL DEFAULT 1,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_spe_student ON study_plan_entries(student_id);
CREATE INDEX IF NOT EXISTS idx_spe_date ON study_plan_entries(plan_date);
CREATE INDEX IF NOT EXISTS idx_spe_status ON study_plan_entries(status);
CREATE INDEX IF NOT EXISTS idx_spe_subject ON study_plan_entries(subject_code);

-- ============================================================
-- 3. RLS
-- ============================================================
ALTER TABLE exam_calendar ENABLE ROW LEVEL SECURITY;
ALTER TABLE study_plan_entries ENABLE ROW LEVEL SECURITY;

CREATE POLICY "public_read_exam_calendar" ON exam_calendar FOR SELECT USING (true);
CREATE POLICY "service_write_exam_calendar" ON exam_calendar FOR ALL USING (auth.role() = 'service_role');

CREATE POLICY "public_read_study_plan" ON study_plan_entries FOR SELECT USING (true);
CREATE POLICY "service_write_study_plan" ON study_plan_entries FOR ALL USING (auth.role() = 'service_role');

-- ============================================================
-- 4. Seed Exam Calendar (16 exams from Statement of Entry)
-- ============================================================
INSERT INTO exam_calendar (subject_code, paper_name, paper_code, exam_date, exam_time) VALUES
  ('0520', 'Writing (Paper 41)', '41', '2026-04-24', 'PM'),
  ('0620', 'Theory Extended (Paper 41)', '41', '2026-04-28', 'PM'),
  ('0610', 'Theory Extended (Paper 41)', '41', '2026-04-30', 'PM'),
  ('0520', 'Reading (Paper 21)', '21', '2026-05-05', 'PM'),
  ('0620', 'Alternative to Practical (Paper 61)', '61', '2026-05-07', 'PM'),
  ('0625', 'Theory Extended (Paper 41)', '41', '2026-05-08', 'PM'),
  ('0610', 'Alternative to Practical (Paper 61)', '61', '2026-05-12', 'PM'),
  ('0478', 'Paper 1 — Computer Systems', '11', '2026-05-13', 'PM'),
  ('0625', 'Alternative to Practical (Paper 61)', '61', '2026-05-19', 'PM'),
  ('0478', 'Paper 2 — Programming', '21', '2026-05-20', 'PM'),
  ('0504', 'Paper 1 — Reading', '01', '2026-05-25', 'PM'),
  ('0504', 'Paper 2 — Writing', '02', '2026-05-28', 'PM'),
  ('0625', 'Multiple Choice Extended (Paper 21)', '21', '2026-06-03', 'PM'),
  ('0520', 'Listening (Paper 11)', '11', '2026-06-04', 'PM'),
  ('0610', 'Multiple Choice Extended (Paper 21)', '21', '2026-06-08', 'PM'),
  ('0620', 'Multiple Choice Extended (Paper 21)', '21', '2026-06-09', 'PM')
ON CONFLICT (student_id, subject_code, paper_code) DO NOTHING;

-- ============================================================
-- 5. Verify
-- ============================================================
SELECT 'exam_calendar' AS tbl, count(*) FROM exam_calendar
UNION ALL
SELECT 'study_plan_entries', count(*) FROM study_plan_entries;
