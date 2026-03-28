import os
"""Migrate atomic facts from local cache to new Supabase project."""
import json
import urllib.request
import sys

NEW_URL = "https://lltcfjmshnhfmavlxpxr.supabase.co"
NEW_KEY = os.environ["SUPABASE_SERVICE_ROLE_KEY"]
MGMT_TOKEN = os.environ["SUPABASE_ACCESS_TOKEN"]
MGMT_API = "https://api.supabase.com/v1/projects/lltcfjmshnhfmavlxpxr/database/query"

CACHE = r"c:\Users\sarma\OneDrive\Ambiente de Trabalho\tutor final\data\extracted\atomic_facts_cache.json"

# Topic code mapping: for subjects with numeric topic_ids
TOPIC_PREFIX = {
    "0478": "CS_T",
    "0500": "ENGLANG_T",
    "0475": "ENGLIT_T",
    "0520": "FR_T",
    "0504": "PORT_T",
}

def run_sql(sql):
    data = json.dumps({"query": sql}).encode("utf-8")
    req = urllib.request.Request(MGMT_API, data=data, method="POST", headers={
        "Authorization": f"Bearer {MGMT_TOKEN}",
        "Content-Type": "application/json",
        "User-Agent": "supabase-cli/2.84.4",
    })
    try:
        resp = urllib.request.urlopen(req)
        return json.loads(resp.read().decode("utf-8"))
    except urllib.error.HTTPError as e:
        body = e.read().decode("utf-8")
        print(f"HTTP {e.code}: {body[:300]}")
        raise

def get_topic_map():
    """Get mapping from topic_code -> syllabus_topic uuid."""
    rows = run_sql("SELECT id, topic_code FROM syllabus_topics;")
    return {r["topic_code"]: r["id"] for r in rows}

def main():
    sys.stdout.reconfigure(encoding="utf-8")

    with open(CACHE, encoding="utf-8") as f:
        facts = json.load(f)

    print(f"Loaded {len(facts)} facts from cache")

    topic_map = get_topic_map()
    print(f"Got {len(topic_map)} topic mappings")

    # Prepare facts with syllabus_topic_id
    batch = []
    linked = 0
    for fact in facts:
        subject_code = fact["subject_code"]
        topic_id = fact["topic_id"]

        # Determine canonical topic code
        if subject_code in TOPIC_PREFIX:
            canonical = TOPIC_PREFIX[subject_code] + topic_id
        else:
            # Already prefixed (CHEM_T1_2 -> CHEM_T1, PHYS_T3_1 -> PHYS_T3)
            parts = topic_id.split("_")
            canonical = parts[0] + "_" + parts[1] if len(parts) >= 2 else topic_id

        syllabus_id = topic_map.get(canonical)
        if syllabus_id:
            linked += 1

        batch.append({
            "id": fact["id"],
            "subject_code": subject_code,
            "topic_id": topic_id,
            "topic_name": fact["topic_name"],
            "fact_text": fact["fact_text"],
            "core_or_extended": fact.get("core_or_extended", "core"),
            "prerequisites": json.dumps(fact.get("prerequisites", [])),
            "command_words": json.dumps(fact.get("command_words", [])),
            "has_formula": fact.get("has_formula", False),
            "formula_latex": fact.get("formula_latex"),
            "difficulty": fact.get("difficulty", 1),
            "is_active": fact.get("is_active", True),
            "flashcard_front": fact.get("flashcard_front"),
            "year": fact.get("year"),
            "syllabus_topic_id": syllabus_id,
        })

    print(f"Linked {linked}/{len(batch)} facts to topics")

    # Insert in batches of 50 via SQL
    BATCH_SIZE = 50
    inserted = 0
    for i in range(0, len(batch), BATCH_SIZE):
        chunk = batch[i:i+BATCH_SIZE]
        values = []
        for f in chunk:
            ft = f["fact_text"].replace("'", "''")
            tn = f["topic_name"].replace("'", "''")
            ff = (f["flashcard_front"] or "").replace("'", "''")
            fl = (f["formula_latex"] or "").replace("'", "''")
            tid = f["topic_id"].replace("'", "''")
            fid = f["id"].replace("'", "''")

            syllabus_val = f"'{f['syllabus_topic_id']}'" if f["syllabus_topic_id"] else "NULL"
            formula_val = f"'{fl}'" if f["formula_latex"] else "NULL"
            flash_val = f"'{ff}'" if f["flashcard_front"] else "NULL"
            year_val = str(f["year"]) if f["year"] else "NULL"

            values.append(
                f"('{fid}', '{f['subject_code']}', '{tid}', '{tn}', '{ft}', "
                f"'{f['core_or_extended']}', '{f['prerequisites']}'::jsonb, '{f['command_words']}'::jsonb, "
                f"{str(f['has_formula']).lower()}, {formula_val}, {f['difficulty']}, "
                f"{str(f['is_active']).lower()}, {flash_val}, {year_val}, {syllabus_val})"
            )

        sql = (
            "INSERT INTO atomic_facts (id, subject_code, topic_id, topic_name, fact_text, "
            "core_or_extended, prerequisites, command_words, has_formula, formula_latex, "
            "difficulty, is_active, flashcard_front, year, syllabus_topic_id) VALUES "
            + ", ".join(values)
            + " ON CONFLICT (id) DO NOTHING;"
        )

        try:
            run_sql(sql)
            inserted += len(chunk)
            if (i // BATCH_SIZE) % 5 == 0:
                print(f"  Inserted {inserted}/{len(batch)}...")
        except Exception as e:
            print(f"  ERROR at batch {i}: {str(e)[:200]}")
            # Try one by one for this batch
            for f_single in chunk:
                try:
                    ft = f_single["fact_text"].replace("'", "''")
                    tn = f_single["topic_name"].replace("'", "''")
                    ff = (f_single["flashcard_front"] or "").replace("'", "''")
                    fl = (f_single["formula_latex"] or "").replace("'", "''")
                    tid = f_single["topic_id"].replace("'", "''")
                    fid = f_single["id"].replace("'", "''")
                    syllabus_val = f"'{f_single['syllabus_topic_id']}'" if f_single["syllabus_topic_id"] else "NULL"
                    formula_val = f"'{fl}'" if f_single["formula_latex"] else "NULL"
                    flash_val = f"'{ff}'" if f_single["flashcard_front"] else "NULL"
                    year_val = str(f_single["year"]) if f_single["year"] else "NULL"

                    single_sql = (
                        f"INSERT INTO atomic_facts (id, subject_code, topic_id, topic_name, fact_text, "
                        f"core_or_extended, prerequisites, command_words, has_formula, formula_latex, "
                        f"difficulty, is_active, flashcard_front, year, syllabus_topic_id) VALUES "
                        f"('{fid}', '{f_single['subject_code']}', '{tid}', '{tn}', '{ft}', "
                        f"'{f_single['core_or_extended']}', '{f_single['prerequisites']}'::jsonb, '{f_single['command_words']}'::jsonb, "
                        f"{str(f_single['has_formula']).lower()}, {formula_val}, {f_single['difficulty']}, "
                        f"{str(f_single['is_active']).lower()}, {flash_val}, {year_val}, {syllabus_val})"
                        f" ON CONFLICT (id) DO NOTHING;"
                    )
                    run_sql(single_sql)
                    inserted += 1
                except Exception as e2:
                    print(f"    SKIP {f_single['id']}: {str(e2)[:100]}")

    print(f"\nDone! Inserted {inserted} facts total")

    # Verify
    result = run_sql("SELECT count(*) as total, count(syllabus_topic_id) as linked FROM atomic_facts;")
    print(f"Verification: {result}")

if __name__ == "__main__":
    main()
