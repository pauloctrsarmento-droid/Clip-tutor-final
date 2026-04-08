"""
Repair SME HTML questions that mention 'Fig.' but have no diagrams linked.

Workflow:
1. Query DB for affected IDs (id LIKE 'sme_%' AND question_text ILIKE '%Fig.%' AND has_diagram=false)
2. Parse each ID to extract (subject_code, topic_num, section_num)
3. Look up topic_code (e.g., BIO_T6) and subtopic slug from subtopic_slugs.json
4. Group by (subject_code, topic_code) and run the fixed scraper once per group
5. The scraper with the improved tiptap_to_text() will now extract missing images
6. --ingest flag upserts (merge-duplicates) which updates has_diagram and fig_refs

Usage:
    py -u scripts/repair-sme-diagrams.py --dry-run
    py -u scripts/repair-sme-diagrams.py --id sme_0610_bio_t6_s1_th_easy_18
    py -u scripts/repair-sme-diagrams.py          # full repair
"""

import json
import os
import re
import subprocess
import sys
import urllib.request
from collections import defaultdict

SUPABASE_URL = "https://lltcfjmshnhfmavlxpxr.supabase.co"
SERVICE_KEY = os.environ["SUPABASE_SERVICE_ROLE_KEY"]

BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SLUGS_PATH = os.path.join(BASE_DIR, "data", "sme_html", "subtopic_slugs.json")

# Subject code short names used in IDs
SUBJECT_INTERNAL = {
    "0620": "chem",
    "0625": "phys",
    "0610": "bio",
    "0478": "cs",
}

# Map subject short → topic_code prefix for the syllabus_topics table
SUBJECT_TOPIC_PREFIX = {
    "chem": "CHEM",
    "phys": "PHYS",
    "bio": "BIO",
    "cs": "CS",
}

DRY_RUN = "--dry-run" in sys.argv
ID_FILTER = None
for i, arg in enumerate(sys.argv):
    if arg == "--id" and i + 1 < len(sys.argv):
        ID_FILTER = sys.argv[i + 1]


def rest_get(path):
    url = f"{SUPABASE_URL}/rest/v1/{path}"
    req = urllib.request.Request(url, headers={
        "apikey": SERVICE_KEY,
        "Authorization": f"Bearer {SERVICE_KEY}",
    })
    with urllib.request.urlopen(req, timeout=60) as resp:
        return json.loads(resp.read().decode())


def fetch_affected_questions():
    """Fetch all SME HTML questions that mention Fig. but lack a diagram."""
    params = (
        "id=like.sme_*"
        "&question_text=ilike.*Fig.*"
        "&has_diagram=is.false"
        "&select=id,subject_code,syllabus_topic_id"
        "&limit=500"
    )
    return rest_get(f"exam_questions?{params}")


# ID format: sme_{subject_code}_{subject_short}_t{N}_s{M}_{type}_{difficulty}_{num}
ID_RE = re.compile(r"^sme_(\d{4})_([a-z]+)_t(\d+)_s(\d+)_")


def parse_id(qid):
    m = ID_RE.match(qid)
    if not m:
        return None
    return {
        "subject_code": m.group(1),
        "subject_short": m.group(2),
        "topic_num": int(m.group(3)),
        "section_num": int(m.group(4)),
        "slug_key": f"{m.group(1)}_{m.group(2)}_t{m.group(3)}_s{m.group(4)}",
        "topic_code": f"{SUBJECT_TOPIC_PREFIX.get(m.group(2), m.group(2).upper())}_T{m.group(3)}",
    }


def run_scraper(subject_code, topic_code, subtopic_slugs):
    """Invoke the fixed scrape-sme-html.py with --ingest to upsert affected questions."""
    cmd = [
        "py", "-u",
        os.path.join(BASE_DIR, "scripts", "scrape-sme-html.py"),
        subject_code,
        topic_code,
        *subtopic_slugs,
        "--ingest",
    ]
    print(f"\n>>> Running: py scrape-sme-html.py {subject_code} {topic_code} {' '.join(subtopic_slugs)} --ingest", flush=True)
    result = subprocess.run(cmd, capture_output=False, text=True, cwd=BASE_DIR)
    return result.returncode == 0


def main():
    print("=" * 60, flush=True)
    print("SME Diagram Repair Orchestrator", flush=True)
    print("=" * 60, flush=True)

    # Load subtopic slug mapping
    if not os.path.exists(SLUGS_PATH):
        print(f"ERROR: {SLUGS_PATH} not found. Run fetch_sme_subtopic_slugs.py first.", flush=True)
        sys.exit(1)
    with open(SLUGS_PATH, encoding="utf-8") as f:
        slugs = json.load(f)
    print(f"Loaded {len(slugs)} subtopic slug mappings\n", flush=True)

    # Fetch affected questions
    print("Fetching affected questions...", flush=True)
    questions = fetch_affected_questions()
    print(f"  {len(questions)} total affected\n", flush=True)

    if ID_FILTER:
        questions = [q for q in questions if q["id"] == ID_FILTER]
        print(f"  Filtered to {len(questions)} with --id={ID_FILTER}\n", flush=True)

    # Group by (subject_code, topic_code) -> set of slug_keys
    groups = defaultdict(set)
    unparseable = []

    for q in questions:
        parsed = parse_id(q["id"])
        if not parsed:
            unparseable.append(q["id"])
            continue
        key = (parsed["subject_code"], parsed["topic_code"])
        groups[key].add(parsed["slug_key"])

    if unparseable:
        print(f"  WARN: {len(unparseable)} IDs could not be parsed:", flush=True)
        for qid in unparseable[:5]:
            print(f"    {qid}", flush=True)

    # Resolve slugs and print plan.
    # IMPORTANT: We must pass the FULL list of subtopics for the topic (in s1, s2, s3... order)
    # because the scraper assigns section indices based on CLI argument order. Passing only
    # affected subtopics would shift the indices and cause upsert to create new rows instead
    # of updating existing ones.
    print(f"\nGroups to repair: {len(groups)}", flush=True)
    plan = []
    for (subject_code, topic_code), slug_keys in sorted(groups.items()):
        # Build full ordered subtopic list for this topic based on slug_keys naming (s1, s2, ...)
        subject_short = SUBJECT_INTERNAL.get(subject_code, "")
        topic_num_match = re.match(r".*_T(\d+)$", topic_code)
        if not topic_num_match:
            missing_slugs = [f"unknown topic format: {topic_code}"]
            full_slug_keys = []
        else:
            topic_num = int(topic_num_match.group(1))
            # Collect ALL s_X keys for this topic, sorted by X
            full_slug_keys = sorted(
                [k for k in slugs if k.startswith(f"{subject_code}_{subject_short}_t{topic_num}_s")],
                key=lambda k: int(re.search(r"_s(\d+)$", k).group(1)),
            )
            missing_slugs = []

        subtopic_slugs = []
        for sk in full_slug_keys:
            slug = slugs.get(sk)
            if slug:
                subtopic_slugs.append(slug)
            else:
                missing_slugs.append(sk)

        n_affected = sum(
            1 for q in questions
            if parse_id(q["id"]) and (parse_id(q["id"])["subject_code"], parse_id(q["id"])["topic_code"]) == (subject_code, topic_code)
        )
        print(f"  {subject_code} {topic_code}: {n_affected} questions, {len(subtopic_slugs)} subtopic slugs", flush=True)
        for s in subtopic_slugs:
            print(f"    -> {s}", flush=True)
        if missing_slugs:
            print(f"    MISSING SLUGS: {missing_slugs}", flush=True)

        if subtopic_slugs:
            plan.append((subject_code, topic_code, subtopic_slugs))

    if DRY_RUN:
        print(f"\n[DRY RUN] Would run {len(plan)} scraper invocations.", flush=True)
        return

    # Execute
    print(f"\n{'=' * 60}", flush=True)
    print(f"Executing {len(plan)} scraper runs...", flush=True)
    print(f"{'=' * 60}", flush=True)

    successes = 0
    failures = 0
    for subject_code, topic_code, subtopic_slugs in plan:
        if run_scraper(subject_code, topic_code, subtopic_slugs):
            successes += 1
        else:
            failures += 1
            print(f"  !!! FAILED: {subject_code} {topic_code}", flush=True)

    print(f"\n{'=' * 60}", flush=True)
    print(f"Repair done: {successes} OK, {failures} failed", flush=True)
    print(f"{'=' * 60}", flush=True)

    # Post-validation
    print("\nPost-repair count...", flush=True)
    remaining = fetch_affected_questions()
    print(f"  Remaining affected: {len(remaining)} (was {len(questions)})", flush=True)
    if remaining:
        print("  Sample remaining IDs:", flush=True)
        for q in remaining[:10]:
            print(f"    {q['id']}", flush=True)


if __name__ == "__main__":
    main()
