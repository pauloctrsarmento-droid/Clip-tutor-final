import os
"""
parse_questions.py — Deterministic parser for IGCSE Chemistry Paper 4 Theory QPs.

Extracts structured questions from Cambridge IGCSE question paper PDFs using
PyMuPDF positional text analysis. No AI, no costs.

Usage:
    python parse_questions.py <qp_pdf_path> [--output <json_path>]
"""
import fitz
import json
import re
import sys
from dataclasses import dataclass, field
from typing import Optional, Dict, List, Tuple
from pathlib import Path

# ── Position thresholds (from PDF analysis) ──────────────────────────
MAIN_Q_X_MAX = 55          # main question numbers at x < 55
PART_A_X_MIN = 65          # (a)(b)(c) parts at x >= 65
SUBPART_X_MIN = 82         # (i)(ii)(iii) parts at x >= 82
MARKS_X_MIN = 490          # [N] marks at x >= 490
FOOTER_Y_MIN = 790         # page footer below y=790
HEADER_Y_MAX = 50          # page header above y=50
RIGHT_MARGIN_X = 520       # right margin area

# ── Regex patterns ───────────────────────────────────────────────────
RE_MAIN_Q = re.compile(r'^(\d{1,2})$')
RE_PART = re.compile(r'^\(([a-z])\)')
RE_SUBPART = re.compile(r'^\(([ivx]+)\)')
RE_MARKS = re.compile(r'\[(\d+)\]')
RE_TOTAL = re.compile(r'\[Total:\s*(\d+)\]')
RE_FIG = re.compile(r'Fig\.\s*(\d+\.\d+)')
RE_TABLE = re.compile(r'Table\s+(\d+\.\d+)')
RE_DOTS = re.compile(r'\.{5,}')           # answer lines ........
RE_PAPER_CODE = re.compile(r'(\d{4}/\d{2}/[A-Z]/[A-Z]/\d{2})')

# ── Response type detection ──────────────────────────────────────────
RE_DRAWING = re.compile(
    r'(?i)'
    r'(complete the (dot.and.cross|energy|reaction|pathway|enthalpy|electron)'
    r'|draw (a |the |two |three |an? )?(diagram|graph|circuit|line|curve|dot.and.cross|repeat unit|structure|displayed|skeletal|molecule)'
    r'|sketch (a |the )(graph|curve|line|diagram)'
    r'|on (fig\.|the (grid|graph|diagram|axes)),?\s*(draw|plot|sketch|mark|show|add|label)'
    r'|add to (the |fig\.).*diagram'
    r'|mark on (the |fig\.)'
    r'|label (the |fig\.)'
    r'|complete (fig\.|the diagram)'
    r'|plot .*(graph|points|data)'
    r')'
)
RE_TABLE_RESP = re.compile(
    r'(?i)'
    r'(complete (the |)table'
    r'|complete table \d'
    r'|fill in the table'
    r')'
)
RE_LABELLING = re.compile(
    r'(?i)'
    r'(label (the |each |all )'
    r'|identify .* on (the |fig\.)'
    r'|name the (parts?|structures?|apparatus) .*(shown|labelled|in fig)'
    r')'
)
RE_CALCULATE = re.compile(
    r'(?i)'
    r'(^calculate\b'
    r'|^determine the (value|mass|volume|number|concentration|rate|percentage|amount)'
    r'|^work out\b'
    r'|^find the (value|mass|volume|number|concentration|rate|percentage|amount)'
    r'|determine the number of'
    r'|give your answer in (standard form|g |kg |mol|cm|dm|kJ)'
    r'|show your working'
    r')'
)
RE_MCQ_OPTIONS = re.compile(r'^\s*[A-D]\s+\S')

# ── SymbolMT Private Use Area → standard Unicode ────────────────────
SYMBOL_MAP = {
    "\uf0b4": "×",   # multiplication
    "\uf0b7": "·",   # middle dot
    "\uf0b8": "÷",   # division
    "\uf020": " ",   # space
    "\uf02d": "−",   # minus
    "\uf044": "Δ",   # delta
}
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
    # Strip control chars U+0000–U+001F except \n and \t
    result = "".join(c if c in "\n\t" or ord(c) > 0x1F else "" for c in result)
    # Strip U+FFFD replacement chars (PDF fill dots/dashes that didn't decode)
    result = result.replace("\ufffd", "")
    # Normalize thin spaces and non-breaking spaces
    result = result.replace("\u2009", " ").replace("\xa0", " ")
    result = re.sub(r"  +", " ", result)
    return result


def is_garbage_text(text):
    """Detect watermark/barcode garbage strings (high ratio of unusual chars)."""
    if len(text) < 3:
        return False
    unusual = sum(1 for c in text if ord(c) > 255 and c not in "×÷→°−Δ·⇌∆✓✗²³₂₃")
    return unusual / len(text) > 0.3


def extract_lines(page):
    """Extract text lines with position, font, and bold info from a page."""
    lines = []
    blocks = page.get_text("dict")["blocks"]
    for block in blocks:
        if block["type"] != 0:
            continue
        for line in block["lines"]:
            spans = line["spans"]
            if not spans:
                continue
            text = fix_text(spans)
            t = text.strip()
            if not t:
                continue
            # Skip garbage/watermark text
            if is_garbage_text(t):
                continue
            x0 = line["bbox"][0]
            y0 = line["bbox"][1]
            y1 = line["bbox"][3]
            font = spans[0]["font"]
            size = spans[0]["size"]
            bold = "Bold" in font or "BoldMT" in font
            lines.append({
                "text": t,
                "x": x0, "y0": y0, "y1": y1,
                "bold": bold, "font": font, "size": size,
            })
    lines.sort(key=lambda l: (l["y0"], l["x"]))
    return lines


def is_footer_header(line):
    """Check if a line is a page footer/header (not question content)."""
    if line["y0"] > FOOTER_Y_MIN:
        return True
    if line["y0"] < HEADER_Y_MAX and line["size"] < 12:
        return True
    text = line["text"]
    if RE_PAPER_CODE.match(text):
        return True
    if text.startswith("© UCLES") or text.startswith("© Cambridge"):
        return True
    if text == "[Turn over":
        return True
    return False


def classify_line(line):
    """Classify a line as question structure or content.

    Uses x-position + regex as primary criteria (NOT bold).
    Some papers use bold for question labels, others don't.
    """
    text = line["text"]
    x = line["x"]

    # Skip footer/header
    if is_footer_header(line):
        return "skip", None

    # Page number at top center (just a number, y < 50)
    if line["y0"] < HEADER_Y_MAX and RE_MAIN_Q.match(text) and x > 200:
        return "skip", None

    # Skip barcode, margin text, encoded strings
    if any(c in text for c in "ĬĊĠÍħ") or text.startswith("DO NOT WRITE"):
        return "skip", None
    if text.startswith("* ") and text.endswith(" *"):
        return "skip", None

    # "Either" / "Or" markers (English Lit) — skip but signal next number is a question
    if text in ("Either", "Or", "either", "or"):
        return "either_or", text

    # Total marks [Total: N]
    m = RE_TOTAL.search(text)
    if m:
        return "total_marks", int(m.group(1))

    # Inline marks [N] at right margin
    if x > MARKS_X_MIN and RE_MARKS.search(text):
        m = RE_MARKS.search(text)
        return "marks", int(m.group(1))

    # Main question number: standalone digit at x < 55
    if x < MAIN_Q_X_MAX and RE_MAIN_Q.match(text) and line["y0"] > HEADER_Y_MAX:
        return "main_question", int(text)
    # "Question N" format (English Lang)
    m_qn = re.match(r'^Question\s+(\d{1,2})$', text)
    if m_qn and line["y0"] > HEADER_Y_MAX:
        return "main_question", int(m_qn.group(1))

    # Sub-part label: (i), (ii), etc. — x >= 82, starts with roman numeral pattern
    # Check subpart BEFORE part to avoid (i) being caught as part
    if x >= SUBPART_X_MIN - 5:
        m_sub = RE_SUBPART.match(text)
        if m_sub:
            return "subpart", m_sub.group(1)

    # Part label: (a), (b), etc. — x >= 65
    if x >= PART_A_X_MIN:
        m_part = RE_PART.match(text)
        if m_part:
            return "part", m_part.group(1)

    # Check if marks are embedded at end of line
    m = RE_MARKS.search(text)
    if m and x > MARKS_X_MIN - 50:
        # Line has embedded marks — check if it's ONLY marks
        clean = RE_MARKS.sub("", text).strip()
        clean = RE_DOTS.sub("", clean).strip()
        if not clean:
            return "marks", int(m.group(1))

    # Content line
    return "content", text


def classify_response_type(text, marks):
    """Classify how the student should respond to this question.

    Returns: "drawing" | "table" | "labelling" | "numeric" | "mcq" | "text"
    """
    # Order matters: check most specific patterns first

    # Drawing: complete/draw/sketch a diagram, graph, dot-and-cross, etc.
    if RE_DRAWING.search(text):
        return "drawing"

    # Labelling: label parts on an existing diagram
    if RE_LABELLING.search(text):
        return "labelling"

    # Table: complete a table
    if RE_TABLE_RESP.search(text):
        return "table"

    # MCQ: has A/B/C/D options listed
    lines = text.split("\n")
    option_lines = sum(1 for l in lines if RE_MCQ_OPTIONS.match(l))
    if option_lines >= 3:
        return "mcq"

    # Numeric/calculation: calculate, determine, work out, give answer in...
    if RE_CALCULATE.search(text):
        return "numeric"

    # Default: text answer
    return "text"


def parse_qp(pdf_path):
    """Parse a question paper PDF into structured questions."""
    doc = fitz.open(pdf_path)
    # Build paper_id with full uniqueness: {code}_{session}_{variant}
    # e.g., "0620_s23_qp_41.pdf" → paper_id = "0620_s23_41"
    stem = Path(pdf_path).stem  # "0620_s23_qp_41" or "0620_s23_qp_1"
    m_paper = re.match(r'(\d{4})_([msw]\d{2})_qp_?(\d+)', stem)
    if m_paper:
        paper_id = f"{m_paper.group(1)}_{m_paper.group(2)}_{m_paper.group(3)}"
    else:
        paper_id = stem.replace("qp_", "").replace("qp", "")

    questions = []
    current_main = None
    current_part = None
    current_subpart = None
    current_text_lines = []
    current_marks = None
    pending_marks = None

    def flush_question():
        """Save the current question and reset state."""
        nonlocal current_text_lines, current_marks, pending_marks
        if current_main is None:
            current_text_lines = []
            return

        # Build question text
        text = "\n".join(current_text_lines).strip()
        # Clean answer lines
        text = RE_DOTS.sub("...", text)

        if not text:
            current_text_lines = []
            return

        # Determine part label
        if current_subpart:
            part_label = f"({current_part})({current_subpart})"
        elif current_part:
            part_label = f"({current_part})"
        else:
            part_label = None

        # Build question ID
        q_id = f"{paper_id}_q{current_main}"
        if current_part:
            q_id += current_part
        if current_subpart:
            q_id += f"_{current_subpart}"

        # Group ID
        group_id = f"{paper_id}_q{current_main}"

        # Detect marks (from pending or embedded)
        marks = current_marks or pending_marks or 0

        # Detect figure references
        figs = RE_FIG.findall(text)
        tables = RE_TABLE.findall(text)
        has_diagram = len(figs) > 0 or len(tables) > 0

        # Response type classification
        response_type = classify_response_type(text, marks)

        # Question type (legacy, kept for compat)
        if marks >= 4:
            q_type = "structured"
        elif marks <= 1:
            q_type = "short"
        else:
            q_type = "short"

        questions.append({
            "id": q_id,
            "question_number": current_main,
            "part_label": part_label,
            "group_id": group_id,
            "question_text": text,
            "marks": marks,
            "has_diagram": has_diagram,
            "fig_refs": figs,
            "table_refs": tables,
            "question_type": q_type,
            "response_type": response_type,
            "primary_topic_id": None,
            "secondary_topic_ids": [],
        })

        current_text_lines = []
        current_marks = None
        pending_marks = None

    expect_question_number = False  # Set by "Either"/"Or" markers

    # Process pages (skip cover = page 0)
    for page_num in range(1, len(doc)):
        page = doc[page_num]
        lines = extract_lines(page)

        for line in lines:
            kind, value = classify_line(line)

            if kind == "skip":
                continue

            elif kind == "either_or":
                expect_question_number = True
                continue

            # After "Either"/"Or", a standalone number at any x is a question number
            elif kind == "content" and expect_question_number:
                expect_question_number = False
                m_num = RE_MAIN_Q.match(value)
                if m_num:
                    kind = "main_question"
                    value = int(m_num.group(1))
                    # Fall through to main_question handler below

            if kind == "main_question":
                flush_question()
                current_main = value
                current_part = None
                current_subpart = None
                current_marks = None
                pending_marks = None
                current_text_lines = []

            elif kind == "part":
                flush_question()
                current_part = value
                current_subpart = None
                current_marks = None
                # Extract text after part label
                text = line["text"]
                m = RE_PART.match(text)
                if m:
                    rest = text[m.end():].strip()
                    if rest:
                        # Check if rest starts with a subpart: (c) (i) text → split
                        m_sub = RE_SUBPART.match(rest)
                        if m_sub:
                            # This is (c)(i) on one line — treat as subpart
                            flush_question()
                            current_subpart = m_sub.group(1)
                            rest = rest[m_sub.end():].strip()

                        # Check for embedded marks
                        m_marks = RE_MARKS.search(rest)
                        if m_marks:
                            pending_marks = int(m_marks.group(1))
                            rest = RE_MARKS.sub("", rest).strip()
                            rest = RE_DOTS.sub("", rest).strip()
                        if rest:
                            current_text_lines.append(rest)

            elif kind == "subpart":
                flush_question()
                current_subpart = value
                current_marks = None
                text = line["text"]
                m = RE_SUBPART.match(text)
                if m:
                    rest = text[m.end():].strip()
                    if rest:
                        m_marks = RE_MARKS.search(rest)
                        if m_marks:
                            pending_marks = int(m_marks.group(1))
                            rest = RE_MARKS.sub("", rest).strip()
                            rest = RE_DOTS.sub("", rest).strip()
                        if rest:
                            current_text_lines.append(rest)

            elif kind == "marks":
                current_marks = value

            elif kind == "total_marks":
                # Total marks for the whole question — don't override sub-part marks
                pass

            elif kind == "content":
                text = value
                # Check for embedded marks at end
                m_marks = RE_MARKS.search(text)
                if m_marks and line["x"] > MARKS_X_MIN - 100:
                    pending_marks = int(m_marks.group(1))
                    text = RE_MARKS.sub("", text).strip()
                    text = RE_DOTS.sub("", text).strip()
                # Skip pure answer lines
                if RE_DOTS.match(text):
                    continue
                if text and text != "...":
                    current_text_lines.append(text)

    # Flush last question
    flush_question()
    doc.close()

    # Post-process: assign part_order and sibling_count
    groups = {}
    for q in questions:
        gid = q["group_id"]
        if gid not in groups:
            groups[gid] = []
        groups[gid].append(q)

    for gid, parts in groups.items():
        for i, q in enumerate(parts):
            q["part_order"] = i
            q["sibling_count"] = len(parts)

    # Deduplicate IDs: if two questions have the same ID (alternative questions),
    # append _alt1, _alt2 etc. to make them unique
    seen_ids = {}
    for q in questions:
        qid = q["id"]
        if qid in seen_ids:
            seen_ids[qid] += 1
            q["id"] = f"{qid}_alt{seen_ids[qid]}"
            # Also update group_id to keep alternatives grouped separately
            q["group_id"] = f"{q['group_id']}_alt{seen_ids[qid]}"
        else:
            seen_ids[qid] = 0

    return questions


# ═══════════════════════════════════════════════════════════════════════
# MS-FIRST: Word-level marker scanning + content extraction
# Uses get_text("words") for structure, get_text("dict") for content.
# ═══════════════════════════════════════════════════════════════════════

@dataclass
class QMarker:
    """A question structure marker found in QP via word-level scan."""
    type: str       # "main", "part", "subpart", "marks", "either_or"
    page: int
    y: float
    number: int = 0
    value: str = ""
    marks_val: int = 0


@dataclass
class QRegion:
    """A question content region in the QP, bounded by markers."""
    q_suffix: str
    main: int
    part: Optional[str]
    subpart: Optional[str]
    page_start: int
    y_start: float
    page_end: int = 0
    y_end: float = 0.0
    marks: int = 0


def scan_qp_markers(doc) -> List[QMarker]:
    """Scan QP pages with word-level extraction to find question markers.

    Uses get_text("words") which returns individual words, solving the
    merged-span problem where "10 (a) A transformer..." becomes one span.
    """
    # Strict word-level regexes (must match ENTIRE word, unlike line-level RE_PART/RE_SUBPART)
    re_part_exact = re.compile(r'^\(([a-z])\)$')
    re_subpart_exact = re.compile(r'^\(([ivx]+)\)$')

    markers = []
    expect_question = False      # set by Either/Or
    saw_question_word = False    # set by "Question" (English Lang format)
    question_word_y = 0.0

    for page_num in range(1, len(doc)):  # skip cover page
        page = doc[page_num]
        words = page.get_text("words")
        # words: (x0, y0, x1, y1, "word", block_no, line_no, word_no)
        words.sort(key=lambda w: (w[1], w[0]))  # reading order: y then x

        for w in words:
            x0, y0, word = w[0], w[1], w[4]

            # Skip headers/footers
            if y0 > FOOTER_Y_MIN or y0 < HEADER_Y_MAX:
                continue

            # Skip page numbers at top center
            if y0 < HEADER_Y_MAX + 20 and x0 > 200:
                continue

            # Skip garbage/watermark text
            if is_garbage_text(word):
                continue
            if any(c in word for c in "ĬĊĠÍħ"):
                continue

            # ── "Question N" format (English Language) ──
            if word == "Question" and y0 > HEADER_Y_MAX + 20:
                saw_question_word = True
                question_word_y = y0
                continue

            if saw_question_word and RE_MAIN_Q.match(word) and abs(y0 - question_word_y) < 15:
                markers.append(QMarker(type="main", page=page_num, y=y0, number=int(word)))
                saw_question_word = False
                expect_question = False
                continue
            elif saw_question_word and not RE_MAIN_Q.match(word):
                saw_question_word = False

            # ── Either/Or markers ──
            # Only match capitalized forms at left margin (x < 100).
            # Lowercase "or"/"either" in content text must NOT trigger this.
            if word in ("Either", "Or") and x0 < 100 and y0 > HEADER_Y_MAX + 20:
                markers.append(QMarker(type="either_or", page=page_num, y=y0))
                expect_question = True
                continue

            # After Either/Or, next number is a question regardless of x position
            if expect_question and RE_MAIN_Q.match(word) and y0 > HEADER_Y_MAX:
                num = int(word)
                if num <= 50:  # sanity: French goes up to Q42, others up to ~15
                    markers.append(QMarker(type="main", page=page_num, y=y0, number=num))
                expect_question = False
                continue

            # ── Main question number: standalone digit at x < 55 ──
            if x0 < MAIN_Q_X_MAX and RE_MAIN_Q.match(word):
                num = int(word)
                if num <= 50:  # French goes up to Q42, others up to ~15
                    markers.append(QMarker(type="main", page=page_num, y=y0, number=num))
                    continue

            # ── Subpart label: (i), (ii) at x >= 77 — check BEFORE part ──
            if x0 >= SUBPART_X_MIN - 5:
                m = re_subpart_exact.match(word)
                if m:
                    markers.append(QMarker(type="subpart", page=page_num, y=y0, value=m.group(1)))
                    continue

            # ── Part label: (a), (b) at x >= 60 ──
            if x0 >= PART_A_X_MIN - 5:
                m = re_part_exact.match(word)
                if m:
                    markers.append(QMarker(type="part", page=page_num, y=y0, value=m.group(1)))
                    continue

            # ── Marks [N] at right margin ──
            if x0 >= MARKS_X_MIN:
                m = RE_MARKS.match(word)
                if m:
                    markers.append(QMarker(type="marks", page=page_num, y=y0, marks_val=int(m.group(1))))

    markers.sort(key=lambda m: (m.page, m.y))
    return markers


def build_qp_regions(markers: List[QMarker], last_page: int) -> List[QRegion]:
    """Convert markers into content regions with canonical q_suffix IDs."""
    regions = []
    current_main = None
    current_part = None
    current_subpart = None
    seen_mains = set()
    alt_counter = 0

    for marker in markers:
        if marker.type == "either_or":
            continue

        if marker.type == "marks":
            if regions:
                regions[-1].marks = marker.marks_val
            continue

        # Close previous region
        if regions:
            prev = regions[-1]
            if prev.page_end == 0:
                prev.page_end = marker.page
                prev.y_end = marker.y

        if marker.type == "main":
            # Detect alternative questions (same number seen before)
            if marker.number in seen_mains:
                alt_counter += 1
            else:
                alt_counter = 0
            seen_mains.add(marker.number)
            current_main = marker.number
            current_part = None
            current_subpart = None
        elif marker.type == "part":
            if current_main is None:
                continue
            current_part = marker.value
            current_subpart = None
        elif marker.type == "subpart":
            if current_main is None:
                continue
            current_subpart = marker.value

        # Build q_suffix
        suffix = f"q{current_main}"
        if current_part:
            suffix += current_part
        if current_subpart:
            suffix += f"_{current_subpart}"
        if alt_counter > 0:
            suffix += f"_alt{alt_counter}"

        regions.append(QRegion(
            q_suffix=suffix,
            main=current_main,
            part=current_part,
            subpart=current_subpart,
            page_start=marker.page,
            y_start=marker.y,
        ))

    # Close last region
    if regions and regions[-1].page_end == 0:
        regions[-1].page_end = last_page
        regions[-1].y_end = FOOTER_Y_MIN

    return regions


def extract_region_text(doc, region: QRegion) -> str:
    """Extract content text from a QP region using dict for SymbolMT handling."""
    text_parts = []

    for page_idx in range(region.page_start, region.page_end + 1):
        page = doc[page_idx]
        # Tolerance of 3pt for y_top: word-level and dict-level y positions
        # can differ by ~1-2pt due to font metrics (superscripts, etc.)
        y_top = (region.y_start - 3) if page_idx == region.page_start else HEADER_Y_MAX
        y_bot = region.y_end if page_idx == region.page_end else FOOTER_Y_MIN

        lines = extract_lines(page)

        for line in lines:
            if line["y0"] < y_top or line["y0"] >= y_bot:
                continue
            if is_footer_header(line):
                continue

            text = line["text"]
            x = line["x"]

            # Skip barcode/watermark
            if any(c in text for c in "ĬĊĠÍħ"):
                continue
            if text.startswith("DO NOT WRITE") or text == "[Turn over":
                continue
            if text.startswith("* ") and text.endswith(" *"):
                continue
            if text in ("Either", "Or", "either", "or"):
                continue

            # Skip standalone question numbers in the left column
            if x < MAIN_Q_X_MAX and RE_MAIN_Q.match(text):
                continue
            # Skip "Question N" labels
            if re.match(r'^Question\s+\d{1,2}$', text):
                continue

            # Strip leading question number from merged lines "10 (a) text..."
            if x < MAIN_Q_X_MAX:
                text = re.sub(r'^\d{1,2}\s*', '', text).strip()

            # Strip part label "(a) text..." → "text..."
            m = RE_PART.match(text)
            if m:
                text = text[m.end():].strip()
                # Check for embedded subpart: "(a)(i) text..."
                m2 = RE_SUBPART.match(text)
                if m2:
                    text = text[m2.end():].strip()
            else:
                # Strip subpart label "(i) text..."
                m = RE_SUBPART.match(text)
                if m and x >= SUBPART_X_MIN - 10:
                    text = text[m.end():].strip()

            # Total marks line
            if RE_TOTAL.search(text):
                continue

            # Marks at right margin — skip entirely
            if x > MARKS_X_MIN and RE_MARKS.search(text):
                continue

            # Inline marks — strip but keep content
            m_marks = RE_MARKS.search(text)
            if m_marks:
                text = RE_MARKS.sub("", text).strip()

            # Clean answer lines
            text = RE_DOTS.sub("...", text)
            if not text or text == "...":
                continue

            text_parts.append(text)

    return "\n".join(text_parts)


def parse_qp_ms_first(pdf_path) -> Tuple[List[QRegion], Dict[str, str]]:
    """Parse QP using word-level markers for structure, dict for content.

    Returns:
        regions: list of QRegion with q_suffix and position info
        content_map: dict mapping q_suffix → question text
    """
    doc = fitz.open(pdf_path)
    markers = scan_qp_markers(doc)
    regions = build_qp_regions(markers, len(doc) - 1)

    content_map = {}
    for region in regions:
        text = extract_region_text(doc, region)
        content_map[region.q_suffix] = text

    doc.close()
    return regions, content_map


def main():
    if len(sys.argv) < 2:
        print("Usage: python parse_questions.py <qp_pdf_path> [--output <json_path>])
        sys.exit(1)

    pdf_path = sys.argv[1]
    output_path = None
    if "--output" in sys.argv:
        idx = sys.argv.index("--output")
        output_path = sys.argv[idx + 1]

    questions = parse_qp(pdf_path)

    result = {
        "paper_id": Path(pdf_path).stem.replace("qp_", "qp"),
        "subject_code": "0620",
        "total_questions": len(questions),
        "questions": questions,
    }

    output = json.dumps(result, indent=2, ensure_ascii=False)

    if output_path:
        Path(output_path).write_text(output, encoding="utf-8")
        print(f"Wrote {len(questions)} questions to {output_path}")
    else:
        print(output)


if __name__ == "__main__":
    main()
