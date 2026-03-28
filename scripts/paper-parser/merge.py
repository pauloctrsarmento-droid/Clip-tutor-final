import os
"""
merge.py — Merges QP questions + MS mark schemes + diagram paths.

MS-first architecture: the Mark Scheme drives question structure,
the Question Paper provides content text via word-level extraction.

Usage:
    python merge.py <qp_pdf> <ms_pdf> [--diagrams <diagrams_dir>] [--output <json>]
"""
import json
import re
import sys
from pathlib import Path

from parse_questions import (
    parse_qp, parse_qp_ms_first, classify_response_type,
    RE_FIG, RE_TABLE,
)
from canonical import QuestionID
from parse_markscheme import parse_ms



def get_q_suffix(q_id):
    """Extract q-suffix from a full question ID, stripping _alt suffixes."""
    parts = q_id.split("_")
    suffix_parts = []
    found = False
    for p in parts:
        if not found and p.startswith("q") and len(p) > 1 and p[1:2].isdigit():
            found = True
        if found:
            if p.startswith("alt"):
                continue
            suffix_parts.append(p)
    return "_".join(suffix_parts) if suffix_parts else None


def _build_paper_id(qp_pdf):
    """Build paper_id from QP filename."""
    stem = Path(qp_pdf).stem
    m_paper = re.match(r'(\d{4})_([msw]\d{2})_qp_?(\d+)', stem)
    if m_paper:
        return f"{m_paper.group(1)}_{m_paper.group(2)}_{m_paper.group(3)}"
    return stem.replace("qp_", "").replace("qp", "")


def merge(qp_pdf, ms_pdf, diagrams_dir=None):
    """Merge QP questions with MS mark schemes.

    MS-first: MS provides definitive question structure (IDs, marks, answers).
    QP provides content text via word-level extraction.
    Diagrams are resolved at runtime via caption-named PNGs.
    """
    # 1. Parse MS first — source of truth for structure
    ms_entries = parse_ms(ms_pdf)

    # 2. Scan QP with word-level markers for content
    regions, content_map = parse_qp_ms_first(qp_pdf)

    # 3. Build paper_id
    paper_id = _build_paper_id(qp_pdf)
    subject_code = paper_id.split("_")[0]

    # 4. Match MS entries to QP content by suffix
    questions = []
    matched_ms = 0
    consumed_suffixes = set()

    for entry in ms_entries:
        suffix = entry["q_id_suffix"]
        text = content_map.get(suffix, "")

        if text:
            consumed_suffixes.add(suffix)
            matched_ms += 1

        q_num = entry["question_number"]
        part_label = entry["part_label"]
        marks = entry["marks"]
        figs = RE_FIG.findall(text) if text else []
        tables = RE_TABLE.findall(text) if text else []

        questions.append({
            "id": f"{paper_id}_{suffix}",
            "question_number": q_num,
            "part_label": part_label,
            "group_id": f"{paper_id}_q{q_num}",
            "question_text": text,
            "marks": marks,
            "has_diagram": False,  # resolved at runtime via caption PNGs
            "fig_refs": figs,
            "table_refs": tables,
            "question_type": "structured" if marks >= 4 else "short",
            "response_type": classify_response_type(text, marks) if text else "text",
            "primary_topic_id": None,
            "secondary_topic_ids": [],
            "is_stem": False,
            "correct_answer": entry["correct_answer"],
            "mark_scheme": entry["mark_scheme"],
            "mark_points": entry["mark_points"],
            "subject_code": subject_code,
            "paper_id": paper_id,
            "diagram_path": None,  # resolved at runtime
            "parent_context": None,
            "evaluation_ready": False,
        })

    # 5. Detect stems: QP regions with no MS match that have MS siblings
    ms_suffixes = {e["q_id_suffix"] for e in ms_entries}
    ms_mains = {e["question_number"] for e in ms_entries}

    for region in regions:
        if region.q_suffix in consumed_suffixes or region.q_suffix in ms_suffixes:
            continue
        # Only a stem if same main question number has MS entries
        if region.main not in ms_mains:
            continue
        # Skip _alt stems (alternative questions)
        if "_alt" in region.q_suffix:
            continue

        text = content_map.get(region.q_suffix, "")
        if not text:
            continue

        if region.part and region.subpart:
            part_label = f"({region.part})({region.subpart})"
        elif region.part:
            part_label = f"({region.part})"
        else:
            part_label = None

        questions.append({
            "id": f"{paper_id}_{region.q_suffix}",
            "question_number": region.main,
            "part_label": part_label,
            "group_id": f"{paper_id}_q{region.main}",
            "question_text": text,
            "marks": 0,
            "has_diagram": bool(RE_FIG.findall(text) or RE_TABLE.findall(text)),
            "fig_refs": RE_FIG.findall(text),
            "table_refs": RE_TABLE.findall(text),
            "question_type": "short",
            "response_type": "text",
            "primary_topic_id": None,
            "secondary_topic_ids": [],
            "is_stem": True,
            "correct_answer": None,
            "mark_scheme": None,
            "mark_points": [],
            "subject_code": subject_code,
            "paper_id": paper_id,
            "diagram_path": None,  # resolved at runtime
            "parent_context": None,
            "evaluation_ready": False,
        })

    # 6. Sort by canonical order
    def sort_key(q):
        s = get_q_suffix(q["id"])
        cid = QuestionID.from_qp_suffix(s) if s else None
        return cid.sort_key() if cid else (999, 999, 999)

    questions.sort(key=sort_key)

    # 7. Part order and sibling count
    groups = {}
    for q in questions:
        groups.setdefault(q["group_id"], []).append(q)
    for parts in groups.values():
        for i, q in enumerate(parts):
            q["part_order"] = i
            q["sibling_count"] = len(parts)

    # 7b. Re-detect stems: MS entries that are actually parent introductions
    #     (e.g., q1 with marks=0 introducing q1a, q1b, q1c)
    for q in questions:
        if q["is_stem"]:
            continue
        # Main-level stem: no part_label, has siblings → introduces children
        if q["part_label"] is None and q["sibling_count"] > 1:
            q["is_stem"] = True
            q["correct_answer"] = None
            q["mark_scheme"] = None
            q["mark_points"] = []
            q["evaluation_ready"] = False
            continue
        # Part-level stem: has part but no subpart, and siblings with subparts exist
        # e.g., q2c introduces q2c_i, q2c_ii
        suffix = get_q_suffix(q["id"])
        if suffix and q["part_label"] and "(" not in q["part_label"].replace(q["part_label"].split(")")[0] + ")", ""):
            # q has a single part like "(c)" — check if siblings have subparts
            cid = QuestionID.from_qp_suffix(suffix)
            if cid and cid.subpart is None:
                has_subpart_siblings = any(
                    QuestionID.from_qp_suffix(get_q_suffix(s["id"])) is not None
                    and QuestionID.from_qp_suffix(get_q_suffix(s["id"])).number == cid.number
                    and QuestionID.from_qp_suffix(get_q_suffix(s["id"])).part == cid.part
                    and QuestionID.from_qp_suffix(get_q_suffix(s["id"])).subpart is not None
                    for s in questions if not s["is_stem"] and s["id"] != q["id"]
                )
                if has_subpart_siblings:
                    q["is_stem"] = True
                    q["correct_answer"] = None
                    q["mark_scheme"] = None
                    q["mark_points"] = []
                    q["evaluation_ready"] = False

    # 8. Parent context from stems
    stem_texts = {}
    for q in questions:
        if q["is_stem"]:
            # Only store group-level for main stems (no part_label)
            if q["part_label"] is None:
                stem_texts[q["group_id"]] = q["question_text"]
            suffix = get_q_suffix(q["id"])
            if suffix:
                stem_texts[suffix] = q["question_text"]

    for q in questions:
        if not q["is_stem"]:
            q["parent_context"] = stem_texts.get(q["group_id"])
            if not q["parent_context"]:
                suffix = get_q_suffix(q["id"])
                if suffix and "_" in suffix:
                    parent_suffix = suffix.rsplit("_", 1)[0]
                    q["parent_context"] = stem_texts.get(parent_suffix)
        else:
            q["parent_context"] = None

    # 9. (Diagrams removed — frontend resolves via caption-named PNGs at runtime)

    # 10. Evaluation ready (must have both question text AND mark scheme)
    for q in questions:
        q["evaluation_ready"] = (
            not q["is_stem"]
            and bool(q.get("question_text"))
            and q.get("correct_answer") is not None
            and len(q.get("correct_answer", "")) > 0
            and q.get("mark_scheme") is not None
            and len(q.get("mark_scheme", "")) > 0
        )

    # 11. Deduplicate IDs (alternatives)
    seen_ids = {}
    for q in questions:
        qid = q["id"]
        if qid in seen_ids:
            seen_ids[qid] += 1
            q["id"] = f"{qid}_alt{seen_ids[qid]}"
            q["group_id"] = f"{q['group_id']}_alt{seen_ids[qid]}"
        else:
            seen_ids[qid] = 0

    # 12. Stats (recalculate matched_ms after stem re-detection)
    stems = sum(1 for q in questions if q["is_stem"])
    actual_matched = sum(
        1 for q in questions
        if not q["is_stem"] and q.get("correct_answer") is not None
    )
    unmatched_questions = [
        q["id"] for q in questions
        if not q["is_stem"] and q.get("correct_answer") is None
    ]

    stats = {
        "paper_id": paper_id,
        "total_questions": len(questions),
        "total_ms_entries": len(ms_entries),
        "matched_ms": actual_matched,
        "stems": stems,
        "unmatched_ms": len(unmatched_questions),
        "matched_diagrams": 0,
        "diagrams_available": 0,
        "evaluation_ready": sum(1 for q in questions if q["evaluation_ready"]),
        "groups": len(set(q["group_id"] for q in questions)),
        "unmatched_questions": unmatched_questions,
    }

    return questions, stats


def main():
    if len(sys.argv) < 3:
        print("Usage: python merge.py <qp_pdf> <ms_pdf> [--diagrams <dir>] [--output <json>])
        sys.exit(1)

    qp_pdf = sys.argv[1]
    ms_pdf = sys.argv[2]

    diagrams_dir = None
    output_path = None

    if "--diagrams" in sys.argv:
        idx = sys.argv.index("--diagrams")
        diagrams_dir = sys.argv[idx + 1]
    if "--output" in sys.argv:
        idx = sys.argv.index("--output")
        output_path = sys.argv[idx + 1]

    merged, stats = merge(qp_pdf, ms_pdf, diagrams_dir)

    result = {"stats": stats, "questions": merged}
    output = json.dumps(result, indent=2, ensure_ascii=False)

    if output_path:
        Path(output_path).write_text(output, encoding="utf-8")

    print(json.dumps(stats, indent=2), file=sys.stderr)

    if not output_path:
        print(output)


if __name__ == "__main__":
    main()
