-- ============================================================
-- Migration: Multi-user auth with Supabase Auth
-- Adds auth_id + email to students, auto-provisioning trigger,
-- per-user RLS policies on student-data tables.
-- Backwards-compatible: supabaseAdmin (service_role) bypasses RLS.
-- ============================================================

-- 1. Add auth columns to students
ALTER TABLE students ADD COLUMN IF NOT EXISTS auth_id uuid UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE;
ALTER TABLE students ADD COLUMN IF NOT EXISTS email text;

-- 2. Auto-provisioning: create student row when a user signs up
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger AS $$
BEGIN
  INSERT INTO public.students (auth_id, name, email)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'name', split_part(NEW.email, '@', 1)),
    NEW.email
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- 3. Helper: get student_id from auth.uid()
CREATE OR REPLACE FUNCTION public.my_student_id()
RETURNS uuid AS $$
  SELECT id FROM public.students WHERE auth_id = auth.uid() LIMIT 1;
$$ LANGUAGE sql STABLE SECURITY DEFINER;

-- ============================================================
-- 4. Replace public_read policies with user-scoped policies
--    on student-data tables. Keep service_write policies.
-- ============================================================

-- students: can only see own profile
DROP POLICY IF EXISTS "public_read_students" ON students;
CREATE POLICY "student_read_own" ON students FOR SELECT
  USING (auth_id = auth.uid() OR auth.role() = 'service_role');

-- study_sessions
DROP POLICY IF EXISTS "public_read_study_sessions" ON study_sessions;
CREATE POLICY "student_read_own_sessions" ON study_sessions FOR SELECT
  USING (student_id = public.my_student_id() OR auth.role() = 'service_role');

-- student_fact_mastery
DROP POLICY IF EXISTS "public_read_sfm" ON student_fact_mastery;
CREATE POLICY "student_read_own_sfm" ON student_fact_mastery FOR SELECT
  USING (student_id = public.my_student_id() OR auth.role() = 'service_role');

-- student_topic_mastery
DROP POLICY IF EXISTS "public_read_stm" ON student_topic_mastery;
CREATE POLICY "student_read_own_stm" ON student_topic_mastery FOR SELECT
  USING (student_id = public.my_student_id() OR auth.role() = 'service_role');

-- flashcard_attempts
DROP POLICY IF EXISTS "public_read_fa" ON flashcard_attempts;
CREATE POLICY "student_read_own_fa" ON flashcard_attempts FOR SELECT
  USING (student_id = public.my_student_id() OR auth.role() = 'service_role');

-- quiz_attempts
DROP POLICY IF EXISTS "public_read_qa" ON quiz_attempts;
CREATE POLICY "student_read_own_qa" ON quiz_attempts FOR SELECT
  USING (student_id = public.my_student_id() OR auth.role() = 'service_role');

-- study_suggestions
DROP POLICY IF EXISTS "public_read_sug" ON study_suggestions;
CREATE POLICY "student_read_own_sug" ON study_suggestions FOR SELECT
  USING (student_id = public.my_student_id() OR auth.role() = 'service_role');

-- study_plan_entries
DROP POLICY IF EXISTS "public_read_study_plan" ON study_plan_entries;
CREATE POLICY "student_read_own_plan" ON study_plan_entries FOR SELECT
  USING (student_id = public.my_student_id() OR auth.role() = 'service_role');

-- exam_calendar
DROP POLICY IF EXISTS "public_read_exam_calendar" ON exam_calendar;
CREATE POLICY "student_read_own_calendar" ON exam_calendar FOR SELECT
  USING (student_id = public.my_student_id() OR auth.role() = 'service_role');

-- chat_messages (scoped via study_sessions FK)
DROP POLICY IF EXISTS "public_read_chat_messages" ON chat_messages;
CREATE POLICY "student_read_own_chat" ON chat_messages FOR SELECT
  USING (
    session_id IN (SELECT id FROM study_sessions WHERE student_id = public.my_student_id())
    OR auth.role() = 'service_role'
  );

-- tutor_memory
DROP POLICY IF EXISTS "public_read_tutor_memory" ON tutor_memory;
CREATE POLICY "student_read_own_memory" ON tutor_memory FOR SELECT
  USING (student_id = public.my_student_id() OR auth.role() = 'service_role');

-- question_exposure
DROP POLICY IF EXISTS "public_read_exposure" ON question_exposure;
CREATE POLICY "student_read_own_exposure" ON question_exposure FOR SELECT
  USING (student_id = public.my_student_id() OR auth.role() = 'service_role');

-- ============================================================
-- 5. Shared data tables stay public read (no changes needed):
--    subjects, syllabus_topics, atomic_facts, exam_papers,
--    exam_questions, prompts, prompt_versions
-- ============================================================

-- 6. Remove hardcoded DEFAULT UUID from student_id columns
ALTER TABLE study_sessions ALTER COLUMN student_id DROP DEFAULT;
ALTER TABLE student_fact_mastery ALTER COLUMN student_id DROP DEFAULT;
ALTER TABLE student_topic_mastery ALTER COLUMN student_id DROP DEFAULT;
ALTER TABLE flashcard_attempts ALTER COLUMN student_id DROP DEFAULT;
ALTER TABLE quiz_attempts ALTER COLUMN student_id DROP DEFAULT;
ALTER TABLE study_suggestions ALTER COLUMN student_id DROP DEFAULT;
ALTER TABLE study_plan_entries ALTER COLUMN student_id DROP DEFAULT;
ALTER TABLE exam_calendar ALTER COLUMN student_id DROP DEFAULT;
