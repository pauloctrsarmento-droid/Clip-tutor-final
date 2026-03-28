"""
parse-mc.py — Parse Multiple Choice papers for Chemistry, Physics, Biology.

Extracts 40 questions per paper with options A-D, correct answers from MS,
and diagrams (rendered from vector drawings) per question.

Usage:
  py scripts/parse-mc.py                    # all 3 subjects
  py scripts/parse-mc.py --subject 0625     # physics only
  py scripts/parse-mc.py --dry-run          # count only, no DB/Storage writes

Steps:
  1. Parse QP text → questions with options
  2. Parse MS → correct answers (letter per question)
  3. Extract diagrams (reuses extract_diagrams.py logic)
  4. Insert into exam_papers + exam_questions
  5. Upload diagrams to Supabase Storage
"""

import fitz
import json
import os
import re
import sys
import glob
import time
import urllib.request
from pathlib import Path
from concurrent.futures import ThreadPoolExecutor, as_completed

sys.stdout.reconfigure(encoding="utf-8")

# ── Config ──────────────────────────────────────────────────────────
KB = Path(r"c:\Users\sarma\OneDrive\Ambiente de Trabalho\TUTOR FILHA\clip-tutor-kb\past-papers")
DIAGRAMS_DIR = Path(r"c:\Users\sarma\OneDrive\Ambiente de Trabalho\tutor final\data\diagrams")
SUPABASE_URL = "https://lltcfjmshnhfmavlxpxr.supabase.co"
SERVICE_KEY = os.environ["SUPABASE_SERVICE_ROLE_KEY"]
MGMT_TOKEN = os.environ["SUPABASE_ACCESS_TOKEN"]
MGMT_API = "https://api.supabase.com/v1/projects/lltcfjmshnhfmavlxpxr/database/query"

SUBJECTS = {
    "0620": ("chemistry", ["21", "22", "11", "12"]),
    "0625": ("physics", ["21", "22", "11", "12"]),
    "0610": ("biology", ["21", "22", "11", "12"]),
}

DRY_RUN = "--dry-run" in sys.argv
SUBJECT_FILTER = None
if "--subject" in sys.argv:
    idx = sys.argv.index("--subject")
    SUBJECT_FILTER = sys.argv[idx + 1]

# Diagram extraction params (from extract_diagrams.py)
SCALE = 2
PADDING = 25
MIN_CLUSTER_W = 25
MIN_CLUSTER_H = 10
MERGE_GAP = 15


# ── Supabase helpers ────────────────────────────────────────────────

def run_sql(sql, retries=3):
    for attempt in range(retries):
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
            if e.code == 429 and attempt < retries - 1:
                time.sleep(3 * (attempt + 1))
                continue
            body = e.read().decode()
            print(f"  SQL ERROR {e.code}: {body[:200]}")
            raise


def supabase_rest(path, method="GET", data=None, prefer=None):
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
        err = e.read().decode()
        print(f"  REST ERROR {e.code}: {err[:200]}")
        raise


def upload_file(local_path, storage_path):
    url = f"{SUPABASE_URL}/storage/v1/object/diagrams/{storage_path}"
    with open(local_path, "rb") as f:
        file_data = f.read()
    for attempt in range(3):
        req = urllib.request.Request(url, data=file_data, method="POST", headers={
            "apikey": SERVICE_KEY,
            "Authorization": f"Bearer {SERVICE_KEY}",
            "Content-Type": "image/png",
            "x-upsert": "true",
        })
        try:
            resp = urllib.request.urlopen(req, timeout=30)
            resp.read()
            return True
        except Exception:
            if attempt < 2:
                time.sleep(1)
    return False


# ── MS Parser ───────────────────────────────────────────────────────

def parse_ms(ms_path):
    """Parse MC mark scheme → {1: 'D', 2: 'B', ...}"""
    doc = fitz.open(str(ms_path))
    answers = {}
    for page in doc:
        text = page.get_text()
        # Pattern: question number, answer letter, marks
        for m in re.finditer(r'(\d{1,2})\s+([ABCD])\s+1', text):
            qnum = int(m.group(1))
            if 1 <= qnum <= 40:
                answers[qnum] = m.group(2)
    doc.close()
    return answers


# ── QP Parser ───────────────────────────────────────────────────────

def parse_qp(qp_path):
    """Parse MC question paper → list of questions with text and options."""
    doc = fitz.open(str(qp_path))
    full_text = ""
    for page in doc:
        full_text += page.get_text() + "\n"
    doc.close()

    questions = []
    # Split by question number pattern at start of line
    # MC questions start with just the number (1, 2, ... 40)
    parts = re.split(r'\n(\d{1,2})\s+(?=[A-Z])', full_text)

    # Try to find questions via numbered pattern
    current_q = None
    for i in range(len(parts)):
        part = parts[i].strip()
        # Check if this part is a question number
        if re.match(r'^\d{1,2}$', part):
            qnum = int(part)
            if 1 <= qnum <= 40 and i + 1 < len(parts):
                current_q = qnum
                continue
        if current_q is not None:
            # This part is the question text
            text = part

            # Extract options A, B, C, D
            options = {}
            # Try to find A/B/C/D options
            opt_pattern = re.compile(r'\n\s*([ABCD])\s+(.+?)(?=\n\s*[ABCD]\s+|\Z)', re.DOTALL)
            opt_matches = list(opt_pattern.finditer(text))

            if len(opt_matches) >= 2:
                # Text before first option is the question stem
                stem_end = opt_matches[0].start()
                q_text = text[:stem_end].strip()

                for om in opt_matches:
                    letter = om.group(1)
                    opt_text = om.group(2).strip()
                    # Clean up option text
                    opt_text = re.sub(r'\s+', ' ', opt_text)
                    opt_text = opt_text.split('\n')[0].strip()
                    options[letter] = opt_text
            else:
                q_text = text.strip()
                # Try simpler pattern: lines starting with A, B, C, D
                for line in text.split('\n'):
                    line = line.strip()
                    m = re.match(r'^([ABCD])\s+(.+)', line)
                    if m:
                        options[m.group(1)] = m.group(2).strip()

            # Clean up question text
            q_text = re.sub(r'\n+', ' ', q_text)
            q_text = re.sub(r'\s+', ' ', q_text).strip()
            # Remove page numbers, copyright, etc
            q_text = re.sub(r'©\s*UCLES\s*\d+', '', q_text)
            q_text = re.sub(r'\d+/\d+/[A-Z]/[A-Z]/\d+', '', q_text)
            q_text = re.sub(r'\[Turn over', '', q_text)
            q_text = q_text.strip()

            if q_text and len(q_text) > 10:
                questions.append({
                    "question_number": current_q,
                    "question_text": q_text,
                    "options": options,
                })
            current_q = None

    return questions


# ── Diagram Extraction (from extract_diagrams.py) ──────────────────

def find_drawing_clusters(page):
    drawings = page.get_drawings()
    if not drawings:
        return []

    pw, ph = page.rect.width, page.rect.height
    rects = []
    for d in drawings:
        r = d["rect"]
        if r.width < 2 and r.height < 2:
            continue
        if r.x0 > pw * 0.88:
            continue
        if r.height > ph * 0.8 and r.width < 10:
            continue
        if r.width > pw * 0.8 and r.height < 5:
            continue
        if r.y0 < 25 and r.y1 < 55:
            continue
        if r.y0 > ph - 30:
            continue
        if r.width < 25 and r.height < 25:
            if (r.x0 < 70 and r.y0 < 55) or (r.x0 < 70 and r.y1 > ph - 55) or (r.y1 > ph - 55):
                continue
        rects.append(r)

    if not rects:
        return []

    # Merge nearby rects into clusters
    clusters = []
    for rect in rects:
        merged = False
        for i in range(len(clusters)):
            c = clusters[i]
            if (rect.x0 < c.x1 + MERGE_GAP and rect.x1 > c.x0 - MERGE_GAP and
                rect.y0 < c.y1 + MERGE_GAP and rect.y1 > c.y0 - MERGE_GAP):
                clusters[i] = fitz.Rect(
                    min(c.x0, rect.x0), min(c.y0, rect.y0),
                    max(c.x1, rect.x1), max(c.y1, rect.y1))
                merged = True
                break
        if not merged:
            clusters.append(fitz.Rect(rect))

    # Multi-pass merge
    changed = True
    while changed:
        changed = False
        new_clusters = []
        used = set()
        for i in range(len(clusters)):
            if i in used:
                continue
            c = clusters[i]
            for j in range(i + 1, len(clusters)):
                if j in used:
                    continue
                c2 = clusters[j]
                if (c.x0 < c2.x1 + MERGE_GAP and c.x1 > c2.x0 - MERGE_GAP and
                    c.y0 < c2.y1 + MERGE_GAP and c.y1 > c2.y0 - MERGE_GAP):
                    c = fitz.Rect(min(c.x0, c2.x0), min(c.y0, c2.y0),
                                  max(c.x1, c2.x1), max(c.y1, c2.y1))
                    used.add(j)
                    changed = True
            new_clusters.append(c)
            used.add(i)
        clusters = new_clusters

    clusters = [c for c in clusters if c.width >= MIN_CLUSTER_W and c.height >= MIN_CLUSTER_H]
    clusters.sort(key=lambda c: c.y0)
    return clusters


def extract_mc_diagrams(qp_path, out_dir):
    """Extract diagrams from MC QP and map to question numbers by page position."""
    doc = fitz.open(str(qp_path))
    os.makedirs(out_dir, exist_ok=True)
    diagrams = {}  # question_number → filename

    for pn in range(1, len(doc)):
        page = doc[pn]
        clusters = find_drawing_clusters(page)
        if not clusters:
            continue

        # Get question numbers on this page by finding "^N " patterns
        text_dict = page.get_text("dict")
        q_positions = []  # (y_pos, question_number)
        for block in text_dict.get("blocks", []):
            if block.get("type") != 0:
                continue
            for line in block.get("lines", []):
                text = "".join(span["text"] for span in line.get("spans", [])).strip()
                m = re.match(r'^(\d{1,2})\s', text)
                if m:
                    qnum = int(m.group(1))
                    if 1 <= qnum <= 40:
                        y = line["bbox"][1]
                        q_positions.append((y, qnum))

        q_positions.sort()

        for cluster in clusters:
            # Skip tiny clusters (decorative)
            pad_pts = PADDING / SCALE
            crop = fitz.Rect(
                max(0, cluster.x0 - pad_pts),
                max(0, cluster.y0 - pad_pts),
                min(page.rect.width, cluster.x1 + pad_pts),
                min(page.rect.height, cluster.y1 + pad_pts))
            mat = fitz.Matrix(SCALE, SCALE)
            pix = page.get_pixmap(matrix=mat, clip=crop)
            png_data = pix.tobytes("png")

            if len(png_data) < 2000:
                continue
            if cluster.width < 40 and cluster.height < 40:
                continue

            # Find which question this diagram belongs to
            # = the question whose y position is closest above the cluster
            assigned_q = None
            cluster_y = cluster.y0
            for y, qnum in reversed(q_positions):
                if y <= cluster_y + 20:  # Allow some overlap
                    assigned_q = qnum
                    break

            if assigned_q:
                fname = f"q{assigned_q}.png"
            else:
                fname = f"unknown_page{pn}_y{int(cluster.y0)}.png"

            fpath = os.path.join(out_dir, fname)
            with open(fpath, "wb") as f:
                f.write(png_data)

            if assigned_q:
                diagrams[assigned_q] = fname

    doc.close()
    return diagrams


# ── Main Pipeline ───────────────────────────────────────────────────

def process_paper(code, session_code, variant, year):
    """Process one MC paper: parse QP + MS, extract diagrams, return data."""
    qp_path = KB / code / str(year) / f"{code}_{session_code}_qp_{variant}.pdf"
    ms_path = KB / code / str(year) / f"{code}_{session_code}_ms_{variant}.pdf"

    if not qp_path.exists():
        return None
    if not ms_path.exists():
        return None

    paper_id = f"{code}_{session_code}_{variant}"

    # 1. Parse MS
    answers = parse_ms(str(ms_path))
    if not answers:
        return None

    # 2. Parse QP
    questions = parse_qp(str(qp_path))

    # 3. Extract diagrams
    diag_dir = DIAGRAMS_DIR / paper_id
    diagrams = extract_mc_diagrams(str(qp_path), str(diag_dir))

    # 4. Build question records
    records = []
    for q in questions:
        qnum = q["question_number"]
        correct = answers.get(qnum)
        if not correct:
            continue

        options = q["options"]
        has_diagram = qnum in diagrams
        fig_refs = [str(qnum)] if has_diagram else []

        # Build mark_scheme with options
        ms_lines = [f"Correct answer: {correct}"]
        for letter in ["A", "B", "C", "D"]:
            opt_text = options.get(letter, "")
            marker = "correct" if letter == correct else "incorrect"
            ms_lines.append(f"{letter}: {opt_text} — {marker}")

        records.append({
            "id": f"{paper_id}_q{qnum}",
            "paper_id": paper_id,
            "subject_code": code,
            "question_number": qnum,
            "part_label": None,
            "group_id": None,
            "question_text": q["question_text"],
            "parent_context": None,
            "marks": 1,
            "correct_answer": correct,
            "mark_scheme": "\n".join(ms_lines),
            "mark_points": json.dumps([{"id": "M1", "text": f"Answer: {correct}"}]),
            "question_type": "multiple_choice",
            "response_type": "mcq",
            "has_diagram": has_diagram,
            "fig_refs": json.dumps(fig_refs),
            "table_refs": json.dumps([]),
            "evaluation_ready": True,
            "is_stem": False,
            "part_order": 0,
            "sibling_count": 1,
        })

    return {
        "paper_id": paper_id,
        "code": code,
        "session": session_code,
        "variant": variant,
        "year": year,
        "questions": records,
        "diagrams": diagrams,
        "diag_dir": str(diag_dir),
        "total_answers": len(answers),
    }


def main():
    print("=" * 60)
    print("CLIP Tutor — MC Paper Parser + Ingest")
    print("=" * 60)

    if DRY_RUN:
        print("[DRY RUN]\n")

    grand_papers = 0
    grand_questions = 0
    grand_diagrams = 0
    all_diagram_files = []

    for code, (name, variants) in sorted(SUBJECTS.items()):
        if SUBJECT_FILTER and code != SUBJECT_FILTER:
            continue

        subj_papers = 0
        subj_questions = 0
        subj_diagrams = 0

        print(f"\n--- {code} ({name}) ---")

        for year in range(2019, 2026):
            for session in ["m", "s", "w"]:
                for variant in variants:
                    session_code = f"{session}{str(year)[2:]}"
                    result = process_paper(code, session_code, variant, year)
                    if not result:
                        continue

                    n_q = len(result["questions"])
                    n_d = len(result["diagrams"])
                    subj_papers += 1
                    subj_questions += n_q
                    subj_diagrams += n_d

                    # Collect diagram files for upload
                    for qnum, fname in result["diagrams"].items():
                        fpath = os.path.join(result["diag_dir"], fname)
                        if os.path.exists(fpath):
                            storage_path = f"{result['paper_id']}/{fname}"
                            all_diagram_files.append((fpath, storage_path))

                    if not DRY_RUN and n_q > 0:
                        # Insert paper
                        paper_row = {
                            "id": result["paper_id"],
                            "subject_code": code,
                            "session": result["session"],
                            "variant": result["variant"],
                            "year": result["year"],
                            "total_questions": n_q,
                            "total_marks": n_q,
                            "qp_url": f"{SUPABASE_URL}/storage/v1/object/public/papers/{result['paper_id']}/qp.pdf",
                            "ms_url": f"{SUPABASE_URL}/storage/v1/object/public/papers/{result['paper_id']}/ms.pdf",
                        }
                        try:
                            supabase_rest("exam_papers", method="POST", data=paper_row,
                                         prefer="resolution=merge-duplicates,return=minimal")
                        except Exception:
                            pass  # May already exist

                        # Insert questions in batches
                        for i in range(0, len(result["questions"]), 100):
                            batch = result["questions"][i:i+100]
                            try:
                                supabase_rest("exam_questions", method="POST", data=batch,
                                             prefer="resolution=merge-duplicates,return=minimal")
                            except Exception as e:
                                print(f"  WARN insert batch: {e}")

        grand_papers += subj_papers
        grand_questions += subj_questions
        grand_diagrams += subj_diagrams
        print(f"  {subj_papers} papers, {subj_questions} questions, {subj_diagrams} with diagrams")

    print(f"\n{'='*60}")
    print(f"Parsed: {grand_papers} papers, {grand_questions} questions, {grand_diagrams} diagrams")

    # Upload diagrams
    if all_diagram_files and not DRY_RUN:
        print(f"\nUploading {len(all_diagram_files)} diagram PNGs to Storage...")
        uploaded = 0
        failed = 0
        with ThreadPoolExecutor(max_workers=10) as pool:
            futures = {pool.submit(upload_file, lp, sp): sp for lp, sp in all_diagram_files}
            for i, future in enumerate(as_completed(futures), 1):
                ok = future.result()
                if ok:
                    uploaded += 1
                else:
                    failed += 1
                if i % 50 == 0 or i == len(all_diagram_files):
                    print(f"  {i}/{len(all_diagram_files)} — {uploaded} ok, {failed} fail")
        print(f"  Diagrams uploaded: {uploaded} ok, {failed} fail")
    elif all_diagram_files:
        print(f"\n[DRY RUN] Would upload {len(all_diagram_files)} diagram PNGs")

    # Sample questions
    print(f"\n{'='*60}")
    print("Sample questions:")
    for code, (name, variants) in sorted(SUBJECTS.items()):
        if SUBJECT_FILTER and code != SUBJECT_FILTER:
            continue
        # Find first paper with questions
        for year in [2023]:
            for session in ["s"]:
                for variant in variants[:1]:
                    session_code = f"{session}{str(year)[2:]}"
                    result = process_paper(code, session_code, variant, year)
                    if result and result["questions"]:
                        for q in result["questions"][:2]:
                            print(f"\n  [{q['id']}] Q{q['question_number']}")
                            print(f"  Text: {q['question_text'][:150]}...")
                            print(f"  Answer: {q['correct_answer']}")
                            print(f"  Diagram: {q['has_diagram']}")
                        break

    print(f"\n{'='*60}")


if __name__ == "__main__":
    main()
