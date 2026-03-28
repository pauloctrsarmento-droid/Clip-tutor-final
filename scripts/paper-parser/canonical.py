"""
canonical.py — Canonical ID matching and global alignment for QP↔MS merge.

Replaces fuzzy matching with formal ID parsing and monotonic alignment.
"""
import re
from dataclasses import dataclass, field
from typing import Optional, List, Tuple


@dataclass(frozen=True)
class QuestionID:
    """Canonical representation of a question identifier.

    Parses both QP format ("q1b_i") and MS format ("1(b)(i)") into
    the same canonical tuple for exact matching.
    """
    number: int
    part: Optional[str] = None      # 'a', 'b', 'c', ...
    subpart: Optional[str] = None   # 'i', 'ii', 'iii', ...

    @classmethod
    def from_qp_suffix(cls, suffix: str) -> Optional['QuestionID']:
        """Parse QP-style suffix: q1, q1a, q1a_ii, q1_alt1"""
        if not suffix:
            return None
        # Strip _alt suffix
        suffix = re.sub(r'_alt\d+$', '', suffix)
        m = re.match(r'^q(\d+)([a-z])?(?:_([ivx]+))?$', suffix)
        if not m:
            return None
        return cls(
            number=int(m.group(1)),
            part=m.group(2),
            subpart=m.group(3),
        )

    @classmethod
    def from_ms_label(cls, label: str) -> Optional['QuestionID']:
        """Parse MS-style label: 1(a)(i), 2(b), 3"""
        if not label:
            return None
        # Normalize: strip trailing mark-point numbers
        label = re.sub(r'\d+\.?\s*$', '', label).strip()
        # Normalize typos
        label = re.sub(r'^(\d+)\(([a-z])\(', r'\1(\2)(', label)  # 3(b(i) → 3(b)(i)
        m2 = re.match(r'^(\d+)([a-z])([ivx]+)$', label)  # 4biv → 4(b)(iv)
        if m2:
            label = f"{m2.group(1)}({m2.group(2)})({m2.group(3)})"
        m3 = re.match(r'^(\d+)([a-z])\(([ivx]+)\)$', label)  # 4e(i) → 4(e)(i)
        if m3:
            label = f"{m3.group(1)}({m3.group(2)})({m3.group(3)})"

        m = re.match(r'^(\d+)(?:\(([a-z])\))?(?:\(([ivx]+)\))?$', label)
        if not m:
            return None
        return cls(
            number=int(m.group(1)),
            part=m.group(2),
            subpart=m.group(3),
        )

    def to_suffix(self) -> str:
        """Convert back to q-suffix format."""
        s = f"q{self.number}"
        if self.part:
            s += self.part
        if self.subpart:
            s += f"_{self.subpart}"
        return s

    def sort_key(self) -> Tuple:
        """Key for ordering questions monotonically."""
        part_ord = ord(self.part) - ord('a') if self.part else -1
        sub_map = {'i': 1, 'ii': 2, 'iii': 3, 'iv': 4, 'v': 5, 'vi': 6, 'vii': 7, 'viii': 8}
        sub_ord = sub_map.get(self.subpart, 0) if self.subpart else 0
        return (self.number, part_ord, sub_ord)


def align_paper(qp_questions: list, ms_entries: list) -> dict:
    """Global alignment of QP questions to MS entries within a single paper.

    Returns: dict mapping QP question index → MS entry (or None for orphans).

    Algorithm:
    1. Parse all IDs to canonical form
    2. Exact match on canonical tuple
    3. Verify monotonic ordering (no crossing matches)
    4. Reject matches that break monotonicity
    """
    # Parse QP canonical IDs
    qp_canonical = []
    for q in qp_questions:
        suffix = _get_q_suffix(q["id"])
        cid = QuestionID.from_qp_suffix(suffix) if suffix else None
        qp_canonical.append(cid)

    # Parse MS canonical IDs
    ms_canonical = {}
    for entry in ms_entries:
        cid = QuestionID.from_ms_label(entry.get("_raw_label", entry.get("q_id_suffix", "")))
        if not cid:
            # Try from q_id_suffix
            cid = QuestionID.from_qp_suffix(entry.get("q_id_suffix", ""))
        if cid:
            ms_canonical[cid] = entry

    # Phase 1: Exact canonical matching
    matches = {}
    matched_ms = set()
    for i, q in enumerate(qp_questions):
        qcid = qp_canonical[i]
        if qcid and qcid in ms_canonical and id(ms_canonical[qcid]) not in matched_ms:
            matches[i] = ms_canonical[qcid]
            matched_ms.add(id(ms_canonical[qcid]))

    # Phase 2: Verify monotonic ordering
    # Sort matched pairs by QP order, check MS follows same order
    matched_pairs = [(i, matches[i]) for i in sorted(matches.keys())]
    if len(matched_pairs) > 1:
        last_ms_key = (-1, -1, -1)
        violations = []
        for i, ms_entry in matched_pairs:
            qcid = qp_canonical[i]
            ms_key = qcid.sort_key() if qcid else (999, 999, 999)
            if ms_key < last_ms_key:
                violations.append(i)
            else:
                last_ms_key = ms_key

        # Remove violations (break monotonicity → orphan)
        for i in violations:
            del matches[i]

    return matches


def _get_q_suffix(q_id: str) -> Optional[str]:
    """Extract q-suffix from full question ID, stripping _alt."""
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
