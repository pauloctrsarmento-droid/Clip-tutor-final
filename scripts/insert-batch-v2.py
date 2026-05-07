"""
Insert batch with full schema support: MCQ (mcq_options), figures (jsonb).
Skips V2 command-word check for response_type='mcq'.
Pre-renders organic_structure figures via RDKit.
"""
import json
import sys
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))
sys.stdout.reconfigure(encoding="utf-8")

from scripts.generation.validators import (  # noqa: E402
    jaccard_max,
    validate_command_word,
    detect_multi_part,
    flag_universal_quantifiers,
    validate_substance_uses,
    validate_bonding_terms,
)
from scripts.generation.cambridge_organic_renderer import render_cambridge_organic  # noqa: E402
from scripts.generation.circuit_renderer import render_circuit  # noqa: E402
from scripts.generation.periodic_table_renderer import render_periodic_table  # noqa: E402
from scripts.generation.graph_renderer import render_graph  # noqa: E402
from scripts.generation.bio_diagram_renderer import render_bio_diagram  # noqa: E402


def render_organic_structure(spec):
    """Wrapper: call Cambridge custom renderer with the spec's SMILES string."""
    return render_cambridge_organic(spec.get("smiles", ""))


def _load_active_fact_ids(rest_url: str, headers: dict) -> set[str]:
    """Pull all active atomic_fact ids once at script start (paged 1000 at a time)."""
    out: set[str] = set()
    offset = 0
    while True:
        url = f"{rest_url}/rest/v1/atomic_facts?select=id&is_active=eq.true&limit=1000&offset={offset}"
        chunk = json.loads(urllib.request.urlopen(urllib.request.Request(url, headers=headers), timeout=30).read())
        out.update(r["id"] for r in chunk)
        if len(chunk) < 1000:
            break
        offset += 1000
    return out


def validate_related_facts(item: dict, candidate_fact_ids: set[str]) -> tuple[bool, str]:
    """V5: every new question MUST cite at least one existing active atomic_fact id."""
    facts = item.get("related_facts")
    if not isinstance(facts, list) or len(facts) == 0:
        return False, "missing related_facts (must be non-empty array of strings)"
    for fact_id in facts:
        if not isinstance(fact_id, str):
            return False, f"related_facts entry is not a string: {fact_id!r}"
        if fact_id not in candidate_fact_ids:
            return False, f"related_facts references unknown atomic_fact: {fact_id}"
    return True, "ok"

if len(sys.argv) < 3:
    print("Usage: python scripts/insert-batch-v2.py <batch_file.json> <prompt_version>")
    sys.exit(1)

BATCH_FILE = sys.argv[1]
PROMPT_VERSION = sys.argv[2]

SUPABASE_URL = "https://lltcfjmshnhfmavlxpxr.supabase.co"
SERVICE_KEY = ACCESS_TOKEN = None
for line in (ROOT / "web" / ".env.local").read_text().splitlines():
    if line.startswith("SUPABASE_SERVICE_ROLE_KEY="):
        SERVICE_KEY = line.split("=", 1)[1].strip()
    elif line.startswith("SUPABASE_ACCESS_TOKEN="):
        ACCESS_TOKEN = line.split("=", 1)[1].strip()

REST = {"apikey": SERVICE_KEY, "Authorization": f"Bearer {SERVICE_KEY}", "Content-Type": "application/json"}
MGMT_URL = "https://api.supabase.com/v1/projects/lltcfjmshnhfmavlxpxr/database/query"
MGMT = {"Authorization": f"Bearer {ACCESS_TOKEN}", "Content-Type": "application/json", "User-Agent": "supabase-cli/2.84.4"}


def run_sql(sql):
    data = json.dumps({"query": sql}).encode()
    req = urllib.request.Request(MGMT_URL, data=data, method="POST", headers=MGMT)
    with urllib.request.urlopen(req, timeout=120) as resp:
        return json.loads(resp.read().decode())


WHITELIST = json.load(open(ROOT / "scripts" / "generation" / "data" / "substance_uses_whitelist.json", encoding="utf-8"))
BLACKLIST = json.load(open(ROOT / "scripts" / "generation" / "data" / "bonding_terms_blacklist.json", encoding="utf-8"))

# ── Normalize input ───────────────────────────────────────────────────
raw = json.load(open(BATCH_FILE, encoding="utf-8"))


def norm(q):
    """Normalize varying subagent output shapes."""
    return {
        "topic_code": q.get("topic_code") or q.get("topic_id") or "CHEM_T11",
        "marks": q.get("marks", 1),
        "difficulty": q.get("difficulty") or ("easy" if q.get("marks", 1) == 1 else ("medium" if q.get("marks") == 2 else "hard")),
        "tier": q.get("tier", "extended"),
        "response_type": q.get("response_type", "text"),
        "command_word": q.get("command_word"),
        "prompt_text": q.get("prompt_text") or q.get("question") or "",
        "parent_context": q.get("parent_context") or q.get("parent"),
        "mark_scheme": q.get("mark_scheme", ""),
        "correct_answer": q.get("correct_answer"),
        "skill_tested": q.get("skill_tested", ""),
        "mcq_options": q.get("mcq_options"),
        "figures": q.get("figures"),
        "related_facts": q.get("related_facts"),  # V5 — required after fact-linkage migration
    }


generated = [norm(q) for q in raw]
print(f"Loaded {len(generated)} from {BATCH_FILE}", file=sys.stderr)

# ── Cambridge pool ────────────────────────────────────────────────────
print("Loading Cambridge pool ...", file=sys.stderr)
cam_pool = []
offset = 0
while True:
    url = f"{SUPABASE_URL}/rest/v1/cambridge_reference?select=id,question_text&limit=1000&offset={offset}"
    chunk = json.loads(urllib.request.urlopen(urllib.request.Request(url, headers=REST), timeout=30).read())
    cam_pool.extend(chunk)
    if len(chunk) < 1000:
        break
    offset += 1000

# ── Load atomic_fact whitelist for V5 ────────────────────────────────
print("Loading active atomic_fact ids ...", file=sys.stderr)
ACTIVE_FACT_IDS = _load_active_fact_ids(SUPABASE_URL, REST)
print(f"  {len(ACTIVE_FACT_IDS)} ids loaded", file=sys.stderr)

# ── Validate ──────────────────────────────────────────────────────────
print("\nVALIDATION:", file=sys.stderr)
results = []
for i, q in enumerate(generated, 1):
    flags = []
    j, closest = jaccard_max(q["prompt_text"], cam_pool)
    if j >= 0.70:
        flags.append(f"V1_FAIL: jaccard={j:.2f}")

    # V2 — skip command-word check for MCQ (interrogative stems are normal)
    if q["response_type"] != "mcq":
        cmd_ok, cmd_msg = validate_command_word(q["prompt_text"], q["command_word"] or "")
        if not cmd_ok:
            flags.append(f"V2_FAIL: {cmd_msg}")

    if detect_multi_part(q["prompt_text"], q["marks"]) and q["response_type"] not in ("drawing", "mcq"):
        flags.append("V3_WARN")

    if flag_universal_quantifiers(q["mark_scheme"]):
        flags.append("V4.1_FAIL")
    if validate_bonding_terms(q["mark_scheme"], BLACKLIST):
        flags.append("V4.3_FAIL")

    # MCQ-specific: must have 4 options + 1 correct
    if q["response_type"] == "mcq":
        opts = q.get("mcq_options")
        if not opts or len(opts) != 4:
            flags.append(f"MCQ_FAIL: expected 4 options, got {len(opts) if opts else 0}")
        else:
            correct = [o for o in opts if o.get("is_correct")]
            if len(correct) != 1:
                flags.append(f"MCQ_FAIL: expected 1 correct, got {len(correct)}")

    # V5 — related_facts is mandatory and must reference active atomic_facts
    rf_ok, rf_msg = validate_related_facts(q, ACTIVE_FACT_IDS)
    if not rf_ok:
        flags.append(f"V5_FAIL: {rf_msg}")

    valid = not any("FAIL" in f for f in flags)
    status = "✓" if valid else "✗"
    print(f"  Q{i:2d} [{status}] j={j:.2f} {q['response_type']:8s} {' | '.join(flags) if flags else 'pass'}")
    results.append({"q": q, "valid": valid, "flags": flags, "jaccard": j})

valid_count = sum(1 for r in results if r["valid"])
print(f"\n{valid_count}/{len(results)} pass", file=sys.stderr)

# ── Pre-render organic figures ────────────────────────────────────────
for r in results:
    if not r["valid"]:
        continue
    figures = r["q"].get("figures")
    if not figures:
        continue
    for fig in figures:
        ftype = fig.get("type")
        try:
            if ftype == "organic_structure":
                fig["rendered_svg"] = render_organic_structure(fig)
            elif ftype == "circuit":
                fig["rendered_svg"] = render_circuit(fig)
            elif ftype == "periodic_table":
                fig["rendered_svg"] = render_periodic_table(fig)
            elif ftype == "graph":
                fig["rendered_svg"] = render_graph(fig)
            elif ftype == "bio_diagram":
                fig["rendered_svg"] = render_bio_diagram(fig)
        except Exception as e:
            r["valid"] = False
            r["flags"].append(f"RENDER_FAIL ({ftype}): {e}")

# ── Get topic UUIDs (across ALL subjects) ────────────────────────────
TUUID = {t["topic_code"]: t["id"] for t in json.loads(urllib.request.urlopen(urllib.request.Request(
    f"{SUPABASE_URL}/rest/v1/syllabus_topics?select=id,topic_code", headers=REST), timeout=30).read())}

# Map topic_code prefix → subject_code
TOPIC_PREFIX_TO_SUBJECT = {
    "CHEM": "0620",
    "PHYS": "0625",
    "BIO": "0610",
    "CS": "0478",
    "ENGLANG": "0500",
    "ENGLIT": "0475",
    "FRENCH": "0520",
    "PORT": "0504",
    "MATH": "0580",
}


def subject_code_for(topic_code: str) -> str:
    prefix = topic_code.split("_")[0]
    return TOPIC_PREFIX_TO_SUBJECT.get(prefix, "0620")


def sql_str(s):
    return "NULL" if s is None else "'" + str(s).replace("'", "''") + "'"


def sql_int(n):
    return "NULL" if n is None else str(int(n))


def sql_uuid(s):
    return "NULL" if s is None else f"'{s}'::uuid"


def sql_jsonb(obj):
    if obj is None:
        return "NULL"
    return "'" + json.dumps(obj).replace("'", "''") + "'::jsonb"


# Clear prior with this version
run_sql(f"DELETE FROM assessment_items WHERE generation_prompt_version = {sql_str(PROMPT_VERSION)};")

# Compute correct_answer for MCQ as the correct letter
for r in results:
    if r["q"]["response_type"] == "mcq" and r["q"].get("mcq_options"):
        correct_letter = next((o["letter"] for o in r["q"]["mcq_options"] if o.get("is_correct")), None)
        if correct_letter and not r["q"].get("correct_answer"):
            r["q"]["correct_answer"] = correct_letter

values = []
for r in results:
    if not r["valid"]:
        continue
    q = r["q"]
    notes = f"jaccard_max={r['jaccard']:.2f}; rt={q['response_type']}"
    subj_code = subject_code_for(q["topic_code"])
    values.append(
        f"({sql_str(subj_code)}, {sql_uuid(TUUID.get(q['topic_code']))}, "
        f"{sql_str(q['prompt_text'])}, {sql_str(q.get('parent_context'))}, "
        f"{sql_int(q['marks'])}, {sql_str(q['response_type'])}, "
        f"{sql_str(q.get('correct_answer'))}, {sql_str(q['mark_scheme'])}, "
        f"{sql_jsonb(q.get('mcq_options'))}, {sql_jsonb(q.get('figures'))}, "
        f"{sql_jsonb(q.get('related_facts'))}, "
        f"{sql_str(q.get('command_word'))}, "
        f"{sql_str(q['difficulty'])}, {sql_str(q['tier'])}, "
        f"'original_curated', NULL, "
        f"'claude-opus-4-7', {sql_str(PROMPT_VERSION)}, "
        f"'draft', {sql_str(notes)})"
    )

if values:
    insert_sql = f"""
INSERT INTO assessment_items (
    subject_code, syllabus_topic_id,
    prompt_text, parent_context,
    marks, response_type,
    correct_answer, mark_scheme,
    mcq_options, figures,
    related_facts,
    command_word,
    difficulty, tier,
    source, template_reference_id,
    generated_by_model, generation_prompt_version,
    status, review_notes
) VALUES
  {',\n  '.join(values)};
"""
    run_sql(insert_sql)

r = run_sql(f"SELECT count(*) AS n FROM assessment_items WHERE generation_prompt_version = {sql_str(PROMPT_VERSION)}")
print(f"\nFinal: {r[0]['n']} rows inserted with version={PROMPT_VERSION}")
