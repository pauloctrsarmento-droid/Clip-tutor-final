import os
"""
parse_markscheme.py — Deterministic parser for IGCSE Chemistry Paper 4 Mark Schemes.

Handles both page orientations found across different years:
- rotation=90 (s23 style): columns by y-position, rows by x-position
- rotation=0 landscape (w25 style): columns by x-position, rows by y-position

Usage:
    python parse_markscheme.py <ms_pdf_path> [--output <json_path>]
"""
import fitz
import json
import re
import sys
from pathlib import Path

# ── Regex ────────────────────────────────────────────────────────────
RE_Q_LABEL = re.compile(
    r'^(\d{1,2})'            # main question number
    r'(?:\(([a-z])\))?'      # optional (a)
    r'(?:\(([ivx]+)\))?'     # optional (i)
    r'$'
)
RE_MARK_CODE = re.compile(r'^(M\d+|B\d+|C\d+|A\d+)\b')
RE_MARK_POINT = re.compile(r'\((\d+)\)\s*$')


def normalize_q_label(text):
    """Normalize malformed question labels from MS PDFs.

    Handles real typos found in Cambridge mark schemes:
      3(b(i)      → 3(b)(i)     missing ) after letter
      4(f)(iii)i  → 4(f)(iii)   trailing junk
      4biv        → 4(b)(iv)    no parentheses at all
      4e(i)       → 4(e)(i)     mixed format
    """
    t = text.strip()

    # Strip trailing mark-point numbers: 2(b)(ii)1. → 2(b)(ii), 8(b)(iii)1 → 8(b)(iii)
    # Cambridge MS sometimes numbers marks within a subpart (with or without dot)
    t = re.sub(r'\)(\d+)\.?\s*$', ')', t).strip()

    # Already matches standard format — return as-is
    if RE_Q_LABEL.match(t):
        return t

    # Strip trailing junk chars (repeated roman chars)
    t = re.sub(r'([ivx]+)\)([ivx]+)$', r'\1)', t)

    # Fix missing ) after letter: 3(b(i) → 3(b)(i)
    t = re.sub(r'^(\d+)\(([a-z])\(', r'\1(\2)(', t)

    # No parentheses at all: 4biv → 4(b)(iv)
    m = re.match(r'^(\d+)([a-z])([ivx]+)$', t)
    if m:
        t = f"{m.group(1)}({m.group(2)})({m.group(3)})"

    # Mixed format: 4e(i) → 4(e)(i)
    m = re.match(r'^(\d+)([a-z])\(([ivx]+)\)$', t)
    if m:
        t = f"{m.group(1)}({m.group(2)})({m.group(3)})"

    # Verify it now matches
    if RE_Q_LABEL.match(t):
        return t

    return text.strip()  # return original if nothing worked

# ── SymbolMT PUA → standard Unicode ─────────────────────────────────
SYMBOL_MAP = {
    "\uf0b4": "×", "\uf0b7": "·", "\uf0b8": "÷",
    "\uf020": " ", "\uf02d": "−", "\uf044": "Δ",
}

# Skip patterns for non-content text
SKIP_PATTERNS = [
    "0620/", "© UCLES", "© Cambridge", "Page ", "PUBLISHED",
    "Mark Scheme", "Cambridge IGCSE", "May/June", "Oct/Nov",
    "October/November", "March", "February", "Generic Marking",
    "GENERIC MARKING", "Question", "Answer", "Marks",
    "Science-Specific", "Calculation specific", "Guidance for",
    "Rules must be", "Marks must be", "Marks awarded",
    "Examiners should", "The examiner", "Although spellings",
    "The error carried", "List rule", "For questions that",
    "The response should", "Any response marked", "Incorrect responses",
    "Read the entire", "Non-contradictory", "Correct answers",
    "For answers given", "Unless a separate", "Exceptions to",
    "Multiples / fractions", "State symbols", "marks are awarded",
    "marks are not deducted", "answers should only",
    "This document consists", "This mark scheme",
    "examination.", "Teachers.", "Cambridge International",
]


def is_content_page(page):
    """Check if this page has the mark scheme table (Question/Answer/Marks headers).

    Handles variations:
    - Separate headers: "Question", "Answer", "Marks"
    - Combined header: "Question Answer"
    - Singular: "Mark" (without 's')
    """
    text = page.get_text()
    has_question = "Question" in text
    has_answer = "Answer" in text
    has_marks = "Marks" in text or "Mark" in text
    return has_question and has_answer and has_marks


def detect_layout(page):
    """Detect the table layout orientation from actual header positions.

    Returns:
        'normal': columns by x-position, rows by y
        'rotated': columns by y-position, rows by x
    """
    # Find Question/Answer/Marks headers and check their positions
    headers = find_column_boundaries(page, "probe")
    if len(headers) >= 2:
        positions = list(headers.values())
        # If headers have similar y but different x → normal layout
        y_spread = max(p[1] for p in positions) - min(p[1] for p in positions)
        x_spread = max(p[0] for p in positions) - min(p[0] for p in positions)
        if y_spread < 20 and x_spread > 100:
            return "normal"
        if x_spread < 20 and y_spread > 100:
            return "rotated"

    # Fallback to page geometry
    if page.rotation == 90:
        return "rotated"
    w, h = page.rect.width, page.rect.height
    if w > h:
        return "normal"
    return "rotated"


def find_column_boundaries(page, layout):
    """Find the x or y positions of the three column headers.

    Handles variations:
    - Separate: "Question", "Answer", "Marks"
    - Combined: "Question Answer" as one element
    - Singular: "Mark" (without 's')
    """
    blocks = page.get_text("dict")["blocks"]
    headers = {}
    for block in blocks:
        if block["type"] != 0:
            continue
        for line in block["lines"]:
            text = "".join(s["text"] for s in line["spans"]).strip()
            x0 = line["bbox"][0]
            y0 = line["bbox"][1]
            if text == "Question":
                headers["question"] = (x0, y0)
            elif text == "Question Answer":
                # Combined header — Question is at start, Answer is implicit
                headers["question"] = (x0, y0)
                headers["answer"] = (x0, y0)  # same position, will use question+offset
            elif text == "Answer":
                headers["answer"] = (x0, y0)
            elif text in ("Marks", "Mark"):
                headers["marks"] = (x0, y0)
            if len(headers) == 3:
                break
        if len(headers) == 3:
            break
    return headers


def fix_text(spans):
    """Join spans with symbol translation and control char stripping."""
    parts = []
    for s in spans:
        font = s.get("font", "")
        text = s["text"]
        if "Symbol" in font:
            text = "".join(SYMBOL_MAP.get(c, c) for c in text)
        parts.append(text)
    result = "".join(parts)
    result = "".join(c if c in "\n\t" or ord(c) > 0x1F else "" for c in result)
    result = result.replace("\ufffd", "")
    result = result.replace("\u2009", " ").replace("\xa0", " ")
    import re as _re
    result = _re.sub(r"  +", " ", result)
    return result


def is_garbage_text(text):
    """Detect watermark/barcode garbage strings."""
    if len(text) < 3:
        return False
    unusual = sum(1 for c in text if ord(c) > 255 and c not in "×÷→°−Δ·⇌∆✓✗²³₂₃")
    return unusual / len(text) > 0.3


def extract_items(page):
    """Extract all text items with position info from page."""
    items = []
    blocks = page.get_text("dict")["blocks"]
    for block in blocks:
        if block["type"] != 0:
            continue
        for line in block["lines"]:
            spans = line["spans"]
            if not spans:
                continue
            text = fix_text(spans).strip()
            if not text or is_garbage_text(text):
                continue
            x0 = line["bbox"][0]
            y0 = line["bbox"][1]
            bold = any("Bold" in s.get("font", "") for s in spans)
            items.append({"text": text, "x": x0, "y": y0, "bold": bold})
    return items


def should_skip(text):
    """Check if text is boilerplate that should be skipped."""
    for pat in SKIP_PATTERNS:
        if text.startswith(pat):
            return True
    return False


def parse_page_normal(page):
    """Parse a normal landscape page (columns by x, rows by y)."""
    headers = find_column_boundaries(page, "normal")
    if not headers or "answer" not in headers:
        return []

    # Column boundaries: Question header is narrow (x~68-82),
    # Answer DATA starts at ~x=127 (not at header x=407 which is centered).
    # Use Question header + offset as the boundary.
    q_header_x = headers["question"][0]   # ~68
    marks_x = headers["marks"][0]         # ~741

    # Question column extends ~30pt past its header position
    q_col_max_x = q_header_x + 50        # ~118

    items = extract_items(page)

    # Filter boilerplate
    items = [i for i in items if not should_skip(i["text"])]

    # Classify each item into a column
    for item in items:
        if item["x"] >= marks_x - 30:
            item["col"] = "marks"
        elif item["x"] <= q_col_max_x:
            item["col"] = "question"
        else:
            item["col"] = "answer"

    # Group into rows by y-position proximity
    items.sort(key=lambda i: i["y"])
    rows = []
    current_row = []
    current_y = -999

    for item in items:
        if abs(item["y"] - current_y) > 12:
            if current_row:
                rows.append(current_row)
            current_row = [item]
            current_y = item["y"]
        else:
            current_row.append(item)

    if current_row:
        rows.append(current_row)

    return rows


def parse_page_rotated(page):
    """Parse a 90° rotated page (columns by y, rows by x)."""
    items = extract_items(page)
    items = [i for i in items if not should_skip(i["text"])]

    # In rotated pages: y < 75 = marks, y > 700 = question, else = answer
    for item in items:
        if item["y"] >= 700:
            item["col"] = "question"
        elif item["y"] < 75:
            item["col"] = "marks"
        else:
            item["col"] = "answer"

    # Group into rows by x-position proximity
    items.sort(key=lambda i: i["x"])
    rows = []
    current_row = []
    current_x = -999

    for item in items:
        if abs(item["x"] - current_x) > 12:
            if current_row:
                rows.append(current_row)
            current_row = [item]
            current_x = item["x"]
        else:
            current_row.append(item)

    if current_row:
        rows.append(current_row)

    # Filter out header rows (x < 55)
    rows = [r for r in rows if all(i["x"] > 55 for i in r)]

    return rows


def parse_ms(pdf_path):
    """Parse a mark scheme PDF into structured mark schemes per question."""
    doc = fitz.open(pdf_path)
    paper_id = Path(pdf_path).stem.replace("ms_", "ms")

    entries = []
    current_q_label = None
    current_answer_lines = []
    current_marks = None

    def flush_entry():
        nonlocal current_q_label, current_answer_lines, current_marks
        if current_q_label is None:
            current_answer_lines = []
            return

        answer_text = "\n".join(current_answer_lines).strip()
        if not answer_text and current_marks is None:
            current_answer_lines = []
            return

        m = RE_Q_LABEL.match(current_q_label)
        if not m:
            current_answer_lines = []
            return

        main_q = int(m.group(1))
        part = m.group(2)
        subpart = m.group(3)

        q_id_suffix = f"q{main_q}"
        if part:
            q_id_suffix += part
        if subpart:
            q_id_suffix += f"_{subpart}"

        if subpart:
            part_label = f"({part})({subpart})"
        elif part:
            part_label = f"({part})"
        else:
            part_label = None

        # Parse mark scheme structure
        mark_points = []
        correct_answer = None

        for line in current_answer_lines:
            line = line.strip()
            if not line:
                continue
            # Skip check marks ✓(1) — they're part of table answers
            if line.startswith("✓"):
                continue
            m_code = RE_MARK_CODE.match(line)
            if m_code:
                mark_points.append(line)
            elif not mark_points and not correct_answer:
                correct_answer = line
            else:
                if mark_points:
                    mark_points[-1] += " " + line
                elif correct_answer:
                    correct_answer += " " + line

        if not mark_points and correct_answer:
            mark_scheme = correct_answer
        else:
            mark_scheme = "; ".join(mark_points)

        if not correct_answer and mark_points:
            parts_clean = []
            for mp in mark_points:
                clean = RE_MARK_CODE.sub("", mp).strip()
                clean = RE_MARK_POINT.sub("", clean).strip()
                if clean:
                    parts_clean.append(clean)
            correct_answer = "; ".join(parts_clean)

        entries.append({
            "q_id_suffix": q_id_suffix,
            "question_number": main_q,
            "part_label": part_label,
            "correct_answer": correct_answer or "",
            "mark_scheme": mark_scheme,
            "marks": current_marks or 0,
            "mark_points": mark_points,
        })

        current_answer_lines = []
        current_marks = None

    for page_num in range(len(doc)):
        page = doc[page_num]

        if not is_content_page(page):
            continue

        layout = detect_layout(page)
        if layout == "normal":
            rows = parse_page_normal(page)
        else:
            rows = parse_page_rotated(page)

        for row in rows:
            q_label = None
            answer_parts = []
            marks_val = None

            for item in row:
                col = item.get("col")
                if col == "question":
                    text = normalize_q_label(item["text"].strip())
                    if RE_Q_LABEL.match(text):
                        if q_label is None:
                            # First match — take it as label
                            q_label = text
                        else:
                            # Second match in same row — previous was the real label,
                            # this is likely an answer value (e.g., "1" for pH)
                            # that landed in the question column. Move to answer.
                            answer_parts.append(item)
                    else:
                        # Non-label text in question column — treat as answer overflow
                        answer_parts.append(item)
                elif col == "marks":
                    try:
                        marks_val = int(item["text"].strip())
                    except ValueError:
                        # Try extracting digits from mark codes like B1, C1, A3
                        digits = re.sub(r'[^0-9]', '', item["text"].strip())
                        if digits:
                            marks_val = int(digits)
                elif col == "answer":
                    answer_parts.append(item)

            # Sort answer parts by position
            answer_parts.sort(key=lambda a: a["y"])

            if q_label:
                flush_entry()
                current_q_label = q_label
                current_answer_lines = [a["text"] for a in answer_parts]
                current_marks = marks_val
            elif answer_parts and current_q_label:
                for a in answer_parts:
                    current_answer_lines.append(a["text"])
            elif marks_val is not None and current_q_label and current_marks is None:
                current_marks = marks_val

    flush_entry()
    doc.close()

    return entries


def main():
    if len(sys.argv) < 2:
        print("Usage: python parse_markscheme.py <ms_pdf_path> [--output <json_path>])
        sys.exit(1)

    pdf_path = sys.argv[1]
    output_path = None
    if "--output" in sys.argv:
        idx = sys.argv.index("--output")
        output_path = sys.argv[idx + 1]

    entries = parse_ms(pdf_path)

    result = {
        "paper_id": Path(pdf_path).stem.replace("ms_", "ms"),
        "total_entries": len(entries),
        "entries": entries,
    }

    output = json.dumps(result, indent=2, ensure_ascii=False)

    if output_path:
        Path(output_path).write_text(output, encoding="utf-8")
        print(f"Wrote {len(entries)} mark scheme entries to {output_path}")
    else:
        print(output)


if __name__ == "__main__":
    main()
