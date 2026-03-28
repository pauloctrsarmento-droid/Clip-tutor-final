"""
Extract real question text from MC QP PDFs and update exam_questions.
Uses PyMuPDF text extraction. Updates question_text + mark_scheme.

Usage: py -u scripts/extract-mc-text.py
"""

import fitz
import json
import os
import re
import sys
import time
import requests

sys.stdout.reconfigure(encoding="utf-8")
print("Starting MC text extraction...", flush=True)

KB = "c:/Users/sarma/OneDrive/Ambiente de Trabalho/TUTOR FILHA/clip-tutor-kb/past-papers"
SUPABASE_URL = "https://lltcfjmshnhfmavlxpxr.supabase.co"
SERVICE_KEY = os.environ["SUPABASE_SERVICE_ROLE_KEY"]
MGMT_TOKEN = os.environ["SUPABASE_ACCESS_TOKEN"]
MGMT_API = "https://api.supabase.com/v1/projects/lltcfjmshnhfmavlxpxr/database/query"

SUBJECTS = {"0620": ["21", "22", "11", "12"], "0625": ["21", "22", "11", "12"], "0610": ["21", "22", "11", "12"]}


def run_sql(sql):
    for attempt in range(3):
        try:
            r = requests.post(MGMT_API, json={"query": sql}, headers={
                "Authorization": f"Bearer {MGMT_TOKEN}", "User-Agent": "supabase-cli/2.84.4",
            }, timeout=15)
            r.raise_for_status()
            return r.json()
        except Exception:
            if attempt < 2: time.sleep(3)
    return []


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


def extract_questions_from_pdf(qp_path):
    """Extract questions 1-40 with their text and options from a MC QP PDF."""
    doc = fitz.open(str(qp_path))

    # Collect all text with page info
    full_text = ""
    for pn in range(1, len(doc)):  # Skip cover page
        page = doc[pn]
        text = page.get_text()
        # Clean up common artifacts
        text = re.sub(r'©\s*UCLES\s*\d+', '', text)
        text = re.sub(r'\d{4}/\d{2}/[A-Z]/[A-Z]/\d{2}', '', text)
        text = re.sub(r'\[Turn over', '', text)
        text = re.sub(r'^\d+\s*$', '', text, flags=re.MULTILINE)  # lone page numbers
        full_text += text + "\n"
    doc.close()

    questions = {}

    # Split by question numbers: look for "N " at line start where N is 1-40
    # Pattern: number followed by space and then text (not just a lone number)
    pattern = re.compile(r'\n\s*(\d{1,2})\s+([A-Z].*?)(?=\n\s*(?:\d{1,2})\s+[A-Z]|\Z)', re.DOTALL)

    for m in pattern.finditer("\n" + full_text):
        qnum = int(m.group(1))
        if qnum < 1 or qnum > 40:
            continue

        raw = m.group(2).strip()

        # Extract options A, B, C, D
        options = {}
        # Find last occurrence of A/B/C/D pattern
        opt_lines = []
        other_lines = []

        for line in raw.split('\n'):
            line = line.strip()
            if not line:
                continue
            opt_match = re.match(r'^([ABCD])\s+(.+)', line)
            if opt_match:
                opt_lines.append((opt_match.group(1), opt_match.group(2).strip()))
            else:
                other_lines.append(line)

        # Build options dict
        for letter, text in opt_lines:
            options[letter] = text

        # Question text is everything that's not an option
        q_text = ' '.join(other_lines)
        q_text = re.sub(r'\s+', ' ', q_text).strip()

        if q_text and len(q_text) > 5:
            questions[qnum] = {"text": q_text, "options": options}

    return questions


def main():
    # Get all MC question IDs from DB
    print("Fetching MC questions from DB...", flush=True)
    mc_questions = []
    offset = 0
    while True:
        r = requests.get(
            f"{SUPABASE_URL}/rest/v1/exam_questions?question_type=eq.multiple_choice&select=id,paper_id,question_number&order=id&offset={offset}&limit=1000",
            headers={"apikey": SERVICE_KEY, "Authorization": f"Bearer {SERVICE_KEY}"},
            timeout=15,
        )
        batch = r.json()
        mc_questions.extend(batch)
        if len(batch) < 1000:
            break
        offset += len(batch)

    print(f"  {len(mc_questions)} MC questions in DB", flush=True)

    # Group by paper_id
    by_paper = {}
    for q in mc_questions:
        pid = q["paper_id"]
        if pid not in by_paper:
            by_paper[pid] = []
        by_paper[pid].append(q)

    print(f"  {len(by_paper)} papers to process\n", flush=True)

    updated = 0
    failed = 0
    papers_done = 0

    for paper_id, questions in sorted(by_paper.items()):
        # Find QP PDF
        code = paper_id.split("_")[0]
        session = paper_id.split("_")[1]
        variant = paper_id.split("_")[2]

        # Find year from session code (e.g. s23 → 2023)
        year_suffix = re.search(r'\d+', session)
        if not year_suffix:
            continue
        year = 2000 + int(year_suffix.group())

        qp_path = f"{KB}/{code}/{year}/{code}_{session}_qp_{variant}.pdf"
        ms_path = f"{KB}/{code}/{year}/{code}_{session}_ms_{variant}.pdf"

        if not os.path.exists(qp_path):
            continue

        # Extract text
        try:
            extracted = extract_questions_from_pdf(qp_path)
        except Exception as e:
            print(f"  ERROR parsing {paper_id}: {e}", flush=True)
            continue

        # Get MS answers
        answers = parse_ms(ms_path) if os.path.exists(ms_path) else {}

        # Build updates
        updates = []
        for q in questions:
            qnum = q["question_number"]
            ext = extracted.get(qnum)
            if not ext:
                continue

            correct = answers.get(qnum, "?")
            options = ext["options"]

            # Build mark scheme
            ms_lines = [f"Correct: {correct}"]
            for letter in ["A", "B", "C", "D"]:
                opt_text = options.get(letter, "")
                ms_lines.append(f"{letter}: {opt_text}")

            mark_scheme = "\n".join(ms_lines)

            updates.append({
                "id": q["id"],
                "text": ext["text"],
                "mark_scheme": mark_scheme,
            })

        # Batch update via SQL
        for u in updates:
            safe_text = u["text"].replace("'", "''")
            safe_ms = u["mark_scheme"].replace("'", "''")
            safe_id = u["id"].replace("'", "''")
            run_sql(f"UPDATE exam_questions SET question_text = '{safe_text}', mark_scheme = '{safe_ms}' WHERE id = '{safe_id}'")
            updated += 1

        papers_done += 1
        if papers_done % 10 == 0 or papers_done == len(by_paper):
            print(f"  {papers_done}/{len(by_paper)} papers — {updated} questions updated", flush=True)

        time.sleep(0.2)

    print(f"\nDone: {updated} updated, {failed} failed", flush=True)

    # Verify
    time.sleep(2)
    r = run_sql("SELECT count(*)::int AS c FROM exam_questions WHERE question_type = 'multiple_choice' AND question_text LIKE 'MC Question%'")
    print(f"Remaining placeholders: {r[0]['c'] if r else '?'}", flush=True)

    r = run_sql("SELECT id, left(question_text, 80) AS txt FROM exam_questions WHERE question_type = 'multiple_choice' AND question_text NOT LIKE 'MC Question%' LIMIT 3")
    print("Samples:", flush=True)
    for row in (r or []):
        print(f"  {row['id']}: {row['txt']}", flush=True)


if __name__ == "__main__":
    main()
