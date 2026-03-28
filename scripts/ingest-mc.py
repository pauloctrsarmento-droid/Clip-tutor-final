"""
ingest-mc.py — Parse MC mark schemes and insert questions into Supabase.
IDs: {paper_id}_q{number} (e.g. 0620_s23_21_q1)

Usage: py scripts/ingest-mc.py [--dry-run]
"""

import json
import os
import re
import sys
import time
import urllib.request
import fitz
from pathlib import Path

sys.stdout.reconfigure(encoding="utf-8")

KB = Path(r"c:\Users\sarma\OneDrive\Ambiente de Trabalho\TUTOR FILHA\clip-tutor-kb\past-papers")
SUPABASE_URL = "https://lltcfjmshnhfmavlxpxr.supabase.co"
SERVICE_KEY = os.environ["SUPABASE_SERVICE_ROLE_KEY"]

SUBJECTS = {
    "0620": ["21", "22", "11", "12"],
    "0625": ["21", "22", "11", "12"],
    "0610": ["21", "22", "11", "12"],
}

BATCH_SIZE = 100
DRY_RUN = "--dry-run" in sys.argv


def rest_post(table, rows, prefer="resolution=merge-duplicates,return=minimal"):
    url = f"{SUPABASE_URL}/rest/v1/{table}"
    body = json.dumps(rows).encode("utf-8")
    req = urllib.request.Request(url, data=body, method="POST", headers={
        "apikey": SERVICE_KEY,
        "Authorization": f"Bearer {SERVICE_KEY}",
        "Content-Type": "application/json",
        "Prefer": prefer,
    })
    for attempt in range(3):
        try:
            resp = urllib.request.urlopen(req, timeout=30)
            resp.read()
            return True
        except urllib.error.HTTPError as e:
            err = e.read().decode()
            if e.code == 429:
                time.sleep(3 * (attempt + 1))
                continue
            if "duplicate" in err.lower() or "already exists" in err.lower():
                return True  # OK, skip dupes
            print(f"  REST {e.code}: {err[:200]}")
            if attempt < 2:
                time.sleep(1)
                continue
            return False
    return False


def parse_ms(ms_path):
    """Parse MC mark scheme → {1: 'D', 2: 'B', ...}"""
    doc = fitz.open(str(ms_path))
    answers = {}
    for page in doc:
        for m in re.finditer(r'(\d{1,2})\s+([ABCD])\s+1', page.get_text()):
            qnum = int(m.group(1))
            if 1 <= qnum <= 40:
                answers[qnum] = m.group(2)
    doc.close()
    return answers


def main():
    print("=" * 60)
    print("CLIP Tutor — MC Question Ingest")
    print("=" * 60)
    if DRY_RUN:
        print("[DRY RUN]\n")

    # Collect all MC papers
    all_papers = []
    all_questions = []

    for code, variants in sorted(SUBJECTS.items()):
        subj_q = 0
        for year in range(2019, 2026):
            for session in ["m", "s", "w"]:
                for variant in variants:
                    sc = f"{session}{str(year)[2:]}"
                    paper_id = f"{code}_{sc}_{variant}"
                    ms_path = KB / code / str(year) / f"{code}_{sc}_ms_{variant}.pdf"
                    qp_path = KB / code / str(year) / f"{code}_{sc}_qp_{variant}.pdf"

                    if not ms_path.exists():
                        continue

                    answers = parse_ms(str(ms_path))
                    if len(answers) < 10:
                        continue  # Not a proper MC paper

                    # Check if diagrams were extracted for this paper
                    diag_dir = Path(f"c:/Users/sarma/OneDrive/Ambiente de Trabalho/tutor final/data/diagrams/{paper_id}")
                    diag_files = {}
                    if diag_dir.exists():
                        for f in os.listdir(diag_dir):
                            m = re.match(r'q(\d+)\.png', f)
                            if m:
                                diag_files[int(m.group(1))] = f

                    # Paper record
                    all_papers.append({
                        "id": paper_id,
                        "subject_code": code,
                        "session": sc,
                        "variant": variant,
                        "year": year,
                        "total_questions": len(answers),
                        "total_marks": len(answers),
                        "qp_url": f"{SUPABASE_URL}/storage/v1/object/public/papers/{paper_id}/qp.pdf",
                        "ms_url": f"{SUPABASE_URL}/storage/v1/object/public/papers/{paper_id}/ms.pdf",
                    })

                    # Question records
                    for qnum, letter in sorted(answers.items()):
                        qid = f"{paper_id}_q{qnum}"
                        has_diag = qnum in diag_files

                        all_questions.append({
                            "id": qid,
                            "paper_id": paper_id,
                            "subject_code": code,
                            "question_number": qnum,
                            "question_text": f"MC Question {qnum}",
                            "marks": 1,
                            "correct_answer": letter,
                            "mark_scheme": f"Correct answer: {letter}",
                            "mark_points": [{"id": "M1", "text": f"Answer: {letter}"}],
                            "question_type": "multiple_choice",
                            "response_type": "mcq",
                            "has_diagram": has_diag,
                            "fig_refs": [str(qnum)] if has_diag else [],
                            "table_refs": [],
                            "evaluation_ready": True,
                            "is_stem": False,
                            "part_order": 0,
                            "sibling_count": 1,
                        })
                        subj_q += 1

        print(f"  {code}: {subj_q} MC questions")

    # Deduplicate by ID
    seen_ids = set()
    unique_questions = []
    for q in all_questions:
        if q["id"] not in seen_ids:
            seen_ids.add(q["id"])
            unique_questions.append(q)

    seen_paper_ids = set()
    unique_papers = []
    for p in all_papers:
        if p["id"] not in seen_paper_ids:
            seen_paper_ids.add(p["id"])
            unique_papers.append(p)

    print(f"\nTotal: {len(unique_papers)} papers, {len(unique_questions)} questions")
    diag_count = sum(1 for q in unique_questions if q["has_diagram"])
    print(f"  With diagrams: {diag_count}")

    if DRY_RUN:
        print("\n[DRY RUN] Done.")
        return

    # Insert papers
    print(f"\nInserting {len(unique_papers)} papers...")
    for i in range(0, len(unique_papers), BATCH_SIZE):
        batch = unique_papers[i:i + BATCH_SIZE]
        rest_post("exam_papers", batch)
        print(f"  {min(i + BATCH_SIZE, len(unique_papers))}/{len(unique_papers)}")
        time.sleep(0.3)

    # Insert questions
    print(f"\nInserting {len(unique_questions)} questions...")
    for i in range(0, len(unique_questions), BATCH_SIZE):
        batch = unique_questions[i:i + BATCH_SIZE]
        ok = rest_post("exam_questions", batch)
        done = min(i + BATCH_SIZE, len(unique_questions))
        status = "ok" if ok else "FAIL"
        if done % 500 == 0 or done == len(unique_questions):
            print(f"  {done}/{len(unique_questions)} [{status}])
        time.sleep(0.3)

    print("\nDone. Verifying...")
    time.sleep(2)

    # Verify via REST (not SQL — avoids rate limit)
    url = f"{SUPABASE_URL}/rest/v1/exam_questions?response_type=eq.mcq&select=subject_code"
    req = urllib.request.Request(url, headers={
        "apikey": SERVICE_KEY, "Authorization": f"Bearer {SERVICE_KEY}",
        "Prefer": "count=exact",
    })
    resp = urllib.request.urlopen(req)
    count = resp.headers.get("content-range", "")
    print(f"  MC questions in DB: {count}")


if __name__ == "__main__":
    main()
