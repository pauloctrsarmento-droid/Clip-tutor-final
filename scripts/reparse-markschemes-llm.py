"""
Re-parse Mark Scheme PDFs via LLM to extract structured mark points.
Sends full MS text to gpt-4o-mini, gets back structured JSON per question.

Usage:
  py -u scripts/reparse-markschemes-llm.py --test --subject 0625   # test 1 paper
  py -u scripts/reparse-markschemes-llm.py --subject 0625          # all Physics
  py -u scripts/reparse-markschemes-llm.py                         # all subjects
"""

import fitz
import json
import os
import re
import sys
import time
import requests
from pathlib import Path

sys.stdout.reconfigure(encoding="utf-8")
print("Re-parsing Mark Schemes via LLM...", flush=True)

KB = Path("c:/Users/sarma/OneDrive/Ambiente de Trabalho/TUTOR FILHA/clip-tutor-kb/past-papers")
OPENAI_KEY = os.environ["OPENAI_API_KEY"]
SUPABASE_URL = "https://lltcfjmshnhfmavlxpxr.supabase.co"
SERVICE_KEY = os.environ["SUPABASE_SERVICE_ROLE_KEY"]
MGMT_TOKEN = os.environ["SUPABASE_ACCESS_TOKEN"]
MGMT_API = "https://api.supabase.com/v1/projects/lltcfjmshnhfmavlxpxr/database/query"

BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

SUBJECTS = {
    "0620": ["41", "42", "43"],
    "0625": ["41", "42", "43"],
    "0610": ["41", "42", "43"],
    "0478": ["11", "21"],
    "0520": ["21", "41"],
    "0504": ["01", "02"],
    "0475": ["12", "32"],
    "0500": ["11", "21"],
}

TEST_MODE = "--test" in sys.argv
SUBJECT_FILTER = None
if "--subject" in sys.argv:
    idx = sys.argv.index("--subject")
    SUBJECT_FILTER = sys.argv[idx + 1]

SYSTEM_PROMPT = """You are parsing a Cambridge IGCSE Mark Scheme PDF. Extract ALL mark points for every question.

Rules:
- Each question has a label: 1(a), 2(b)(i), 3(c)(ii), etc.
- Each mark point has a label like M1, M2, A1, B1, B2, C1, etc. Copy the label EXACTLY as written in the document.
- The text after the label is the mark point description. Include the FULL text, including alternative answers after OR.
- Total marks for a question = number of individual mark points listed
- Do NOT include question stems — only the mark scheme answers
- Questions like "1" without sub-parts are valid standalone questions IF they have mark points
- If a question label appears but has no mark points under it (only sub-questions follow), it's a stem — SKIP it
- "M1 answer A OR answer B" is ONE mark point, not two
- For simple 1-mark answers without an explicit label (just the answer text and "1" in the marks column), use "B1" as the label

Return JSON:
{
  "questions": [
    {
      "label": "1(a)",
      "mark_points": [
        {"id": "B1", "text": "Rate of change of velocity"},
        {"id": "B1", "text": "In a stated direction"}
      ],
      "total_marks": 2
    }
  ]
}

IMPORTANT: total_marks MUST equal the length of mark_points array for every question."""


def run_sql(sql):
    for a in range(5):
        try:
            r = requests.post(MGMT_API, json={"query": sql}, headers={
                "Authorization": f"Bearer {MGMT_TOKEN}", "User-Agent": "supabase-cli/2.84.4",
            }, timeout=15)
            r.raise_for_status()
            return r.json()
        except Exception:
            if a < 4: time.sleep(3 * (a + 1))
    return []


def extract_ms_text(pdf_path):
    """Extract text from MS PDF, skipping cover and generic marking principles."""
    doc = fitz.open(str(pdf_path))
    pages_text = []

    for pn in range(len(doc)):
        text = doc[pn].get_text()

        # Skip cover page and generic marking principles
        if "GENERIC MARKING PRINCIPLE" in text.upper():
            continue
        if pn == 0 and "Mark Scheme" in text and "Question" not in text:
            continue

        # Only include pages with actual mark scheme content
        if "Question" in text and ("Answer" in text or "Marks" in text):
            pages_text.append(text)
        elif any(re.search(r'[MABCD]\d', text) for _ in [1]):
            # Page has mark point labels
            pages_text.append(text)

    doc.close()
    return "\n\n---PAGE BREAK---\n\n".join(pages_text)


def ms_label_to_qid(paper_id, label):
    """Convert '5(b)(i)' → '{paper_id}_q5b_i'."""
    label = label.strip()
    m = re.match(r'^(\d{1,2})(?:\(([a-z])\))?(?:\(([ivx]+)\))?$', label)
    if not m:
        return None
    qid = f"{paper_id}_q{m.group(1)}"
    if m.group(2):
        qid += m.group(2)
    if m.group(3):
        qid += f"_{m.group(3)}"
    return qid


def call_openai(ms_text, paper_id):
    """Send MS text to LLM and get structured mark points."""
    try:
        r = requests.post("https://api.openai.com/v1/chat/completions", json={
            "model": "gpt-4o-mini",
            "max_tokens": 8192,
            "temperature": 0,
            "response_format": {"type": "json_object"},
            "messages": [
                {"role": "system", "content": SYSTEM_PROMPT},
                {"role": "user", "content": f"Paper: {paper_id}\n\nMark Scheme text:\n{ms_text}"},
            ],
        }, headers={"Authorization": f"Bearer {OPENAI_KEY}"}, timeout=90)
        r.raise_for_status()
        text = r.json()["choices"][0]["message"]["content"]
        return json.loads(text)
    except Exception as e:
        print(f"  OpenAI error: {e}", flush=True)
        return None


def load_checkpoint(code):
    path = os.path.join(BASE_DIR, "data", f"markscheme_llm_{code}.json")
    if os.path.exists(path):
        with open(path, encoding="utf-8") as f:
            return json.load(f)
    return {}


def save_checkpoint(code, data):
    path = os.path.join(BASE_DIR, "data", f"markscheme_llm_{code}.json")
    os.makedirs(os.path.dirname(path), exist_ok=True)
    with open(path, "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False)


def main():
    all_results = {}  # qid → {marks, mark_points}
    total_pdfs = 0
    total_questions = 0
    validation_warnings = []

    for code, variants in sorted(SUBJECTS.items()):
        if SUBJECT_FILTER and code != SUBJECT_FILTER:
            continue

        checkpoint = load_checkpoint(code)
        subj_qs = 0
        subj_pdfs = 0
        subj_new = 0

        for year in range(2019, 2026):
            for session in ["m", "s", "w"]:
                for variant in variants:
                    sc = f"{session}{str(year)[2:]}"
                    paper_id = f"{code}_{sc}_{variant}"
                    ms_path = KB / code / str(year) / f"{code}_{sc}_ms_{variant}.pdf"

                    if not ms_path.exists():
                        continue

                    # Skip if already in checkpoint
                    if paper_id in checkpoint:
                        # Restore from checkpoint
                        for qid, data in checkpoint[paper_id].items():
                            all_results[qid] = data
                            subj_qs += 1
                        subj_pdfs += 1
                        continue

                    # Extract text
                    ms_text = extract_ms_text(str(ms_path))
                    if not ms_text or len(ms_text) < 100:
                        print(f"  SKIP {paper_id}: no MS content", flush=True)
                        continue

                    # Call LLM
                    print(f"  {paper_id}: calling LLM...", end="", flush=True)
                    result = call_openai(ms_text, paper_id)

                    if not result or "questions" not in result:
                        print(f" FAILED", flush=True)
                        continue

                    # Process results
                    paper_results = {}
                    questions = result["questions"]

                    for q in questions:
                        label = q.get("label", "")
                        mps = q.get("mark_points", [])
                        total = q.get("total_marks", len(mps))

                        qid = ms_label_to_qid(paper_id, label)
                        if not qid:
                            continue

                        # Validation Layer 1: internal consistency
                        if len(mps) != total:
                            validation_warnings.append(f"WARN {qid}: mark_points={len(mps)} != total_marks={total}")
                            # Use mark_points count as truth
                            total = len(mps)

                        if mps:
                            data = {"marks": total, "mark_points": mps}
                            paper_results[qid] = data
                            all_results[qid] = data
                            subj_qs += 1

                    checkpoint[paper_id] = paper_results
                    subj_pdfs += 1
                    subj_new += 1
                    print(f" {len(questions)} questions, {len(paper_results)} with mark_points", flush=True)

                    # Save checkpoint periodically
                    if subj_new % 5 == 0:
                        save_checkpoint(code, checkpoint)

                    if TEST_MODE:
                        print(f"\n=== TEST RESULTS: {paper_id} ===", flush=True)
                        for q in sorted(questions, key=lambda x: x.get("label", "")):
                            label = q["label"]
                            mps = q.get("mark_points", [])
                            qid = ms_label_to_qid(paper_id, label)
                            print(f"  {label} → {qid}: {len(mps)} marks", flush=True)
                            for mp in mps:
                                print(f"    {mp['id']}: {mp['text'][:80]}", flush=True)
                        return

                    time.sleep(0.5)

        save_checkpoint(code, checkpoint)
        total_pdfs += subj_pdfs
        total_questions += subj_qs
        print(f"  {code}: {subj_qs} questions from {subj_pdfs} PDFs ({subj_new} new)", flush=True)

    print(f"\nTotal: {total_questions} questions from {total_pdfs} PDFs", flush=True)

    # Log validation warnings
    if validation_warnings:
        log_path = os.path.join(BASE_DIR, "data", "markscheme_validation.log")
        with open(log_path, "w", encoding="utf-8") as f:
            f.write("\n".join(validation_warnings))
        print(f"Validation warnings: {len(validation_warnings)} (see {log_path})", flush=True)

    if TEST_MODE:
        return

    # Update DB
    print(f"\nUpdating {len(all_results)} questions in DB...", flush=True)
    updated = 0
    for qid, data in all_results.items():
        safe_id = qid.replace("'", "''")
        safe_mp = json.dumps(data["mark_points"]).replace("'", "''")
        marks = data["marks"]
        run_sql(f"UPDATE exam_questions SET marks = {marks}, mark_points = '{safe_mp}'::jsonb WHERE id = '{safe_id}'")
        updated += 1
        if updated % 200 == 0:
            print(f"  {updated}/{len(all_results)}...", flush=True)
        time.sleep(0.1)

    print(f"  {updated} updated", flush=True)

    # Update exam_papers total_marks
    time.sleep(3)
    run_sql("""UPDATE exam_papers ep SET total_marks = sub.total
        FROM (SELECT paper_id, sum(marks)::int AS total FROM exam_questions WHERE is_stem = false GROUP BY paper_id) sub
        WHERE ep.id = sub.paper_id""")
    print("exam_papers total_marks updated", flush=True)

    # Verification
    time.sleep(3)
    r = run_sql("SELECT count(*)::int AS c FROM exam_questions WHERE mark_points IS NOT NULL AND jsonb_array_length(mark_points) > 0 AND question_type != 'multiple_choice'")
    print(f"\nTheory/ATP with structured mark_points: {r[0]['c'] if r else '?'}", flush=True)

    r = run_sql("SELECT marks, count(*)::int AS c FROM exam_questions WHERE question_type != 'multiple_choice' GROUP BY marks ORDER BY marks")
    if r:
        print("Marks distribution:", flush=True)
        for row in r:
            print(f"  marks={row['marks']}: {row['c']}", flush=True)


if __name__ == "__main__":
    main()
