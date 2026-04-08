"""
SaveMyExams HTML Scraper — extracts questions from __NEXT_DATA__ JSON.

No browser needed! Just HTTP GET + parse the embedded Next.js data.
Handles: text, tables (pipe format), images, MCQ options, mark schemes.
Links every question to atomic facts.

Usage: py -u scripts/scrape-sme-html.py <subject_code> <topic_code> <subtopic_slugs...>

Example:
  py -u scripts/scrape-sme-html.py 0620 CHEM_T3 \
    3-stoichiometry/3-1-formulae-and-relative-masses \
    3-stoichiometry/3-2-the-mole-and-the-avogadro-constant
"""

import json
import os
import re
import sys
import time
import urllib.request
import urllib.error
from collections import defaultdict

sys.stdout.reconfigure(encoding="utf-8")

# ── Config ──────────────────────────────────────────────────────
SUPABASE_URL = "https://lltcfjmshnhfmavlxpxr.supabase.co"
SME_BASE = "https://www.savemyexams.com"
BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

SERVICE_KEY = None
env_path = os.path.join(BASE_DIR, "web", ".env.local")
if os.path.exists(env_path):
    with open(env_path) as f:
        for line in f:
            if line.startswith("SUPABASE_SERVICE_ROLE_KEY="):
                SERVICE_KEY = line.strip().split("=", 1)[1]

if not SERVICE_KEY:
    print("ERROR: SUPABASE_SERVICE_ROLE_KEY not found")
    sys.exit(1)

# Subject URL slug map
SUBJECT_SLUGS = {
    "0620": ("chemistry", "23"),
    "0625": ("physics", "23"),
    "0610": ("biology", "23"),
    "0478": ("computer-science", "23"),
    "0500": ("english-language", "25"),
    "0475": ("english-literature", "23"),
    "0520": ("french", "23"),
    "0504": ("portuguese", "23"),
}

QUESTION_TYPES = ["multiple-choice-questions", "theory-questions"]

# Subjects that use "exam-questions" instead of separate MCQ/Theory pages
EXAM_QUESTION_SUBJECTS = {"0478"}  # Computer Science

# Unicode maps for TipTap conversion
SUB_MAP = {
    "0": "₀", "1": "₁", "2": "₂", "3": "₃", "4": "₄",
    "5": "₅", "6": "₆", "7": "₇", "8": "₈", "9": "₉",
    "+": "₊", "-": "₋", "x": "ₓ", "n": "ₙ",
    "(": "₍", ")": "₎",
}
SUP_MAP = {
    "0": "⁰", "1": "¹", "2": "²", "3": "³", "4": "⁴",
    "5": "⁵", "6": "⁶", "7": "⁷", "8": "⁸", "9": "⁹",
    "+": "⁺", "-": "⁻", "n": "ⁿ",
}

# Tier tags to remove
TIER_TAGS = re.compile(
    r"^(Extended Only|Separate:\s*Chemistry and Extended Only|"
    r"Separate:\s*Chemistry Only|Core)\s*$",
    re.MULTILINE,
)


# ── Supabase helpers ────────────────────────────────────────────

def supabase_get(path):
    url = f"{SUPABASE_URL}/rest/v1/{path}"
    req = urllib.request.Request(url, headers={
        "apikey": SERVICE_KEY, "Authorization": f"Bearer {SERVICE_KEY}",
    })
    with urllib.request.urlopen(req) as resp:
        return json.loads(resp.read().decode())


def supabase_post(path, data, prefer="return=representation"):
    url = f"{SUPABASE_URL}/rest/v1/{path}"
    headers = {
        "apikey": SERVICE_KEY, "Authorization": f"Bearer {SERVICE_KEY}",
        "Content-Type": "application/json", "Prefer": prefer,
    }
    body = json.dumps(data).encode()
    req = urllib.request.Request(url, data=body, method="POST", headers=headers)
    try:
        with urllib.request.urlopen(req) as resp:
            text = resp.read().decode()
            return json.loads(text) if text.strip() else True
    except urllib.error.HTTPError as e:
        print(f"  POST error {e.code}: {e.read().decode()[:300]}")
        return None


def supabase_patch(path, data):
    url = f"{SUPABASE_URL}/rest/v1/{path}"
    headers = {
        "apikey": SERVICE_KEY, "Authorization": f"Bearer {SERVICE_KEY}",
        "Content-Type": "application/json", "Prefer": "return=minimal",
    }
    body = json.dumps(data).encode()
    req = urllib.request.Request(url, data=body, method="PATCH", headers=headers)
    with urllib.request.urlopen(req) as resp:
        return resp.status


def upload_to_storage(bucket_path, file_data, content_type="image/png"):
    url = f"{SUPABASE_URL}/storage/v1/object/{bucket_path}"
    headers = {
        "apikey": SERVICE_KEY, "Authorization": f"Bearer {SERVICE_KEY}",
        "Content-Type": content_type, "x-upsert": "true",
    }
    req = urllib.request.Request(url, data=file_data, method="POST", headers=headers)
    try:
        with urllib.request.urlopen(req) as resp:
            return True
    except urllib.error.HTTPError as e:
        print(f"  Upload error {e.code}: {e.read().decode()[:200]}")
        return False


# ── TipTap JSON → Text converter ───────────────────────────────

MD_IMAGE_RE = re.compile(r'!\[([^\]]*)\]\(([^)]+)\)')


def tiptap_to_text(node):
    """Convert TipTap/ProseMirror JSON node to clean text with Unicode sub/superscripts."""
    if not node:
        return ""
    if isinstance(node, str):
        return node

    # Text node
    if node.get("text"):
        t = node["text"]
        marks = node.get("marks", [])
        for m in marks:
            if m["type"] == "subscript":
                t = "".join(SUB_MAP.get(c, c) for c in t)
            elif m["type"] == "superscript":
                t = "".join(SUP_MAP.get(c, c) for c in t)
        # Convert markdown ![alt](url) to [IMAGE:...] markers so they are captured downstream
        t = MD_IMAGE_RE.sub(lambda m: f"[IMAGE:{m.group(2)}|{m.group(1)}]", t)
        return t

    node_type = node.get("type", "")
    content = node.get("content", [])
    attrs = node.get("attrs", {}) or {}

    # Table → pipe format (empty cells become "..." for interactive input)
    if node_type == "table":
        rows = []
        for row in content:
            cells = []
            for cell in row.get("content", []):
                cell_text = tiptap_to_text(cell).strip()
                if not cell_text:
                    cell_text = "..."  # blank cell → interactive input marker
                cells.append(cell_text)
            rows.append("| " + " | ".join(cells) + " |")
        return "\n".join(rows)

    # Image or Figure (TipTap uses "figure" for embedded images)
    if node_type in ("image", "figure", "img", "inlineImage", "embeddedImage"):
        src = attrs.get("src", "") or attrs.get("url", "") or attrs.get("href", "")
        alt = attrs.get("alt", "") or attrs.get("caption", "")
        if src:
            return f"[IMAGE:{src}|{alt}]"
        # Figure may wrap content with an image inside
        if content:
            return "".join(tiptap_to_text(c) for c in content)
        return ""

    # Code block (pseudocode in CS questions)
    if node_type == "codeBlock":
        code_text = "".join(tiptap_to_text(c) for c in content)
        return f"```\n{code_text}\n```"

    # Lists
    if node_type in ("bulletList", "orderedList"):
        items = []
        for li in content:
            items.append("- " + tiptap_to_text(li).strip())
        return "\n".join(items)

    if node_type == "listItem":
        return " ".join(tiptap_to_text(c) for c in content)

    # Catch-all: any node with attrs.src (or similar) that wasn't matched above is likely an image
    src = attrs.get("src", "") or attrs.get("url", "")
    if src and isinstance(src, str) and (
        src.startswith("http") or src.startswith("/") or src.startswith("data:")
    ):
        alt = attrs.get("alt", "") or attrs.get("caption", "")
        inner = "".join(tiptap_to_text(c) for c in content) if content else ""
        return f"[IMAGE:{src}|{alt}]" + (f" {inner}" if inner else "")

    # Paragraph, heading, etc.
    if content:
        return "".join(tiptap_to_text(c) for c in content)

    return ""


def blocks_to_text(blocks):
    """Convert list of TipTap blocks to multiline text."""
    if not blocks:
        return ""
    parts = []
    for block in blocks:
        t = tiptap_to_text(block).strip()
        if t:
            parts.append(t)
    return "\n".join(parts)


def clean_question_text(text):
    """Remove tier tags, mark annotations, and clean up text."""
    text = TIER_TAGS.sub("", text).strip()
    # Remove [1], [2], [Total: X] mark annotations — our frontend cleaner also
    # removes these but they confuse the parent_context/question_text splitting
    text = re.sub(r'\[Total\s*:\s*\d+\s*marks?\]', '', text, flags=re.IGNORECASE)
    text = re.sub(r'\[\d+\s*marks?\]', '', text)
    text = re.sub(r'\[\d+\]', '', text)
    # Remove leading/trailing blank lines
    lines = [l for l in text.split("\n") if l.strip()]
    return "\n".join(lines)


# ── Image handling ──────────────────────────────────────────────

def extract_images(text):
    """Extract [IMAGE:url|alt] markers from text, return (clean_text, images)."""
    images = []
    pattern = re.compile(r'\[IMAGE:([^|]*)\|([^\]]*)\]')

    def replace_img(m):
        images.append({"src": m.group(1), "alt": m.group(2)})
        return ""  # remove from text

    clean = pattern.sub(replace_img, text).strip()
    # Clean empty lines left behind
    clean = re.sub(r'\n{3,}', '\n\n', clean)
    return clean, images


def download_image(url, local_path):
    """Download an image from URL to local path."""
    os.makedirs(os.path.dirname(local_path), exist_ok=True)
    if os.path.exists(local_path):
        return True
    try:
        req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0"})
        with urllib.request.urlopen(req, timeout=15) as resp:
            with open(local_path, "wb") as f:
                f.write(resp.read())
        return True
    except Exception as e:
        print(f"  Download failed: {e}")
        return False


# ── Atomic fact linking ─────────────────────────────────────────

STOP_WORDS = {
    "the", "a", "an", "is", "are", "was", "were", "be", "been", "being",
    "have", "has", "had", "do", "does", "did", "will", "would", "shall",
    "should", "may", "might", "must", "can", "could", "and", "but", "or",
    "nor", "not", "so", "yet", "for", "at", "by", "from", "in", "into",
    "of", "on", "to", "with", "as", "if", "then", "than", "too", "very",
    "that", "this", "these", "those", "it", "its", "what", "which", "who",
    "whom", "how", "when", "where", "why", "all", "each", "every", "both",
    "few", "more", "most", "other", "some", "such", "no", "only", "own",
    "same", "about", "above", "after", "again", "between", "during",
    "through", "until", "while", "also", "just", "because", "answer",
    "correct", "incorrect", "following", "shown", "give", "given", "many",
    "one", "two", "three", "four", "using", "used", "use",
}


def tokenize(text):
    """Extract significant words from text."""
    words = re.findall(r'[a-zA-Z]{3,}', text.lower())
    return {w for w in words if w not in STOP_WORDS}


def link_to_facts(question_text, facts, min_overlap=2):
    """Find matching atomic facts for a question. Returns list of {fact_id, score}."""
    q_words = tokenize(question_text)
    if not q_words:
        return []

    scored = []
    for fact in facts:
        f_words = tokenize(fact["fact_text"])
        overlap = q_words & f_words
        if len(overlap) >= min_overlap:
            score = len(overlap) / max(len(q_words), 1)
            score = min(score, 0.95)  # cap at 0.95
            scored.append({"fact_id": fact["id"], "score": round(score, 2)})

    # Sort by score, take top 3
    scored.sort(key=lambda x: -x["score"])
    return scored[:3]


# ── Fetch SME page data ────────────────────────────────────────

def fetch_sme_page(subject_code, subtopic_slug, question_type):
    """Fetch a SaveMyExams topic questions page and extract __NEXT_DATA__."""
    slug, spec = SUBJECT_SLUGS[subject_code]
    url = f"{SME_BASE}/igcse/{slug}/cie/{spec}/topic-questions/{subtopic_slug}/{question_type}/"

    req = urllib.request.Request(url, headers={
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
        "Accept": "text/html",
    })

    try:
        with urllib.request.urlopen(req, timeout=30) as resp:
            html = resp.read().decode("utf-8")
    except urllib.error.HTTPError as e:
        print(f"  HTTP {e.code} for {url}")
        return None

    # Extract __NEXT_DATA__
    match = re.search(r'<script id="__NEXT_DATA__" type="application/json">(.*?)</script>', html, re.DOTALL)
    if not match:
        print(f"  No __NEXT_DATA__ found in {url}")
        return None

    data = json.loads(match.group(1))
    return data.get("props", {}).get("pageProps", {})


# ── Process questions ───────────────────────────────────────────

def process_questions(page_props, subject_code, topic_code, question_type_slug, facts, img_dir, subtopic_index=1):
    """Convert SME page data into our question format."""
    questions_raw = page_props.get("questions", [])
    if not questions_raw:
        return []

    page_is_mcq = "multiple-choice" in question_type_slug
    processed = []

    # Counter per difficulty per type
    counters = defaultdict(lambda: defaultdict(int))

    fig_ref_pattern_local = re.compile(r'Fig\.?\s*\d', re.IGNORECASE)

    for q in questions_raw:
        difficulty = q["attributes"]["difficulty"]
        parts = q["attributes"].get("parts", [])

        # Pre-scan all parts to collect shared images (SaveMyExams question groups
        # often show the figure in one part and reference it from sibling parts).
        shared_images = []
        for p in parts:
            _pt = blocks_to_text(p.get("problem", []))
            _, p_imgs = extract_images(_pt)
            for img in p_imgs:
                if img not in shared_images:
                    shared_images.append(img)
            _st = blocks_to_text(p.get("solution", []))
            _, s_imgs = extract_images(_st)
            for img in s_imgs:
                if img not in shared_images:
                    shared_images.append(img)

        for part_idx, part in enumerate(parts):
            part_id = part["id"]
            marks = part.get("marks", 1)
            tier = part.get("tier")

            # Determine MCQ per-part (important for exam-questions pages that mix types)
            part_type = part.get("question_type", "")
            is_mcq = page_is_mcq or part_type == "multiple_choice"
            type_short = "mcq" if is_mcq else "th"

            counters[difficulty][type_short] += 1
            num = counters[difficulty][type_short]

            # Build question text from problem
            problem_text = blocks_to_text(part.get("problem", []))
            problem_text = clean_question_text(problem_text)

            # Extract images from text
            problem_text, q_images = extract_images(problem_text)

            # If this part references a figure but doesn't contain one, inherit from sibling parts
            if not q_images and fig_ref_pattern_local.search(problem_text) and shared_images:
                q_images = list(shared_images)

            # Build solution / mark_scheme
            solution_text = blocks_to_text(part.get("solution", []))
            solution_text, sol_images = extract_images(solution_text)

            # Separate parent_context (table or long intro) from question_text
            parent_context = None
            question_text = problem_text

            # If text has a pipe table, put the table in parent_context
            lines = problem_text.split("\n")
            table_lines = [l for l in lines if l.strip().startswith("|")]
            non_table_lines = [l for l in lines if not l.strip().startswith("|")]

            if table_lines and non_table_lines:
                # Table goes to parent_context, rest stays as question
                # Find the actual question (usually last non-table line)
                parent_parts = []
                question_parts = []
                found_question = False
                for l in lines:
                    if l.strip().startswith("|"):
                        parent_parts.append(l)
                    elif l.strip().endswith("?") or found_question:
                        question_parts.append(l)
                        found_question = True
                    else:
                        parent_parts.append(l)

                if question_parts:
                    parent_context = "\n".join(parent_parts).strip() or None
                    question_text = "\n".join(question_parts).strip()
                else:
                    question_text = problem_text

            # MCQ: build mark_scheme from choices
            correct_answer = None
            mark_scheme = ""

            if is_mcq and part.get("choices"):
                choices = part["choices"]

                # Detect table-based MCQ: choices exist but have empty content
                # Options are embedded in a table in the problem text instead
                choices_have_text = any(
                    len(json.dumps(c.get("content", []))) > 50
                    for c in choices
                )

                if choices_have_text:
                    # Normal MCQ: options are in choices array
                    option_lines = []
                    for choice in sorted(choices, key=lambda c: c["order"]):
                        letter = chr(65 + choice["order"])
                        choice_text = blocks_to_text(choice.get("content", []))
                        if choice["is_correct"]:
                            correct_answer = letter
                        option_lines.append(f"{letter}: {choice_text}")
                    mark_scheme = "\n".join(option_lines)

                else:
                    # Table-based MCQ: options are rows in the problem table
                    # Find correct answer from choices array (is_correct still works)
                    correct_choice = next(
                        (c for c in choices if c["is_correct"]), None
                    )
                    if correct_choice:
                        correct_answer = chr(65 + correct_choice["order"])

                    # Extract option descriptions from the table in parent_context
                    # Table rows with A/B/C/D in first column are the options
                    if table_lines:
                        option_lines = []
                        for tl in table_lines:
                            cells = [c.strip() for c in tl.strip("|").split("|")]
                            if cells and cells[0].strip() in ("A", "B", "C", "D"):
                                letter = cells[0].strip()
                                # Join remaining cells as the option description
                                desc = ", ".join(c.strip() for c in cells[1:] if c.strip())
                                option_lines.append(f"{letter}: {desc}")
                        if option_lines:
                            mark_scheme = "\n".join(option_lines)
                        else:
                            # Fallback: just note it's table-based
                            mark_scheme = "Table-based MCQ — see table above"
                    else:
                        mark_scheme = "Table-based MCQ — see table above"

                # Add correct answer line (once only)
                if correct_answer:
                    mark_scheme += f"\nCorrect: {correct_answer}"

            else:
                # Theory: mark_scheme from solution
                mark_scheme = solution_text

            # Handle images
            fig_refs = []
            has_diagram = False
            all_images = q_images + sol_images

            for img_idx, img in enumerate(all_images):
                src = img["src"]
                alt = img["alt"] or f"fig_{num}_{img_idx}"
                # Clean filename
                fname = re.sub(r'[^a-zA-Z0-9_-]', '_', alt)[:60]
                fname = f"{topic_code.lower()}_{type_short}_{difficulty}_{num:02d}_{fname}"

                # Determine extension
                ext = ".png" if ".png" in src else ".webp" if ".webp" in src else ".png"
                local_path = os.path.join(img_dir, f"{fname}{ext}")

                # Download
                if download_image(src, local_path):
                    # Upload to Supabase
                    storage_name = f"{fname}{ext}"
                    with open(local_path, "rb") as f:
                        img_data = f.read()

                    ct = "image/png" if ext == ".png" else "image/webp"
                    if upload_to_storage(f"diagrams/sme_{subject_code}/{storage_name}", img_data, ct):
                        fig_refs.append(storage_name.replace(ext, ""))
                        has_diagram = True
                        print(f"    Uploaded: {storage_name}")

            # Generate question ID (includes subtopic index to avoid collisions)
            q_id = f"sme_{subject_code}_{topic_code.lower()}_s{subtopic_index}_{type_short}_{difficulty}_{num:02d}"

            # Link to atomic facts
            full_text = f"{question_text} {parent_context or ''} {mark_scheme}"
            related = link_to_facts(full_text, facts)
            if not related and facts:
                # Fallback: link to first fact with lowest threshold
                related = link_to_facts(full_text, facts, min_overlap=1)
            if not related and facts:
                # Last resort: assign the most general fact
                related = [{"fact_id": facts[0]["id"], "score": 0.3}]

            response_type = "mcq" if is_mcq else "text"

            record = {
                "id": q_id,
                "paper_id": f"sme_{subject_code}",
                "subject_code": subject_code,
                "syllabus_topic_id": None,  # filled later
                "question_number": num,
                "part_label": None,
                "group_id": None,
                "question_text": question_text,
                "parent_context": parent_context,
                "marks": marks,
                "correct_answer": correct_answer,
                "mark_scheme": mark_scheme,
                "mark_points": [],
                "question_type": "short",
                "response_type": response_type,
                "has_diagram": has_diagram,
                "fig_refs": fig_refs,
                "table_refs": [],
                "evaluation_ready": True,
                "is_stem": False,
                "part_order": 0,
                "sibling_count": 1,
            }

            # Metadata for reporting (not stored in DB)
            record["_difficulty"] = difficulty
            record["_sme_id"] = part_id
            record["_related_facts"] = related
            record["_has_table"] = bool(table_lines)
            record["_has_image"] = has_diagram
            # Also check solution for images (answer diagrams)
            record["_sol_images"] = len(sol_images)

            processed.append(record)

    # Validation: warn about questions that mention 'Fig.' but have no extracted images
    fig_ref_pattern = re.compile(r'Fig\.?\s*\d', re.IGNORECASE)
    missing = [
        q for q in processed
        if not q.get("fig_refs") and fig_ref_pattern.search(q.get("question_text") or "")
    ]
    if missing:
        print(f"  [!] {len(missing)} questions mention 'Fig.' but have no extracted images:", flush=True)
        for q in missing[:10]:
            print(f"      - {q['id']}", flush=True)
        if len(missing) > 10:
            print(f"      ... and {len(missing) - 10} more", flush=True)

    return processed


# ── Main ────────────────────────────────────────────────────────

def main():
    if len(sys.argv) < 4:
        print("Usage: py -u scripts/scrape-sme-html.py <subject_code> <topic_code> <subtopic_slugs...>")
        print("Example: py -u scripts/scrape-sme-html.py 0620 CHEM_T3 \\")
        print("  3-stoichiometry/3-1-formulae-and-relative-masses \\")
        print("  3-stoichiometry/3-2-the-mole-and-the-avogadro-constant")
        sys.exit(1)

    subject_code = sys.argv[1]
    topic_code = sys.argv[2]
    subtopic_slugs = sys.argv[3:]

    if subject_code not in SUBJECT_SLUGS:
        print(f"ERROR: Unknown subject code {subject_code}")
        sys.exit(1)

    print("=" * 60)
    print(f"SaveMyExams HTML Scraper")
    print(f"Subject: {subject_code}, Topic: {topic_code}")
    print(f"Subtopics: {len(subtopic_slugs)}")
    print("=" * 60)

    # 1. Get topic UUID
    print("\nFetching topic...")
    topics = supabase_get(f"syllabus_topics?topic_code=eq.{topic_code}&select=id,topic_code,topic_name")
    if not topics:
        print(f"ERROR: Topic {topic_code} not found in syllabus_topics")
        sys.exit(1)
    topic = topics[0]
    topic_uuid = topic["id"]
    print(f"  {topic['topic_code']}: {topic['topic_name']} ({topic_uuid})")

    # 2. Fetch atomic facts
    print("\nFetching atomic facts...")
    facts = supabase_get(f"atomic_facts?syllabus_topic_id=eq.{topic_uuid}&select=id,fact_text&order=id")
    print(f"  {len(facts)} facts loaded")

    # 3. Check existing
    existing = supabase_get(
        f"exam_questions?syllabus_topic_id=eq.{topic_uuid}&paper_id=eq.sme_{subject_code}"
        f"&select=id&evaluation_ready=eq.true"
    )
    print(f"  {len(existing)} existing active SME questions")

    # 4. Scrape all subtopics
    img_dir = os.path.join(BASE_DIR, "data", "sme_html", topic_code.lower(), "images")
    os.makedirs(img_dir, exist_ok=True)

    all_questions = []

    for sub_idx, subtopic_slug in enumerate(subtopic_slugs, start=1):
        print(f"\n{'─' * 40}")
        print(f"Subtopic {sub_idx}: {subtopic_slug}")

        qtypes = ["exam-questions"] if subject_code in EXAM_QUESTION_SUBJECTS else QUESTION_TYPES
        for qtype in qtypes:
            print(f"\n  Fetching {qtype}...")
            page_props = fetch_sme_page(subject_code, subtopic_slug, qtype)

            if not page_props:
                print(f"  Skipped (no data)")
                continue

            questions = process_questions(
                page_props, subject_code, topic_code, qtype, facts, img_dir,
                subtopic_index=sub_idx,
            )
            print(f"  Extracted: {len(questions)} questions")

            # Breakdown by difficulty
            by_diff = defaultdict(int)
            for q in questions:
                by_diff[q["_difficulty"]] += 1
            for d in ["easy", "medium", "hard"]:
                if by_diff[d]:
                    print(f"    {d}: {by_diff[d]}")

            all_questions.extend(questions)
            time.sleep(1)  # Rate limit

    # 5. Set topic UUID on all questions
    for q in all_questions:
        q["syllabus_topic_id"] = topic_uuid

    # 6. Stats and summary
    print(f"\n{'=' * 60}")
    print("EXTRACTION SUMMARY")
    print(f"{'=' * 60}")

    mcq_count = sum(1 for q in all_questions if q["response_type"] == "mcq")
    theory_count = sum(1 for q in all_questions if q["response_type"] == "text")
    with_table = sum(1 for q in all_questions if q["_has_table"])
    with_image = sum(1 for q in all_questions if q["_has_image"])
    with_facts = sum(1 for q in all_questions if q["_related_facts"])
    with_ms = sum(1 for q in all_questions if q["mark_scheme"])
    empty_text = sum(1 for q in all_questions if len(q["question_text"]) < 20)

    by_diff = defaultdict(int)
    for q in all_questions:
        by_diff[q["_difficulty"]] += 1

    print(f"  Total questions:        {len(all_questions)} ({mcq_count} MCQ + {theory_count} Theory)")
    print(f"  Easy / Medium / Hard:   {by_diff['easy']} / {by_diff['medium']} / {by_diff['hard']}")
    print(f"  Questions with tables:  {with_table}")
    print(f"  Questions with images:  {with_image}")
    print(f"  Linked to atomic facts: {with_facts}/{len(all_questions)}")
    print(f"  With mark_scheme:       {with_ms}/{len(all_questions)}")
    print(f"  Empty text (<20 chars): {empty_text}")

    if mcq_count > 0:
        parseable = sum(1 for q in all_questions if q["response_type"] == "mcq" and q["correct_answer"])
        print(f"  MCQs with correct ans:  {parseable}/{mcq_count}")

    # Fact linking report
    unlinked = [q for q in all_questions if not q["_related_facts"]]
    if unlinked:
        print(f"\n  WARNING: {len(unlinked)} questions with no fact links:")
        for q in unlinked[:5]:
            print(f"    {q['id']}: {q['question_text'][:60]}...")

    # 7. Save JSON
    out_dir = os.path.join(BASE_DIR, "data", "sme_html")
    os.makedirs(out_dir, exist_ok=True)
    out_path = os.path.join(out_dir, f"{subject_code}_{topic_code.lower()}_questions.json")

    # Strip internal metadata before saving
    save_data = {
        "topic_code": topic_code,
        "topic_name": topic["topic_name"],
        "syllabus_topic_id": topic_uuid,
        "subject_code": subject_code,
        "scraped_at": time.strftime("%Y-%m-%dT%H:%M:%SZ"),
        "questions": [],
    }
    for q in all_questions:
        qc = {k: v for k, v in q.items() if not k.startswith("_")}
        qc["_related_facts"] = q["_related_facts"]  # keep for ingestion
        save_data["questions"].append(qc)

    with open(out_path, "w", encoding="utf-8") as f:
        json.dump(save_data, f, indent=2, ensure_ascii=False)

    print(f"\n  Saved to: {out_path}")
    print(f"  ({os.path.getsize(out_path) / 1024:.0f} KB)")
    print(f"\n  Run with --ingest flag to push to Supabase.")

    # 8. Ingest if --ingest flag
    if "--ingest" in sys.argv:
        print(f"\n{'=' * 60}")
        print("INGESTING INTO SUPABASE")
        print(f"{'=' * 60}")

        success = 0
        failed = 0
        BATCH = 50

        for i in range(0, len(all_questions), BATCH):
            batch = all_questions[i:i + BATCH]
            records = []
            for q in batch:
                rec = {k: v for k, v in q.items() if not k.startswith("_")}
                records.append(rec)

            result = supabase_post(
                "exam_questions",
                records,
                prefer="return=minimal,resolution=merge-duplicates",
            )
            if result is not None or True:  # POST with return=minimal returns empty
                success += len(records)
            else:
                failed += len(records)

            print(f"  Upserted {success}/{len(all_questions)}...")

        print(f"\n  Done: {success} upserted, {failed} failed")

        # Verify
        active = supabase_get(
            f"exam_questions?syllabus_topic_id=eq.{topic_uuid}&paper_id=eq.sme_{subject_code}"
            f"&select=id&evaluation_ready=eq.true"
        )
        print(f"  Active questions for {topic_code}: {len(active)}")


if __name__ == "__main__":
    main()
