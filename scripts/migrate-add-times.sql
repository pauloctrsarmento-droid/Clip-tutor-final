-- ============================================================
-- Add start_time and end_time to study_plan_entries
-- Run this in Supabase SQL Editor
-- ============================================================

ALTER TABLE study_plan_entries
  ADD COLUMN IF NOT EXISTS start_time TIME,
  ADD COLUMN IF NOT EXISTS end_time TIME;

-- Verify
SELECT column_name, data_type
FROM information_schema.columns
WHERE table_name = 'study_plan_entries'
  AND column_name IN ('start_time', 'end_time');
