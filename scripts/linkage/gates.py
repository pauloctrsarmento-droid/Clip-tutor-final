"""
Wave 5 verification gates as importable functions.
Each function returns a tuple (passed: bool, detail: str).
"""
import json
import sys
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent.parent
sys.stdout.reconfigure(encoding="utf-8")

ACCESS_TOKEN = None
for line in (ROOT / "web" / ".env.local").read_text().splitlines():
    if line.startswith("SUPABASE_ACCESS_TOKEN="):
        ACCESS_TOKEN = line.split("=", 1)[1].strip()

if not ACCESS_TOKEN:
    sys.exit("FATAL: SUPABASE_ACCESS_TOKEN not found in web/.env.local")

MGMT_URL = "https://api.supabase.com/v1/projects/lltcfjmshnhfmavlxpxr/database/query"
MGMT_HEADERS = {
    "Authorization": f"Bearer {ACCESS_TOKEN}",
    "Content-Type": "application/json",
    "User-Agent": "supabase-cli/2.84.4",
}


def run_sql(sql: str) -> list:
    data = json.dumps({"query": sql}).encode()
    req = urllib.request.Request(MGMT_URL, data=data, method="POST", headers=MGMT_HEADERS)
    with urllib.request.urlopen(req, timeout=120) as resp:
        return json.loads(resp.read().decode())


def gate_a_data_clean() -> tuple[bool, str]:
    """No approved question may have null or empty related_facts; every fact_id must exist active."""
    unlinked = run_sql("""
        SELECT count(*)::int AS n
        FROM assessment_items
        WHERE status='approved'
          AND (related_facts IS NULL OR jsonb_array_length(related_facts) = 0);
    """)[0]["n"]
    if unlinked > 0:
        return False, f"Gate A: {unlinked} approved questions still unlinked"

    missing = run_sql("""
        WITH refs AS (
          SELECT DISTINCT jsonb_array_elements_text(related_facts) AS fact_id
          FROM assessment_items
          WHERE status='approved' AND related_facts IS NOT NULL
        )
        SELECT count(*)::int AS n
        FROM refs r
        LEFT JOIN atomic_facts af ON af.id = r.fact_id AND af.is_active
        WHERE af.id IS NULL;
    """)[0]["n"]
    if missing > 0:
        return False, f"Gate A: {missing} fact_ids reference unknown or inactive atomic_facts"

    return True, "Gate A passed: 0 unlinked, 0 dangling refs"


def gate_k_kill_switch() -> tuple[bool, str]:
    """Halt if too many chunks have empty approvals OR low agreement is widespread."""
    flagged = run_sql("""
        WITH per_chunk AS (
          SELECT chunk_id,
                 count(*) AS questions,
                 count(*) FILTER (
                   WHERE jsonb_array_length(coalesce(approved_facts, '[]'::jsonb)) = 0
                     AND jsonb_array_length(coalesce(new_facts_approved, '[]'::jsonb)) = 0
                 ) AS empty_approvals
          FROM linkage_proposals
          WHERE status IN ('reviewed','applied')
          GROUP BY chunk_id
        )
        SELECT chunk_id, questions, empty_approvals
        FROM per_chunk
        WHERE questions >= 5
          AND empty_approvals::float / questions > 0.5;
    """)
    if flagged:
        return False, f"Gate K: {len(flagged)} chunks have >50% empty approvals: {[r['chunk_id'] for r in flagged]}"

    rate = run_sql("""
        SELECT (count(*) FILTER (WHERE agreement_signal='low'))::float
               / NULLIF(count(*), 0) AS low_rate
        FROM linkage_proposals
        WHERE status IN ('reviewed','applied') AND agreement_signal IS NOT NULL;
    """)[0]["low_rate"]
    if rate is not None and rate > 0.05:
        return False, f"Gate K: low_agreement rate {rate:.1%} exceeds 5% threshold"

    return True, "Gate K passed: no flagged chunks, low_rate within threshold"


def gate_b_constraints_active() -> tuple[bool, str]:
    """Negative tests against the live constraints. Must run AFTER Migration 2 applied."""
    tests = []

    # Test 1: insert without related_facts must fail
    sql1 = """
        INSERT INTO assessment_items (subject_code, prompt_text, marks, status, response_type)
        VALUES ('0620', '__gate_b_test_1__', 1, 'draft', 'text');
    """
    try:
        run_sql(sql1)
        run_sql("DELETE FROM assessment_items WHERE prompt_text='__gate_b_test_1__';")
        return False, "Gate B test 1: insert without related_facts SHOULD have failed but succeeded"
    except urllib.error.HTTPError as e:
        body = e.read().decode()
        if "null value" not in body.lower() and "not-null" not in body.lower():
            return False, f"Gate B test 1: failed for wrong reason: {body[:200]}"
        tests.append("test 1 passed (NOT NULL)")

    # Test 2: bogus fact_id must fail
    sql2 = """
        INSERT INTO assessment_items (subject_code, prompt_text, marks, status, response_type, related_facts)
        VALUES ('0620', '__gate_b_test_2__', 1, 'draft', 'text', '["__FAKE_FACT_ID__"]'::jsonb);
    """
    try:
        run_sql(sql2)
        run_sql("DELETE FROM assessment_items WHERE prompt_text='__gate_b_test_2__';")
        return False, "Gate B test 2: insert with bogus fact_id SHOULD have failed"
    except urllib.error.HTTPError as e:
        body = e.read().decode()
        if "__FAKE_FACT_ID__" not in body:
            return False, f"Gate B test 2: failed for wrong reason: {body[:200]}"
        tests.append("test 2 passed (existence trigger)")

    # Test 3: deactivating a referenced fact must fail
    referenced = run_sql("""
        SELECT jsonb_array_elements_text(related_facts) AS fact_id
        FROM assessment_items
        WHERE status='approved' AND related_facts IS NOT NULL
        LIMIT 1;
    """)
    if not referenced:
        return False, "Gate B test 3: no referenced facts found to test deactivation against"
    target = referenced[0]["fact_id"]
    try:
        run_sql(f"UPDATE atomic_facts SET is_active=false WHERE id='{target}';")
        # Rollback if it somehow succeeded (it shouldn't)
        run_sql(f"UPDATE atomic_facts SET is_active=true WHERE id='{target}';")
        return False, f"Gate B test 3: deactivating referenced fact {target} SHOULD have failed"
    except urllib.error.HTTPError as e:
        body = e.read().decode()
        if "still referenced" not in body.lower():
            return False, f"Gate B test 3: failed for wrong reason: {body[:200]}"
        tests.append("test 3 passed (atomic_facts protection)")

    return True, "Gate B passed: " + ", ".join(tests)


if __name__ == "__main__":
    cmd = sys.argv[1] if len(sys.argv) > 1 else "all"
    if cmd in ("a", "all"):
        ok, msg = gate_a_data_clean(); print(f"[{'PASS' if ok else 'FAIL'}] {msg}")
    if cmd in ("k", "all"):
        ok, msg = gate_k_kill_switch(); print(f"[{'PASS' if ok else 'FAIL'}] {msg}")
    if cmd in ("b", "all"):
        ok, msg = gate_b_constraints_active(); print(f"[{'PASS' if ok else 'FAIL'}] {msg}")
