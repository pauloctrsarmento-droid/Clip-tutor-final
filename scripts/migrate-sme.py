"""
Migrate SaveMyExams questions into Supabase exam_questions table.

Steps:
1. Add difficulty + source columns (if not exist)
2. Mark old questions as inactive (source='cambridge_pdf') for SME subjects
3. Create virtual paper_ids for SME data
4. Transform & insert SME questions
5. Map topics to existing syllabus_topics

Usage: python scripts/migrate-sme.py
"""

import json
import os
import re
import sys
from pathlib import Path
from supabase import create_client

# ── Config ──────────────────────────────────────────────────
ROOT = Path(__file__).resolve().parent.parent
SME_DIR = ROOT / "data" / "savemyexams"

SUPABASE_URL = os.environ.get("SUPABASE_URL", "https://lltcfjmshnhfmavlxpxr.supabase.co")
SUPABASE_KEY = os.environ.get("SUPABASE_SERVICE_KEY", "")

# Load from .env.local if not in env
if not SUPABASE_KEY:
    env_path = ROOT / "web" / ".env.local"
    if env_path.exists():
        for line in env_path.read_text().splitlines():
            if line.startswith("SUPABASE_SERVICE_ROLE_KEY="):
                SUPABASE_KEY = line.split("=", 1)[1].strip()

if not SUPABASE_KEY:
    print("ERROR: SUPABASE_SERVICE_ROLE_KEY not found")
    sys.exit(1)

supabase = create_client(SUPABASE_URL, SUPABASE_KEY)

# Subject code mapping
SME_FILES = {
    "0625": SME_DIR / "physics" / "sme_physics.json",
    "0620": SME_DIR / "chemistry_sme.json",
    "0610": SME_DIR / "biology_sme.json",
    "0478": SME_DIR / "cs_sme.json",
    "0475": SME_DIR / "eng_lit_sme.json",
}

# ── Step 1: Schema migration ───────────────────────────────
def migrate_schema():
    """Add difficulty and source columns if they don't exist."""
    print("Step 1: Migrating schema...")

    sql = """
    DO $$
    BEGIN
        IF NOT EXISTS (
            SELECT 1 FROM information_schema.columns
            WHERE table_name = 'exam_questions' AND column_name = 'difficulty'
        ) THEN
            ALTER TABLE exam_questions ADD COLUMN difficulty text DEFAULT 'medium';
        END IF;

        IF NOT EXISTS (
            SELECT 1 FROM information_schema.columns
            WHERE table_name = 'exam_questions' AND column_name = 'source'
        ) THEN
            ALTER TABLE exam_questions ADD COLUMN source text DEFAULT 'cambridge_pdf';
        END IF;

        IF NOT EXISTS (
            SELECT 1 FROM information_schema.columns
            WHERE table_name = 'exam_questions' AND column_name = 'source_id'
        ) THEN
            ALTER TABLE exam_questions ADD COLUMN source_id text;
        END IF;

        IF NOT EXISTS (
            SELECT 1 FROM information_schema.columns
            WHERE table_name = 'exam_questions' AND column_name = 'diagram_urls'
        ) THEN
            ALTER TABLE exam_questions ADD COLUMN diagram_urls jsonb DEFAULT '[]'::jsonb;
        END IF;
    END $$;

    CREATE INDEX IF NOT EXISTS idx_eq_difficulty ON exam_questions(difficulty);
    CREATE INDEX IF NOT EXISTS idx_eq_source ON exam_questions(source);
    """

    supabase.rpc("exec_sql", {"query": sql}).execute()
    print("  ✓ Schema updated")


def migrate_schema_direct():
    """Add columns using individual ALTER TABLE statements via Supabase."""
    print("Step 1: Migrating schema...")

    # We'll use the REST API to add columns
    # First check if columns exist
    result = supabase.table("exam_questions").select("id").limit(1).execute()

    # Try adding columns - they'll fail silently if they exist
    for col, default in [
        ("difficulty", "'medium'"),
        ("source", "'cambridge_pdf'"),
        ("source_id", "NULL"),
        ("diagram_urls", "'[]'::jsonb"),
    ]:
        try:
            # We can't run raw SQL easily, so we'll handle this in the ingest
            pass
        except Exception:
            pass

    print("  ✓ Schema check done (run ALTER TABLE manually if needed)")


# ── Step 2: Deactivate old questions ───────────────────────
def deactivate_old_questions(subject_codes: list[str]):
    """Mark old PDF-extracted questions as inactive for subjects being replaced."""
    print("Step 2: Deactivating old questions...")

    for code in subject_codes:
        # Set evaluation_ready = false for old questions
        result = supabase.table("exam_questions") \
            .update({"evaluation_ready": False}) \
            .eq("subject_code", code) \
            .is_("source", "null") \
            .execute()

        # Also try where source is cambridge_pdf
        result2 = supabase.table("exam_questions") \
            .update({"evaluation_ready": False}) \
            .eq("subject_code", code) \
            .neq("source", "sme") \
            .execute()

        count = len(result.data) + len(result2.data)
        print(f"  ✓ {code}: {count} old questions deactivated")


# ── Step 3: Create virtual papers for SME ──────────────────
def ensure_sme_papers(subject_code: str, topics: set[str]):
    """Create a virtual paper entry for SME questions."""
    paper_id = f"sme_{subject_code}"

    try:
        supabase.table("exam_papers").upsert({
            "id": paper_id,
            "subject_code": subject_code,
            "session": "sme",
            "variant": "00",
            "year": 2025,
            "total_questions": 0,
            "total_marks": 0,
        }).execute()
    except Exception:
        pass  # Already exists

    return paper_id


# ── Step 4: Load topic mapping ─────────────────────────────
def load_topic_map(subject_code: str) -> dict[str, str]:
    """Load syllabus_topics and create slug → uuid mapping."""
    result = supabase.table("syllabus_topics") \
        .select("id, topic_code, name") \
        .eq("subject_code", subject_code) \
        .execute()

    topic_map = {}
    for t in result.data:
        # Map by name similarity
        name_lower = t["name"].lower()
        topic_map[name_lower] = t["id"]
        # Also map by topic_code
        if t.get("topic_code"):
            topic_map[t["topic_code"].lower()] = t["id"]

    return topic_map


def find_best_topic(sme_topic: str, sme_slug: str, topic_map: dict) -> str | None:
    """Find the best matching syllabus_topic_id for an SME topic."""
    if not sme_topic:
        return None

    sme_lower = sme_topic.lower()

    # Direct match
    if sme_lower in topic_map:
        return topic_map[sme_lower]

    # Fuzzy match: find topic with most word overlap
    sme_words = set(sme_lower.split())
    best_match = None
    best_score = 0

    for key, tid in topic_map.items():
        key_words = set(key.split())
        overlap = len(sme_words & key_words)
        if overlap > best_score:
            best_score = overlap
            best_match = tid

    return best_match if best_score >= 2 else None


# ── Step 5: Transform & insert ─────────────────────────────
def clean_question_text(text: str) -> str:
    """Clean SME question text: convert [IMG:...] to clean format."""
    if not text:
        return ""

    # Remove [IMG:...|ALT:...] tags - images stored separately
    cleaned = re.sub(r'\[IMG:[^\]]+\]', '', text)

    # Clean up extra whitespace
    cleaned = re.sub(r'\n{3,}', '\n\n', cleaned).strip()

    return cleaned


def extract_image_urls(text: str) -> list[str]:
    """Extract image URLs from [IMG:url|ALT:text] format."""
    urls = []
    for match in re.finditer(r'\[IMG:(https?://[^\|]+)', text or ''):
        urls.append(match.group(1))
    return urls


def extract_correct_answer(answer_text: str, choices: list | None) -> str | None:
    """Extract correct MCQ answer letter from answer text."""
    if not answer_text:
        return None

    # Look for "The correct answer is X" or "correct answer is X"
    match = re.search(r'correct answer is\s*[:\s]*([A-D])', answer_text, re.IGNORECASE)
    if match:
        return match.group(1)

    # Look for "Answer: X"
    match = re.search(r'Answer:\s*([A-D])', answer_text)
    if match:
        return match.group(1)

    return None


def transform_sme_question(q: dict, paper_id: str, subject_code: str, topic_id: str | None, idx: int) -> dict:
    """Transform one SME question into an exam_questions row."""

    question_text = q.get("questionText", "")
    answer_text = q.get("answerText", "")

    # Extract images
    all_images = extract_image_urls(question_text) + extract_image_urls(answer_text)
    # Also from explicit images field
    all_images.extend(q.get("images", []))
    all_images = list(dict.fromkeys(all_images))  # deduplicate preserving order

    # Clean question text (remove IMG tags)
    clean_text = clean_question_text(question_text)

    # Determine response type
    sme_type = q.get("type", "theory")
    if sme_type == "multiple_choice" or q.get("questionType") == "multiple_choice":
        response_type = "mcq"
    elif "calculate" in clean_text.lower() or "how many" in clean_text.lower():
        response_type = "numeric"
    else:
        response_type = "text"

    # Build MCQ options as mark_scheme format "A: text\nB: text\n..."
    correct_answer = None
    mark_scheme = answer_text

    if response_type == "mcq" and q.get("choices"):
        options_text = ""
        for i, choice in enumerate(q["choices"]):
            letter = chr(65 + i)  # A, B, C, D
            choice_text = choice.get("text", "") if isinstance(choice, dict) else str(choice)
            options_text += f"{letter}: {choice_text}\n"

        # Extract correct answer
        correct_answer = q.get("correctChoice") or extract_correct_answer(answer_text, q.get("choices"))

        # Store options in mark_scheme for the quiz orchestrator to parse
        mark_scheme = options_text.strip() + "\n\n" + (answer_text or "")

    # Build unique ID
    q_id = q.get("id", f"sme_{subject_code}_{idx}")

    return {
        "id": q_id,
        "paper_id": paper_id,
        "subject_code": subject_code,
        "syllabus_topic_id": topic_id,
        "question_number": idx + 1,
        "part_label": None,
        "group_id": q.get("qId"),
        "question_text": clean_text,
        "parent_context": None,
        "marks": q.get("marks", 1) or 1,
        "correct_answer": correct_answer,
        "mark_scheme": mark_scheme,
        "mark_points": json.dumps([]),
        "question_type": "short",
        "response_type": response_type,
        "has_diagram": len(all_images) > 0,
        "fig_refs": json.dumps([]),
        "table_refs": json.dumps([]),
        "evaluation_ready": True,
        "is_stem": False,
        "part_order": 0,
        "sibling_count": 1,
        "difficulty": q.get("difficulty", "medium"),
        "source": "sme",
        "source_id": q.get("id"),
        "diagram_urls": json.dumps(all_images),
    }


def ingest_subject(subject_code: str, filepath: Path):
    """Ingest all SME questions for one subject."""
    print(f"\nIngesting {subject_code} from {filepath.name}...")

    with open(filepath, encoding="utf-8") as f:
        data = json.load(f)

    questions = data.get("questions", [])
    if not questions:
        print(f"  ⚠ No questions found in {filepath.name}")
        return

    print(f"  Found {len(questions)} question parts")

    # Create virtual paper
    paper_id = ensure_sme_papers(subject_code, set())

    # Load topic mapping
    topic_map = load_topic_map(subject_code)
    print(f"  Loaded {len(topic_map)} topic mappings")

    # Transform questions
    rows = []
    skipped = 0
    for i, q in enumerate(questions):
        # Skip empty questions
        if not q.get("questionText", "").strip():
            skipped += 1
            continue

        # Find topic
        topic_id = find_best_topic(q.get("topic", ""), q.get("slug", ""), topic_map)

        row = transform_sme_question(q, paper_id, subject_code, topic_id, i)
        rows.append(row)

    print(f"  Transformed {len(rows)} questions (skipped {skipped} empty)")

    # Insert in batches
    batch_size = 100
    inserted = 0
    for i in range(0, len(rows), batch_size):
        batch = rows[i:i + batch_size]
        try:
            supabase.table("exam_questions").upsert(batch).execute()
            inserted += len(batch)
            print(f"  Inserted batch {i // batch_size + 1}: {len(batch)} rows (total: {inserted})")
        except Exception as e:
            print(f"  ⚠ Error inserting batch {i // batch_size + 1}: {e}")
            # Try one by one
            for row in batch:
                try:
                    supabase.table("exam_questions").upsert(row).execute()
                    inserted += 1
                except Exception as e2:
                    print(f"    ✗ Failed: {row['id']}: {str(e2)[:80]}")

    print(f"  ✓ {inserted}/{len(rows)} questions inserted for {subject_code}")
    return inserted


# ── Main ───────────────────────────────────────────────────
def main():
    print("=" * 60)
    print("SaveMyExams → Supabase Migration")
    print("=" * 60)

    # Step 1: Schema
    # Note: Run this SQL manually in Supabase SQL Editor:
    print("\nStep 1: Schema migration")
    print("  Run this SQL in Supabase SQL Editor:")
    print("  ALTER TABLE exam_questions ADD COLUMN IF NOT EXISTS difficulty text DEFAULT 'medium';")
    print("  ALTER TABLE exam_questions ADD COLUMN IF NOT EXISTS source text DEFAULT 'cambridge_pdf';")
    print("  ALTER TABLE exam_questions ADD COLUMN IF NOT EXISTS source_id text;")
    print("  ALTER TABLE exam_questions ADD COLUMN IF NOT EXISTS diagram_urls jsonb DEFAULT '[]'::jsonb;")
    print("  CREATE INDEX IF NOT EXISTS idx_eq_difficulty ON exam_questions(difficulty);")
    print("  CREATE INDEX IF NOT EXISTS idx_eq_source ON exam_questions(source);")

    input("\n  Press Enter after running the SQL (or Ctrl+C to cancel)...")

    # Step 2: Deactivate old questions
    sme_subjects = list(SME_FILES.keys())
    deactivate_old_questions(sme_subjects)

    # Step 3-5: Ingest each subject
    total = 0
    for subject_code, filepath in SME_FILES.items():
        if not filepath.exists():
            print(f"\n⚠ File not found: {filepath}")
            continue
        count = ingest_subject(subject_code, filepath)
        total += count or 0

    print(f"\n{'=' * 60}")
    print(f"Migration complete! {total} questions inserted.")
    print(f"{'=' * 60}")

    # Verify
    print("\nVerification:")
    for code in sme_subjects:
        result = supabase.table("exam_questions") \
            .select("id", count="exact") \
            .eq("subject_code", code) \
            .eq("source", "sme") \
            .eq("evaluation_ready", True) \
            .execute()
        print(f"  {code}: {result.count} active SME questions")


if __name__ == "__main__":
    main()
