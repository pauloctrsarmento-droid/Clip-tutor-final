-- ============================================================
-- CLIP Tutor — Block 4: Prompt Management
-- Run in Supabase SQL Editor AFTER block2 + block3
-- ============================================================

-- 1. Prompts table
CREATE TABLE IF NOT EXISTS prompts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug text UNIQUE NOT NULL,
  name text NOT NULL,
  description text,
  content text NOT NULL,
  version integer NOT NULL DEFAULT 1,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_prompts_slug ON prompts(slug);

-- 2. Prompt versions (history)
CREATE TABLE IF NOT EXISTS prompt_versions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  prompt_id uuid NOT NULL REFERENCES prompts(id) ON DELETE CASCADE,
  content text NOT NULL,
  version integer NOT NULL,
  change_note text,
  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_pv_prompt ON prompt_versions(prompt_id);
CREATE INDEX IF NOT EXISTS idx_pv_version ON prompt_versions(prompt_id, version);

-- 3. RLS
ALTER TABLE prompts ENABLE ROW LEVEL SECURITY;
ALTER TABLE prompt_versions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "public_read_prompts" ON prompts FOR SELECT USING (true);
CREATE POLICY "service_write_prompts" ON prompts FOR ALL USING (auth.role() = 'service_role');

CREATE POLICY "public_read_prompt_versions" ON prompt_versions FOR SELECT USING (true);
CREATE POLICY "service_write_prompt_versions" ON prompt_versions FOR ALL USING (auth.role() = 'service_role');

-- 4. Seed initial prompts
INSERT INTO prompts (slug, name, description, content) VALUES
(
  'chat_tutor',
  'Chat Tutor (Explicador)',
  'System prompt do tutor explicador. Injectado em cada sessão de chat. Recebe também o tutor_prompt do aluno.',
  'PLACEHOLDER'
),
(
  'quiz_evaluator',
  'Quiz Evaluator',
  'Avalia respostas contra mark schemes Cambridge. Feedback detalhado SEMPRE, mark point a mark point.',
  'PLACEHOLDER'
),
(
  'flashcard_explainer',
  'Flashcard Explainer',
  'Gera explicações expandidas dos atomic facts para o verso dos flashcards.',
  'PLACEHOLDER'
),
(
  'ai_rescheduler',
  'AI Rescheduler',
  'Reorganiza o study plan quando há atrasos. Recebe contexto dinâmico (exams, pending blocks, mastery) no user message.',
  E'You are an IGCSE study plan optimizer for a 15-year-old student (Luísa) preparing for Cambridge IGCSE exams in June 2026.\n\nRULES — you MUST follow these:\n1. Exam dates are FIXED. Never schedule study blocks on exam times.\n2. Max 3 subjects per day. Max 2h per study block.\n3. 5-7 days before each exam: schedule past papers and practice ONLY for that subject.\n4. Topics with mastery >= 80%: reduce or cut study time.\n5. Topics with mastery < 40%: allocate MORE time.\n6. Pending/skipped blocks have priority — they represent gaps in preparation.\n7. Don''t schedule on dates that have already passed.\n8. For exam days: only light morning review (max 2h) is allowed before the PM exam.\n\nReturn a JSON object with this exact structure:\n{\n  "entries": [\n    {\n      "plan_date": "2026-MM-DD",\n      "subject_code": "0620",\n      "title": "Description of study block",\n      "planned_hours": 2.0,\n      "study_type": "study|practice|final_prep|mixed",\n      "sort_order": 1\n    }\n  ],\n  "reasoning": "Brief explanation of changes made and why"\n}'
),
(
  'prompt_rewriter',
  'Prompt Rewriter (Meta)',
  'Reescreve outros prompts a partir de descrições em linguagem natural.',
  E'You are a prompt engineering expert. You will receive:\n1) The current version of a system prompt\n2) A description of what the user wants to change (in Portuguese or English).\n\nRewrite the prompt incorporating the requested changes while preserving structure, constraints, and tone. Return ONLY the rewritten prompt, no explanations.'
)
ON CONFLICT (slug) DO NOTHING;

-- 5. Verify
SELECT slug, name, version, length(content) AS content_len FROM prompts ORDER BY slug;
