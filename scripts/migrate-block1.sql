-- ============================================================
-- CLIP Tutor — Block 1: Knowledge Base Schema
-- Run this in Supabase SQL Editor (Dashboard > SQL Editor)
-- ============================================================

-- 1. Subjects table
CREATE TABLE IF NOT EXISTS subjects (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text UNIQUE NOT NULL,
  name text NOT NULL,
  created_at timestamptz DEFAULT now()
);

-- 2. Syllabus topics table
CREATE TABLE IF NOT EXISTS syllabus_topics (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  subject_id uuid NOT NULL REFERENCES subjects(id) ON DELETE CASCADE,
  topic_code text NOT NULL,
  topic_name text NOT NULL,
  description text,
  display_order integer NOT NULL DEFAULT 0,
  created_at timestamptz DEFAULT now(),
  UNIQUE (subject_id, topic_code)
);

CREATE INDEX IF NOT EXISTS idx_syllabus_topics_subject ON syllabus_topics(subject_id);

-- 3. Add syllabus_topic_id FK to existing atomic_facts
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'atomic_facts' AND column_name = 'syllabus_topic_id'
  ) THEN
    ALTER TABLE atomic_facts ADD COLUMN syllabus_topic_id uuid REFERENCES syllabus_topics(id) ON DELETE SET NULL;
    CREATE INDEX idx_atomic_facts_syllabus_topic ON atomic_facts(syllabus_topic_id);
  END IF;
END $$;

-- ============================================================
-- SEED: 8 subjects
-- ============================================================
INSERT INTO subjects (code, name) VALUES
  ('0620', 'Chemistry'),
  ('0625', 'Physics'),
  ('0610', 'Biology'),
  ('0478', 'Computer Science'),
  ('0500', 'English Language'),
  ('0475', 'English Literature'),
  ('0520', 'French'),
  ('0504', 'Portuguese')
ON CONFLICT (code) DO NOTHING;

-- ============================================================
-- SEED: Syllabus topics
-- ============================================================

-- Chemistry (12)
INSERT INTO syllabus_topics (subject_id, topic_code, topic_name, display_order)
SELECT s.id, v.code, v.name, v.ord FROM subjects s,
(VALUES
  ('CHEM_T1','States of matter',1),('CHEM_T2','Atoms, electrons and compounds',2),
  ('CHEM_T3','Stoichiometry',3),('CHEM_T4','Electrochemistry',4),
  ('CHEM_T5','Chemical energetics',5),('CHEM_T6','Chemical reactions',6),
  ('CHEM_T7','Acids, bases and salts',7),('CHEM_T8','The periodic table',8),
  ('CHEM_T9','Metals',9),('CHEM_T10','Chemistry of the environment',10),
  ('CHEM_T11','Organic chemistry',11),('CHEM_T12','Experimental techniques and chemical analysis',12)
) AS v(code, name, ord) WHERE s.code = '0620'
ON CONFLICT (subject_id, topic_code) DO NOTHING;

-- Physics (6)
INSERT INTO syllabus_topics (subject_id, topic_code, topic_name, display_order)
SELECT s.id, v.code, v.name, v.ord FROM subjects s,
(VALUES
  ('PHYS_T1','Motion, forces, and energy',1),('PHYS_T2','Thermal physics',2),
  ('PHYS_T3','Waves',3),('PHYS_T4','Electricity and magnetism',4),
  ('PHYS_T5','Nuclear physics',5),('PHYS_T6','Space physics',6)
) AS v(code, name, ord) WHERE s.code = '0625'
ON CONFLICT (subject_id, topic_code) DO NOTHING;

-- Biology (21)
INSERT INTO syllabus_topics (subject_id, topic_code, topic_name, display_order)
SELECT s.id, v.code, v.name, v.ord FROM subjects s,
(VALUES
  ('BIO_T1','Characteristics and classification of living organisms',1),
  ('BIO_T2','Organisation of the organism',2),
  ('BIO_T3','Movement into and out of the cells',3),
  ('BIO_T4','Biological molecules',4),('BIO_T5','Enzymes',5),
  ('BIO_T6','Plant nutrition',6),('BIO_T7','Human nutrition',7),
  ('BIO_T8','Transport in plants',8),('BIO_T9','Transport in humans',9),
  ('BIO_T10','Diseases and immunity',10),('BIO_T11','Gas exchange in humans',11),
  ('BIO_T12','Respiration',12),('BIO_T13','Excretion in humans',13),
  ('BIO_T14','Coordination and response',14),('BIO_T15','Drugs',15),
  ('BIO_T16','Reproduction',16),('BIO_T17','Inheritance',17),
  ('BIO_T18','Variation and selection',18),('BIO_T19','Organisms and their environment',19),
  ('BIO_T20','Human influence on ecosystems',20),('BIO_T21','Biotechnology and genetic modification',21)
) AS v(code, name, ord) WHERE s.code = '0610'
ON CONFLICT (subject_id, topic_code) DO NOTHING;

-- Computer Science (10)
INSERT INTO syllabus_topics (subject_id, topic_code, topic_name, display_order)
SELECT s.id, v.code, v.name, v.ord FROM subjects s,
(VALUES
  ('CS_T1','Data representation',1),('CS_T2','Data transmission',2),
  ('CS_T3','Hardware',3),('CS_T4','Software',4),
  ('CS_T5','The internet and its uses',5),('CS_T6','Automated and emerging technologies',6),
  ('CS_T7','Algorithm design and problem-solving',7),('CS_T8','Programming',8),
  ('CS_T9','Databases',9),('CS_T10','Boolean logic',10)
) AS v(code, name, ord) WHERE s.code = '0478'
ON CONFLICT (subject_id, topic_code) DO NOTHING;

-- English Language (12)
INSERT INTO syllabus_topics (subject_id, topic_code, topic_name, display_order)
SELECT s.id, v.code, v.name, v.ord FROM subjects s,
(VALUES
  ('ENGLANG_T1','Reading skills and comprehension',1),
  ('ENGLANG_T2','Writing purpose, audience and form',2),
  ('ENGLANG_T3','Text types and conventions',3),
  ('ENGLANG_T4','Language devices and figurative language',4),
  ('ENGLANG_T5','Persuasive and rhetorical techniques',5),
  ('ENGLANG_T6','Narrative writing techniques',6),
  ('ENGLANG_T7','Descriptive writing techniques',7),
  ('ENGLANG_T8','Grammar and sentence structure',8),
  ('ENGLANG_T9','Punctuation',9),
  ('ENGLANG_T10','Vocabulary and word choice',10),
  ('ENGLANG_T11','Command words',11),
  ('ENGLANG_T12','Spelling and common errors',12)
) AS v(code, name, ord) WHERE s.code = '0500'
ON CONFLICT (subject_id, topic_code) DO NOTHING;

-- English Literature (11)
INSERT INTO syllabus_topics (subject_id, topic_code, topic_name, display_order)
SELECT s.id, v.code, v.name, v.ord FROM subjects s,
(VALUES
  ('ENGLIT_T1','Poetry — Form and Structure',1),
  ('ENGLIT_T2','Poetry — Rhythm, Metre and Sound',2),
  ('ENGLIT_T3','Poetry — Language and Imagery',3),
  ('ENGLIT_T4','Prose — Narrative Techniques',4),
  ('ENGLIT_T5','Prose — Character, Setting and Theme',5),
  ('ENGLIT_T6','Drama — Form and Conventions',6),
  ('ENGLIT_T7','Drama — Language and Staging',7),
  ('ENGLIT_T8','Unseen Text Analysis',8),
  ('ENGLIT_T9','Literary Essay Skills',9),
  ('ENGLIT_T10','Context, Genre and Literary Tradition',10),
  ('ENGLIT_T11','Writer''s Methods and Effects',11)
) AS v(code, name, ord) WHERE s.code = '0475'
ON CONFLICT (subject_id, topic_code) DO NOTHING;

-- French (16)
INSERT INTO syllabus_topics (subject_id, topic_code, topic_name, display_order)
SELECT s.id, v.code, v.name, v.ord FROM subjects s,
(VALUES
  ('FR_T1','Articles et noms',1),('FR_T2','Adjectifs',2),
  ('FR_T3','Pronoms',3),('FR_T4','Présent et impératif',4),
  ('FR_T5','Temps du passé',5),('FR_T6','Futur, conditionnel et autres temps',6),
  ('FR_T7','Négation et interrogation',7),('FR_T8','Prépositions, conjonctions et connecteurs',8),
  ('FR_T9','Adverbes et expressions',9),('FR_T10','La vie quotidienne',10),
  ('FR_T11','La vie personnelle et sociale',11),('FR_T12','Le monde qui nous entoure',12),
  ('FR_T13','Le monde du travail',13),('FR_T14','Le monde international',14),
  ('FR_T15','Verbes et expressions clés',15),('FR_T16','Compétences d''écriture',16)
) AS v(code, name, ord) WHERE s.code = '0520'
ON CONFLICT (subject_id, topic_code) DO NOTHING;

-- Portuguese (12)
INSERT INTO syllabus_topics (subject_id, topic_code, topic_name, display_order)
SELECT s.id, v.code, v.name, v.ord FROM subjects s,
(VALUES
  ('PORT_T1','Competências de leitura e compreensão',1),
  ('PORT_T2','Finalidade, público e forma da escrita',2),
  ('PORT_T3','Tipos de texto e convenções',3),
  ('PORT_T4','Recursos de linguagem e linguagem figurativa',4),
  ('PORT_T5','Técnicas de persuasão e retórica',5),
  ('PORT_T6','Técnicas de escrita narrativa',6),
  ('PORT_T7','Técnicas de escrita descritiva',7),
  ('PORT_T8','Gramática e estrutura frásica',8),
  ('PORT_T9','Pontuação',9),
  ('PORT_T10','Vocabulário e escolha lexical',10),
  ('PORT_T11','Acentuação e ortografia',11),
  ('PORT_T12','Escrita discursiva e argumentativa',12)
) AS v(code, name, ord) WHERE s.code = '0504'
ON CONFLICT (subject_id, topic_code) DO NOTHING;

-- ============================================================
-- LINK atomic_facts → syllabus_topics
-- ============================================================

-- Chemistry (CHEM_T*)
UPDATE atomic_facts af
SET syllabus_topic_id = st.id
FROM syllabus_topics st JOIN subjects s ON st.subject_id = s.id
WHERE af.subject_code = '0620' AND s.code = '0620'
  AND st.topic_code = split_part(af.topic_id, '_', 1) || '_' || split_part(af.topic_id, '_', 2);

-- Physics (PHYS_T*)
UPDATE atomic_facts af
SET syllabus_topic_id = st.id
FROM syllabus_topics st JOIN subjects s ON st.subject_id = s.id
WHERE af.subject_code = '0625' AND s.code = '0625'
  AND st.topic_code = split_part(af.topic_id, '_', 1) || '_' || split_part(af.topic_id, '_', 2);

-- Biology (BIO_T*)
UPDATE atomic_facts af
SET syllabus_topic_id = st.id
FROM syllabus_topics st JOIN subjects s ON st.subject_id = s.id
WHERE af.subject_code = '0610' AND s.code = '0610'
  AND st.topic_code = split_part(af.topic_id, '_', 1) || '_' || split_part(af.topic_id, '_', 2);

-- CS (numeric → CS_T*)
UPDATE atomic_facts af
SET syllabus_topic_id = st.id
FROM syllabus_topics st JOIN subjects s ON st.subject_id = s.id
WHERE af.subject_code = '0478' AND s.code = '0478'
  AND st.topic_code = 'CS_T' || af.topic_id;

-- English Language (numeric → ENGLANG_T*)
UPDATE atomic_facts af
SET syllabus_topic_id = st.id
FROM syllabus_topics st JOIN subjects s ON st.subject_id = s.id
WHERE af.subject_code = '0500' AND s.code = '0500'
  AND st.topic_code = 'ENGLANG_T' || af.topic_id;

-- English Literature (numeric → ENGLIT_T*)
UPDATE atomic_facts af
SET syllabus_topic_id = st.id
FROM syllabus_topics st JOIN subjects s ON st.subject_id = s.id
WHERE af.subject_code = '0475' AND s.code = '0475'
  AND st.topic_code = 'ENGLIT_T' || af.topic_id;

-- French (numeric → FR_T*)
UPDATE atomic_facts af
SET syllabus_topic_id = st.id
FROM syllabus_topics st JOIN subjects s ON st.subject_id = s.id
WHERE af.subject_code = '0520' AND s.code = '0520'
  AND st.topic_code = 'FR_T' || af.topic_id;

-- Portuguese (numeric → PORT_T*)
UPDATE atomic_facts af
SET syllabus_topic_id = st.id
FROM syllabus_topics st JOIN subjects s ON st.subject_id = s.id
WHERE af.subject_code = '0504' AND s.code = '0504'
  AND st.topic_code = 'PORT_T' || af.topic_id;

-- ============================================================
-- RLS
-- ============================================================
ALTER TABLE subjects ENABLE ROW LEVEL SECURITY;
ALTER TABLE syllabus_topics ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow public read on subjects" ON subjects FOR SELECT USING (true);
CREATE POLICY "Allow service role full access on subjects" ON subjects FOR ALL USING (auth.role() = 'service_role');

CREATE POLICY "Allow public read on syllabus_topics" ON syllabus_topics FOR SELECT USING (true);
CREATE POLICY "Allow service role full access on syllabus_topics" ON syllabus_topics FOR ALL USING (auth.role() = 'service_role');

-- ============================================================
-- Verify
-- ============================================================
SELECT 'subjects' as tbl, count(*) FROM subjects
UNION ALL
SELECT 'syllabus_topics', count(*) FROM syllabus_topics
UNION ALL
SELECT 'facts_linked', count(*) FROM atomic_facts WHERE syllabus_topic_id IS NOT NULL
UNION ALL
SELECT 'facts_unlinked', count(*) FROM atomic_facts WHERE syllabus_topic_id IS NULL;
