-- Migration 2: lock related_facts schema. NON-REVERTIBLE BY DESIGN.
-- Apply ONLY after Wave 5 Gate A passes (zero unlinked questions) and Gate K
-- passes (no systemically broken chunks).

-- ── Defense 1: every fact_id in related_facts points to an active atomic_fact ──
CREATE OR REPLACE FUNCTION check_related_facts_exist() RETURNS trigger AS $$
DECLARE
  _missing_count INTEGER;
  _missing_ids TEXT;
BEGIN
  IF TG_OP = 'UPDATE' AND OLD.related_facts IS NOT DISTINCT FROM NEW.related_facts THEN
    RETURN NEW;
  END IF;

  WITH refs AS (
    SELECT jsonb_array_elements_text(NEW.related_facts) AS _fact_id
  )
  SELECT count(*), string_agg(refs._fact_id, ', ')
    INTO _missing_count, _missing_ids
  FROM refs
  LEFT JOIN atomic_facts af
    ON af.id = refs._fact_id AND af.is_active
  WHERE af.id IS NULL;

  IF _missing_count > 0 THEN
    RAISE EXCEPTION
      'related_facts references unknown or inactive atomic_fact: %', _missing_ids;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS assessment_items_check_facts ON assessment_items;
CREATE TRIGGER assessment_items_check_facts
  BEFORE INSERT OR UPDATE OF related_facts ON assessment_items
  FOR EACH ROW EXECUTE FUNCTION check_related_facts_exist();

-- ── Defense 2: cannot soft-delete an atomic_fact still referenced by an approved item ──
CREATE OR REPLACE FUNCTION protect_referenced_atomic_facts() RETURNS trigger AS $$
DECLARE
  _ref_count INTEGER;
BEGIN
  IF TG_OP = 'UPDATE'
     AND OLD.is_active = true
     AND NEW.is_active = false
  THEN
    SELECT count(*) INTO _ref_count
    FROM assessment_items
    WHERE status = 'approved'
      AND related_facts ? OLD.id;

    IF _ref_count > 0 THEN
      RAISE EXCEPTION
        'cannot deactivate atomic_fact %: still referenced by % approved assessment_items.related_facts', OLD.id, _ref_count;
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS atomic_facts_protect_referenced ON atomic_facts;
CREATE TRIGGER atomic_facts_protect_referenced
  BEFORE UPDATE OF is_active ON atomic_facts
  FOR EACH ROW EXECUTE FUNCTION protect_referenced_atomic_facts();

-- ── Defense 3: NOT NULL + CHECK array-shape ──
-- CHECK constraints cannot contain subqueries, so element-type validation
-- (every element must be a string) is enforced inside the existence trigger above
-- — a non-string element would fail to match any atomic_facts.id and the trigger raises.
ALTER TABLE assessment_items
  ALTER COLUMN related_facts SET NOT NULL,
  ADD CONSTRAINT related_facts_non_empty CHECK (
    jsonb_typeof(related_facts) = 'array'
    AND jsonb_array_length(related_facts) >= 1
  );
