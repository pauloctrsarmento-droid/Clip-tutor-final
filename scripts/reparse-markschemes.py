"""
Re-parse Mark Scheme PDFs to extract structured mark points.
The MS PDFs are landscape (842x595). Layout:
  - x axis = vertical position (row), increasing downward
  - y axis ≈ 55 = Marks column (B1, C1, A1, M1)
  - y axis ≈ 400-720 = Answer text
  - y axis ≈ 740+ = Question label

Usage:
  py -u scripts/reparse-markschemes.py --test --subject 0625
  py -u scripts/reparse-markschemes.py
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
print("Re-parsing Mark Schemes...", flush=True)

KB = Path("c:/Users/sarma/OneDrive/Ambiente de Trabalho/TUTOR FILHA/clip-tutor-kb/past-papers")
SUPABASE_URL = "https://lltcfjmshnhfmavlxpxr.supabase.co"
SERVICE_KEY = os.environ["SUPABASE_SERVICE_ROLE_KEY"]
MGMT_TOKEN = os.environ["SUPABASE_ACCESS_TOKEN"]
MGMT_API = "https://api.supabase.com/v1/projects/lltcfjmshnhfmavlxpxr/database/query"

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

MP_LABEL = re.compile(r'^([MABCD]\d+)\b')


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


def parse_ms_pdf(pdf_path):
    """Parse landscape MS PDF. Returns {question_label: {mark_points: [...], total_marks: int}}"""
    doc = fitz.open(str(pdf_path))
    questions = {}

    for pn in range(len(doc)):
        page = doc[pn]
        pw, ph = page.rect.width, page.rect.height

        # Skip non-landscape or tiny pages
        if pw < 700:
            continue

        # Collect all text spans with positions
        spans = []
        for block in page.get_text("dict")["blocks"]:
            if block["type"] != 0:
                continue
            for line in block["lines"]:
                for span in line["spans"]:
                    t = span["text"].strip()
                    if not t:
                        continue
                    x0 = span["bbox"][0]  # vertical position (row)
                    y0 = span["bbox"][1]  # horizontal position (column)
                    spans.append((x0, y0, t))

        # Skip pages without "Question" header
        has_header = any(t == "Question" for _, _, t in spans)
        if not has_header:
            continue

        # Group spans by x position (same row = same x ±4px)
        rows = {}
        for x, y, text in spans:
            row_key = round(x / 4) * 4  # bucket by 4px
            if row_key not in rows:
                rows[row_key] = []
            rows[row_key].append((y, text))

        # Process each row
        current_q = None

        for row_x in sorted(rows.keys()):
            cells = sorted(rows[row_x], key=lambda c: c[0])  # sort by y (column position)

            # Skip header/footer rows
            row_text = " ".join(t for _, t in cells)
            if "Question" in row_text and "Answer" in row_text:
                continue
            if "UCLES" in row_text or "Cambridge" in row_text or "Page " in row_text:
                continue
            if "GENERIC" in row_text.upper() or "MARKING PRINCIPLE" in row_text.upper():
                continue
            if "May/June" in row_text or "Oct/Nov" in row_text or "Feb/Mar" in row_text:
                continue
            if "PUBLISHED" in row_text:
                continue

            # Identify columns by y position:
            # y < 100 = Marks column
            # y > 700 = Question label column
            # y 100-700 = Answer text

            marks_col = []
            answer_col = []
            question_col = []

            for y, text in cells:
                if y > 700:
                    question_col.append(text)
                elif y < 100:
                    marks_col.append(text)
                else:
                    answer_col.append(text)

            # Check for question label
            for qt in question_col:
                qt = qt.strip()
                if re.match(r'^\d{1,2}(?:\([a-z]\))?(?:\([ivx]+\))?$', qt):
                    current_q = qt
                    if current_q not in questions:
                        questions[current_q] = {"mark_points": [], "total_marks": 0}

            if not current_q:
                continue

            # Check marks column for mark point labels (B1, C1, M1, A1)
            for mt in marks_col:
                mt = mt.strip()
                if MP_LABEL.match(mt):
                    # This is a mark point label — pair with answer text
                    answer_text = " ".join(answer_col).strip()
                    # Remove (1) at end
                    answer_text = re.sub(r'\s*\(\d+\)\s*$', '', answer_text)

                    # Check if answer text starts with mark label too (some PDFs have it in both columns)
                    mp_in_answer = MP_LABEL.match(answer_text)
                    if mp_in_answer:
                        # Use the label from answer text, strip it
                        label = mp_in_answer.group(1)
                        answer_text = answer_text[mp_in_answer.end():].strip()
                    else:
                        label = mt

                    if answer_text:
                        questions[current_q]["mark_points"].append({"id": label, "text": answer_text})
                    else:
                        questions[current_q]["mark_points"].append({"id": label, "text": ""})

                elif re.match(r'^\d{1,2}$', mt):
                    # Total marks number
                    questions[current_q]["total_marks"] = int(mt)

            # If no mark label in marks column but we have answer text — could be continuation
            if not marks_col and answer_col and current_q:
                # Continuation of previous mark point's text
                if questions[current_q]["mark_points"]:
                    prev = questions[current_q]["mark_points"][-1]
                    extra = " ".join(answer_col).strip()
                    if extra and not re.match(r'^Question|Answer|Marks', extra):
                        prev["text"] += " " + extra

    doc.close()

    # Post-process
    for label, data in questions.items():
        # For questions with total_marks but no parsed mark_points
        if not data["mark_points"] and data["total_marks"] > 0:
            data["mark_points"] = [{"id": f"B{i+1}", "text": ""} for i in range(data["total_marks"])]

        # Use mark_points count as marks
        if data["mark_points"]:
            data["total_marks"] = len(data["mark_points"])

    return questions


def main():
    BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    CHECKPOINT = os.path.join(BASE_DIR, "data", "markscheme_parsed.json")

    all_parsed = {}
    total_pdfs = 0

    for code, variants in sorted(SUBJECTS.items()):
        if SUBJECT_FILTER and code != SUBJECT_FILTER:
            continue

        subj_qs = 0
        subj_pdfs = 0

        for year in range(2019, 2026):
            for session in ["m", "s", "w"]:
                for variant in variants:
                    sc = f"{session}{str(year)[2:]}"
                    ms_path = KB / code / str(year) / f"{code}_{sc}_ms_{variant}.pdf"
                    if not ms_path.exists():
                        continue

                    paper_id = f"{code}_{sc}_{variant}"

                    try:
                        parsed = parse_ms_pdf(str(ms_path))
                    except Exception as e:
                        print(f"  ERROR {paper_id}: {e}", flush=True)
                        continue

                    subj_pdfs += 1
                    total_pdfs += 1

                    for label, data in parsed.items():
                        qid = ms_label_to_qid(paper_id, label)
                        if not qid:
                            continue
                        if data["mark_points"]:
                            all_parsed[qid] = {
                                "marks": data["total_marks"],
                                "mark_points": data["mark_points"],
                            }
                            subj_qs += 1

                    if TEST_MODE:
                        print(f"\n=== TEST: {paper_id} ({len(parsed)} questions) ===", flush=True)
                        for label in sorted(parsed.keys(), key=lambda l: (int(re.match(r'(\d+)', l).group(1)), l)):
                            data = parsed[label]
                            qid = ms_label_to_qid(paper_id, label)
                            print(f"  {label} → {qid}: {len(data['mark_points'])} marks", flush=True)
                            for mp in data["mark_points"]:
                                print(f"    {mp['id']}: {mp['text'][:80]}", flush=True)
                        return

        print(f"  {code}: {subj_qs} questions with mark_points from {subj_pdfs} PDFs", flush=True)

    print(f"\nTotal: {len(all_parsed)} questions parsed from {total_pdfs} PDFs", flush=True)

    # Save
    os.makedirs(os.path.dirname(CHECKPOINT), exist_ok=True)
    with open(CHECKPOINT, "w", encoding="utf-8") as f:
        json.dump(all_parsed, f, ensure_ascii=False)
    print(f"Saved checkpoint", flush=True)

    if TEST_MODE:
        return

    # Update DB
    print(f"\nUpdating DB...", flush=True)
    updated = 0
    for qid, data in all_parsed.items():
        safe_id = qid.replace("'", "''")
        safe_mp = json.dumps(data["mark_points"]).replace("'", "''")
        run_sql(f"UPDATE exam_questions SET marks = {data['marks']}, mark_points = '{safe_mp}'::jsonb WHERE id = '{safe_id}'")
        updated += 1
        if updated % 500 == 0:
            print(f"  {updated}/{len(all_parsed)}...", flush=True)
        time.sleep(0.1)

    print(f"  {updated} updated", flush=True)

    # Update exam_papers
    time.sleep(3)
    run_sql("""UPDATE exam_papers ep SET total_marks = sub.total
        FROM (SELECT paper_id, sum(marks)::int AS total FROM exam_questions WHERE is_stem = false GROUP BY paper_id) sub
        WHERE ep.id = sub.paper_id""")
    print("exam_papers updated", flush=True)


if __name__ == "__main__":
    main()
