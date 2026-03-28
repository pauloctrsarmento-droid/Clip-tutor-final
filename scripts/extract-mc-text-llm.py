"""
Extract MC question text via LLM. Sends full QP PDF text to gpt-4o-mini.
Overwrites ALL MC question_text (ignores previous parser results).

Usage: py -u scripts/extract-mc-text-llm.py [--test --subject 0625]
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
print("Extracting MC text via LLM...", flush=True)

KB = Path("c:/Users/sarma/OneDrive/Ambiente de Trabalho/TUTOR FILHA/clip-tutor-kb/past-papers")
OPENAI_KEY = os.environ["OPENAI_API_KEY"]
SUPABASE_URL = "https://lltcfjmshnhfmavlxpxr.supabase.co"
SERVICE_KEY = os.environ["SUPABASE_SERVICE_ROLE_KEY"]
MGMT_TOKEN = os.environ["SUPABASE_ACCESS_TOKEN"]
MGMT_API = "https://api.supabase.com/v1/projects/lltcfjmshnhfmavlxpxr/database/query"

BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SUBJECTS = {"0620": ["21", "22", "11", "12"], "0625": ["21", "22", "11", "12"], "0610": ["21", "22", "11", "12"]}

TEST_MODE = "--test" in sys.argv
SUBJECT_FILTER = None
if "--subject" in sys.argv:
    idx = sys.argv.index("--subject")
    SUBJECT_FILTER = sys.argv[idx + 1]

SYSTEM_PROMPT = """You are extracting multiple choice questions from a Cambridge IGCSE question paper.

For each question (1-40), extract:
- question_number: the number (1-40)
- question_text: the full question stem (everything before the options)
- options: {"A": "text", "B": "text", "C": "text", "D": "text"}

Rules:
- Include ALL text of the question stem, including any data, tables, or descriptions
- Do NOT include page numbers, copyright notices, or "Turn over"
- For questions with diagrams: include "See diagram" in the text but extract whatever text context exists
- Options A/B/C/D: extract the full option text
- Some questions have tabular options — extract each cell as the option text

Return JSON: {"questions": [{"question_number": 1, "question_text": "...", "options": {"A": "...", "B": "...", "C": "...", "D": "..."}}]}"""


def sql(query):
    for a in range(5):
        try:
            r = requests.post(MGMT_API, json={"query": query}, headers={
                "Authorization": f"Bearer {MGMT_TOKEN}", "User-Agent": "supabase-cli/2.84.4",
            }, timeout=15)
            r.raise_for_status()
            return r.json()
        except Exception:
            if a < 4: time.sleep(3 * (a + 1))
    return []


def extract_pdf_text(pdf_path):
    doc = fitz.open(str(pdf_path))
    pages = []
    for pn in range(1, len(doc)):  # Skip cover
        text = doc[pn].get_text()
        text = re.sub(r'©\s*UCLES\s*\d+', '', text)
        text = re.sub(r'\d{4}/\d{2}/[A-Z]/[A-Z]/\d{2}', '', text)
        text = re.sub(r'\[Turn over', '', text)
        pages.append(text.strip())
    doc.close()
    return "\n\n".join(pages)


def load_checkpoint():
    path = os.path.join(BASE_DIR, "data", "mc_text_llm_checkpoint.json")
    if os.path.exists(path):
        with open(path, encoding="utf-8") as f:
            return json.load(f)
    return {}


def save_checkpoint(data):
    path = os.path.join(BASE_DIR, "data", "mc_text_llm_checkpoint.json")
    os.makedirs(os.path.dirname(path), exist_ok=True)
    with open(path, "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False)


def main():
    checkpoint = load_checkpoint()
    print(f"Checkpoint: {len(checkpoint)} papers already done", flush=True)

    # Get all MC papers
    mc_papers = set()
    for code, variants in SUBJECTS.items():
        if SUBJECT_FILTER and code != SUBJECT_FILTER:
            continue
        for year in range(2019, 2026):
            for session in ["m", "s", "w"]:
                for variant in variants:
                    sc = f"{session}{str(year)[2:]}"
                    paper_id = f"{code}_{sc}_{variant}"
                    qp_path = KB / code / str(year) / f"{code}_{sc}_qp_{variant}.pdf"
                    if qp_path.exists():
                        mc_papers.add((paper_id, str(qp_path)))

    remaining = [(pid, path) for pid, path in sorted(mc_papers) if pid not in checkpoint]
    print(f"  {len(mc_papers)} total MC papers, {len(remaining)} remaining\n", flush=True)

    # Get MS answers for all papers
    print("Loading MS answers...", flush=True)
    ms_answers = {}
    for code, variants in SUBJECTS.items():
        if SUBJECT_FILTER and code != SUBJECT_FILTER:
            continue
        for year in range(2019, 2026):
            for session in ["m", "s", "w"]:
                for variant in variants:
                    sc = f"{session}{str(year)[2:]}"
                    paper_id = f"{code}_{sc}_{variant}"
                    ms_path = KB / code / str(year) / f"{code}_{sc}_ms_{variant}.pdf"
                    if not ms_path.exists():
                        continue
                    doc = fitz.open(str(ms_path))
                    answers = {}
                    for page in doc:
                        for m in re.finditer(r'(\d{1,2})\s+([ABCD])\s+1', page.get_text()):
                            qnum = int(m.group(1))
                            if 1 <= qnum <= 40:
                                answers[qnum] = m.group(2)
                    doc.close()
                    if answers:
                        ms_answers[paper_id] = answers

    print(f"  {len(ms_answers)} papers with MS answers\n", flush=True)

    processed = 0
    for paper_id, qp_path in remaining:
        print(f"  {paper_id}: extracting text...", end="", flush=True)

        pdf_text = extract_pdf_text(qp_path)
        if len(pdf_text) < 200:
            print(f" SKIP (too short)", flush=True)
            continue

        # Truncate if too long (gpt-4o-mini has 128K but let's be safe)
        if len(pdf_text) > 15000:
            pdf_text = pdf_text[:15000]

        print(f" calling LLM...", end="", flush=True)

        try:
            r = requests.post("https://api.openai.com/v1/chat/completions", json={
                "model": "gpt-4o-mini",
                "max_tokens": 8192,
                "temperature": 0,
                "response_format": {"type": "json_object"},
                "messages": [
                    {"role": "system", "content": SYSTEM_PROMPT},
                    {"role": "user", "content": f"Paper: {paper_id}\n\nQuestion paper text:\n{pdf_text}"},
                ],
            }, headers={"Authorization": f"Bearer {OPENAI_KEY}"}, timeout=90)

            resp = r.json()
            if "error" in resp:
                print(f" API ERROR: {resp['error'].get('message', '')[:80]}", flush=True)
                time.sleep(5)
                continue

            parsed = json.loads(resp["choices"][0]["message"]["content"])
            questions = parsed.get("questions", [])

            # Get MS answers for this paper
            answers = ms_answers.get(paper_id, {})

            # Build updates
            paper_data = {}
            for q in questions:
                qnum = q.get("question_number")
                qtext = q.get("question_text", "")
                options = q.get("options", {})
                if not qnum or not qtext:
                    continue

                correct = answers.get(qnum, "?")
                ms_lines = [f"Correct: {correct}"]
                for letter in ["A", "B", "C", "D"]:
                    ms_lines.append(f"{letter}: {options.get(letter, '')}")

                qid = f"{paper_id}_q{qnum}"
                paper_data[qid] = {
                    "question_text": qtext,
                    "mark_scheme": "\n".join(ms_lines),
                }

            checkpoint[paper_id] = paper_data
            processed += 1
            print(f" {len(questions)} questions", flush=True)

        except Exception as e:
            print(f" ERROR: {e}", flush=True)

        if processed % 5 == 0:
            save_checkpoint(checkpoint)

        if TEST_MODE and processed >= 1:
            print(f"\n=== TEST: {paper_id} ===", flush=True)
            for qid, data in sorted(paper_data.items()):
                print(f"  {qid}: {data['question_text'][:80]}...", flush=True)
                print(f"    MS: {data['mark_scheme'][:60]}", flush=True)
            return

        time.sleep(0.5)

    save_checkpoint(checkpoint)
    print(f"\n{processed} papers processed", flush=True)

    if TEST_MODE:
        return

    # Update DB — overwrite ALL MC questions
    print(f"\nUpdating DB...", flush=True)
    updated = 0
    for paper_id, questions in checkpoint.items():
        for qid, data in questions.items():
            safe_id = qid.replace("'", "''")
            safe_text = data["question_text"].replace("'", "''")
            safe_ms = data["mark_scheme"].replace("'", "''")
            sql(f"UPDATE exam_questions SET question_text = '{safe_text}', mark_scheme = '{safe_ms}' WHERE id = '{safe_id}'")
            updated += 1
            if updated % 500 == 0:
                print(f"  {updated}...", flush=True)
            time.sleep(0.05)

    print(f"  {updated} updated", flush=True)

    # Verify
    time.sleep(3)
    r = sql("SELECT count(*)::int AS c FROM exam_questions WHERE question_type = 'multiple_choice' AND question_text LIKE 'MC Question%'")
    print(f"Remaining placeholders: {r[0]['c'] if r else '?'}", flush=True)


if __name__ == "__main__":
    main()
