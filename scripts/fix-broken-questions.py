"""
Urgent fix: disable questions that reference diagrams/tables but have no usable context.

Checks:
1. has_diagram=true or fig_refs not empty, but parent_context is null/empty
   AND diagram files don't exist in Supabase Storage → evaluation_ready=false
2. Question text references external data ("shown", "the table", "the graph")
   but parent_context is null → evaluation_ready=false

Usage: py scripts/fix-broken-questions.py [--dry-run]
"""

import json
import os
import re
import sys
import urllib.request
import urllib.error

SUPABASE_URL = "https://lltcfjmshnhfmavlxpxr.supabase.co"

SERVICE_KEY = None
env_path = os.path.join(os.path.dirname(__file__), "..", "web", ".env.local")
if os.path.exists(env_path):
    with open(env_path) as f:
        for line in f:
            if line.startswith("SUPABASE_SERVICE_ROLE_KEY="):
                SERVICE_KEY = line.strip().split("=", 1)[1]
                break

if not SERVICE_KEY:
    print("ERROR: SUPABASE_SERVICE_ROLE_KEY not found")
    sys.exit(1)

DRY_RUN = "--dry-run" in sys.argv

# Patterns that indicate question needs external visual context
NEEDS_CONTEXT = re.compile(
    r'\b(the table|the graph|the results|shown in|shown below|shown above|'
    r'the diagram|the chart|the figure|the image|the picture|'
    r'from the graph|from the table|from the diagram|'
    r'pure [A-Z]\b|substance [A-Z]\b|element [A-Z]\b|liquid [A-Z]\b|'
    r'metal [A-Z]\b|compound [A-Z]\b|solution [A-Z]\b|'
    r'in the table|in the graph|in the diagram|'
    r'the apparatus|the circuit|the experiment shows|'
    r'results are shown|results are given|data is shown|data are shown|'
    r'readings? (?:is|are) shown|values? (?:is|are) shown)',
    re.IGNORECASE
)


def supabase_request(path, method="GET", data=None, prefer=None):
    url = f"{SUPABASE_URL}/rest/v1/{path}"
    headers = {
        "apikey": SERVICE_KEY,
        "Authorization": f"Bearer {SERVICE_KEY}",
        "Content-Type": "application/json",
    }
    if prefer:
        headers["Prefer"] = prefer
    body = json.dumps(data).encode("utf-8") if data else None
    req = urllib.request.Request(url, data=body, method=method, headers=headers)
    try:
        with urllib.request.urlopen(req) as resp:
            text = resp.read().decode("utf-8")
            return json.loads(text) if text.strip() else []
    except urllib.error.HTTPError as e:
        error_body = e.read().decode("utf-8")
        print(f"  ERROR {e.code}: {error_body[:500]}")
        raise


# Cache of diagram folders that exist in Supabase Storage
_diagram_cache = {}  # paper_id → set of filenames


def _load_diagram_cache(paper_id):
    """List files in a diagram folder, caching results."""
    if paper_id in _diagram_cache:
        return _diagram_cache[paper_id]

    url = f"{SUPABASE_URL}/storage/v1/object/list/diagrams"
    headers = {
        "apikey": SERVICE_KEY,
        "Authorization": f"Bearer {SERVICE_KEY}",
        "Content-Type": "application/json",
    }
    data = json.dumps({"prefix": f"{paper_id}/", "limit": 100}).encode()
    req = urllib.request.Request(url, data=data, method="POST", headers=headers)
    try:
        with urllib.request.urlopen(req) as resp:
            files = json.loads(resp.read().decode())
            names = {f["name"] for f in files if isinstance(f, dict) and "name" in f}
            _diagram_cache[paper_id] = names
            return names
    except urllib.error.HTTPError:
        _diagram_cache[paper_id] = set()
        return set()


def check_diagram_exists(paper_id, fig_refs):
    """Check if at least one diagram file exists in Supabase Storage."""
    if not paper_id:
        return False
    files = _load_diagram_cache(paper_id)
    if not files:
        return False

    for ref in fig_refs:
        normalized = ref.replace(".", "_").replace(" ", "_").lower()
        filename = f"fig_{normalized}.png"
        if filename in files:
            return True

    return False


def main():
    print("=" * 60)
    print("CLIP Tutor — Fix Broken Questions")
    print("=" * 60)

    if DRY_RUN:
        print("[DRY RUN MODE]\n")

    # Fetch all evaluation_ready questions with pagination
    print("Fetching questions...")
    questions = []
    offset = 0
    PAGE = 1000
    while True:
        page = supabase_request(
            f"exam_questions?select=id,subject_code,paper_id,question_text,parent_context,"
            f"has_diagram,fig_refs,table_refs,evaluation_ready"
            f"&evaluation_ready=eq.true&is_stem=eq.false"
            f"&order=subject_code,paper_id"
            f"&offset={offset}&limit={PAGE}"
        )
        questions.extend(page)
        if len(page) < PAGE:
            break
        offset += PAGE
    print(f"  {len(questions)} evaluation-ready questions\n")

    to_disable = []
    reasons = {"no_diagram_file": 0, "needs_context": 0}
    by_subject = {}

    for q in questions:
        qid = q["id"]
        subject = q["subject_code"]
        paper_id = q["paper_id"] or ""
        text = (q["question_text"] or "").strip()
        parent = (q["parent_context"] or "").strip()
        has_diagram = q.get("has_diagram", False)
        fig_refs = q.get("fig_refs") or []
        table_refs = q.get("table_refs") or []
        has_refs = len(fig_refs) > 0 or len(table_refs) > 0

        disable = False
        reason = ""

        # Check 1: Has diagram flag but no parent context
        if (has_diagram or has_refs) and not parent:
            # Check if diagram files actually exist
            if fig_refs and paper_id:
                if not check_diagram_exists(paper_id, fig_refs):
                    disable = True
                    reason = "no_diagram_file"
            elif has_diagram and not fig_refs:
                # has_diagram=true but no fig_refs — can't resolve
                disable = True
                reason = "no_diagram_file"

        # Check 2: Text references external data but no context/diagram
        if not disable and not parent:
            if NEEDS_CONTEXT.search(text):
                # Only disable if no diagram available
                if not has_diagram and not has_refs:
                    disable = True
                    reason = "needs_context"
                elif has_diagram and fig_refs and paper_id:
                    if not check_diagram_exists(paper_id, fig_refs):
                        disable = True
                        reason = "needs_context"

        if disable:
            to_disable.append(qid)
            reasons[reason] = reasons.get(reason, 0) + 1
            by_subject[subject] = by_subject.get(subject, 0) + 1

    print(f"Questions to disable: {len(to_disable)}")
    print(f"  No diagram file: {reasons['no_diagram_file']}")
    print(f"  Needs context: {reasons['needs_context']}")
    print(f"\nBy subject:")
    for subj, count in sorted(by_subject.items()):
        print(f"  {subj}: {count}")

    if DRY_RUN:
        print(f"\n[DRY RUN] Would disable {len(to_disable)} questions")
        return

    if not to_disable:
        print("\nNo questions to disable.")
        return

    # Batch update
    print(f"\nDisabling {len(to_disable)} questions...")
    BATCH = 50
    disabled = 0
    for i in range(0, len(to_disable), BATCH):
        batch = to_disable[i:i + BATCH]
        # Use individual updates since REST API doesn't support IN for PATCH easily
        for qid in batch:
            supabase_request(
                f"exam_questions?id=eq.{qid}",
                method="PATCH",
                data={"evaluation_ready": False},
                prefer="return=minimal",
            )
            disabled += 1
        print(f"  Disabled {disabled}/{len(to_disable)}")

    # Verify
    remaining = supabase_request(
        "exam_questions?select=id&evaluation_ready=eq.true&is_stem=eq.false"
    )
    print(f"\nDONE: {disabled} questions disabled.")
    print(f"Remaining evaluation-ready questions: {len(remaining)}")


if __name__ == "__main__":
    main()
