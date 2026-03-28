import os
"""
Seed the study_plan_entries table with the complete study plan from the PDF.
Each study block is a separate row. ~160 blocks across 64 study days.

Usage: py scripts/seed-study-plan.py [--dry-run]
Requires: migrate-block3.sql already run in Supabase.
"""

import json
import sys
import urllib.request

SUPABASE_URL = "https://lltcfjmshnhfmavlxpxr.supabase.co"
SERVICE_KEY = os.environ["SUPABASE_SERVICE_ROLE_KEY"]

DRY_RUN = "--dry-run" in sys.argv

# ============================================================
# Topic code mapping — maps keywords to syllabus_topic_ids
# These will be resolved to UUIDs at runtime
# ============================================================

TOPIC_MAP = {
    # Biology (0610) — 21 topics
    "BIO_T1": ["organisms", "classification"],
    "BIO_T2": ["cell organisation", "organisation of the organism"],
    "BIO_T3": ["cells", "movement into and out"],
    "BIO_T4": ["molecules", "biological molecules"],
    "BIO_T5": ["enzymes"],
    "BIO_T6": ["plant nutrition"],
    "BIO_T7": ["human nutrition"],
    "BIO_T8": ["transport in plants", "plant transport"],
    "BIO_T9": ["transport in humans"],
    "BIO_T10": ["diseases", "immunity"],
    "BIO_T11": ["gas exchange"],
    "BIO_T12": ["respiration"],
    "BIO_T13": ["excretion"],
    "BIO_T14": ["coordination", "response"],
    "BIO_T15": ["drugs"],
    "BIO_T16": ["reproduction"],
    "BIO_T17": ["inheritance"],
    "BIO_T18": ["variation", "selection"],
    "BIO_T19": ["ecology", "organisms and their environment"],
    "BIO_T20": ["human influence", "ecosystems"],
    "BIO_T21": ["biotech", "genetic modification"],
    # Chemistry (0620) — 12 topics
    "CHEM_T1": ["states of matter"],
    "CHEM_T2": ["atoms", "electrons", "compounds"],
    "CHEM_T3": ["stoichiometry"],
    "CHEM_T4": ["electrochemistry"],
    "CHEM_T5": ["energetics", "chemical energetics"],
    "CHEM_T6": ["chemical reactions"],
    "CHEM_T7": ["acids", "bases", "salts"],
    "CHEM_T8": ["periodic table"],
    "CHEM_T9": ["metals"],
    "CHEM_T10": ["environment"],
    "CHEM_T11": ["organic"],
    "CHEM_T12": ["experimental", "techniques", "analysis"],
    # Physics (0625) — 6 topics
    "PHYS_T1": ["motion", "forces", "energy"],
    "PHYS_T2": ["thermal"],
    "PHYS_T3": ["waves"],
    "PHYS_T4": ["electricity", "magnetism"],
    "PHYS_T5": ["nuclear"],
    "PHYS_T6": ["space"],
    # CS (0478) — 10 topics
    "CS_T1": ["data representation"],
    "CS_T2": ["data transmission", "transmission"],
    "CS_T3": ["hardware"],
    "CS_T4": ["software"],
    "CS_T5": ["internet"],
    "CS_T6": ["automated", "emerging"],
    "CS_T7": ["algorithm"],
    "CS_T8": ["programming"],
    "CS_T9": ["databases"],
    "CS_T10": ["boolean"],
}


def guess_topic_codes(title, subject_code):
    """Guess which topic codes match based on title keywords."""
    title_lower = title.lower()
    prefix_map = {
        "0610": "BIO_T",
        "0620": "CHEM_T",
        "0625": "PHYS_T",
        "0478": "CS_T",
    }
    prefix = prefix_map.get(subject_code)
    if not prefix:
        return []

    matches = []
    for code, keywords in TOPIC_MAP.items():
        if not code.startswith(prefix.rstrip("_T").replace("_", "_")):
            # Filter to correct subject
            if subject_code == "0610" and not code.startswith("BIO"):
                continue
            if subject_code == "0620" and not code.startswith("CHEM"):
                continue
            if subject_code == "0625" and not code.startswith("PHYS"):
                continue
            if subject_code == "0478" and not code.startswith("CS"):
                continue
        for kw in keywords:
            if kw in title_lower:
                if code not in matches:
                    matches.append(code)
                break
    return matches


# ============================================================
# Study plan data — every block from the PDF
# Format: (date, subject_code, title, hours, study_type, phase, sort_order)
# ============================================================

PLAN = [
    # === PHASE easter_w1 (30 Mar - 4 Apr) ===
    # 30/03
    ("2026-03-30", "0520", "French Writing: grammar revision + 1 sample text", 2.0, "study", "easter_w1", 1),
    ("2026-03-30", "0610", "Biology: Topics 1-2 (organisms + cell organisation)", 2.0, "study", "easter_w1", 2),
    ("2026-03-30", "0620", "Chemistry: Topics 1-2 (states of matter + atoms)", 1.5, "study", "easter_w1", 3),
    # 31/03
    ("2026-03-31", "0520", "French Writing: past paper #1 timed", 1.5, "practice", "easter_w1", 1),
    ("2026-03-31", "0610", "Biology: Topics 3-4 (cells + molecules)", 2.0, "study", "easter_w1", 2),
    ("2026-03-31", "0620", "Chemistry: Topic 3 — stoichiometry", 2.0, "study", "easter_w1", 3),
    # 01/04
    ("2026-04-01", "0520", "French Writing: past paper #2 + grammar review", 2.0, "mixed", "easter_w1", 1),
    ("2026-04-01", "0610", "Biology: Topics 5-6 (enzymes + plant nutrition)", 2.5, "study", "easter_w1", 2),
    ("2026-04-01", "0620", "Chemistry: Topics 4-5 (electrochemistry + energetics)", 1.5, "study", "easter_w1", 3),
    # 02/04
    ("2026-04-02", "0520", "French Writing: past paper #3", 1.5, "practice", "easter_w1", 1),
    ("2026-04-02", "0610", "Biology: Topics 7-8 (human nutrition + plant transport)", 2.5, "study", "easter_w1", 2),
    ("2026-04-02", "0620", "Chemistry: Topics 4-5 cont. (energetics)", 1.5, "study", "easter_w1", 3),
    # 03/04
    ("2026-04-03", "0520", "French Reading: past paper #1", 1.5, "practice", "easter_w1", 1),
    ("2026-04-03", "0610", "Biology: Topics 9-11 (transport in humans + diseases + gas exchange)", 2.5, "study", "easter_w1", 2),
    ("2026-04-03", "0620", "Chemistry: Topic 6 (chemical reactions)", 2.0, "study", "easter_w1", 3),

    # === PHASE easter_w2 (7-11 Apr) ===
    # 07/04
    ("2026-04-07", "0620", "Chemistry: Topics 7-8 (acids/bases + periodic table)", 2.5, "study", "easter_w2", 1),
    ("2026-04-07", "0610", "Biology: Topics 12-13 (respiration + excretion)", 2.0, "study", "easter_w2", 2),
    ("2026-04-07", "0625", "Physics: Topic 1 — motion, forces, energy", 1.5, "study", "easter_w2", 3),
    # 08/04
    ("2026-04-08", "0625", "Physics: Topics 1-2 (motion + thermal physics)", 3.0, "study", "easter_w2", 1),
    ("2026-04-08", "0610", "Biology: Topic 14 (coordination + response)", 1.5, "study", "easter_w2", 2),
    ("2026-04-08", "0620", "Chemistry: Topics 9-10 (metals + environment)", 1.5, "study", "easter_w2", 3),
    # 09/04
    ("2026-04-09", "0620", "Chemistry: Topics 11-12 (organic + experimental)", 3.0, "study", "easter_w2", 1),
    ("2026-04-09", "0610", "Biology: Topics 15-16 (drugs + reproduction)", 2.5, "study", "easter_w2", 2),
    # 10/04
    ("2026-04-10", "0625", "Physics: Topic 3 — waves", 3.0, "study", "easter_w2", 1),
    ("2026-04-10", "0610", "Biology: Topics 17-18 (inheritance + variation)", 2.5, "study", "easter_w2", 2),
    # 11/04
    ("2026-04-11", "0625", "Physics: Topic 3 cont. (waves)", 1.5, "study", "easter_w2", 1),
    ("2026-04-11", "0610", "Biology: Topics 19-21 (ecology + biotech)", 2.5, "study", "easter_w2", 2),
    ("2026-04-11", "0620", "Chemistry: experimental techniques review — ATP prep", 2.0, "study", "easter_w2", 3),

    # === PHASE back_to_school (14-17 Apr) ===
    ("2026-04-14", "0625", "Physics: Topic 4 — electricity + magnetism", 2.5, "study", "back_to_school", 1),
    ("2026-04-15", "0625", "Physics: Topic 5 — nuclear physics", 2.5, "study", "back_to_school", 1),
    ("2026-04-16", "0478", "CS: Topics 1-2 (data representation + transmission)", 2.5, "study", "back_to_school", 1),
    ("2026-04-17", "0625", "Physics: Topic 6 — space physics", 2.5, "study", "back_to_school", 1),

    # === PHASE full_time (20 Apr onwards) ===
    # 20/04
    ("2026-04-20", "0520", "French: full revision — grammar + vocab + writing samples", 3.0, "mixed", "full_time", 1),
    ("2026-04-20", "0620", "Chemistry: past paper #1 Theory", 2.0, "practice", "full_time", 2),
    ("2026-04-20", "0478", "CS: Topics 3-4 (hardware + software)", 2.0, "study", "full_time", 3),
    # 21/04
    ("2026-04-21", "0520", "French Writing: timed past paper + self-correct", 2.0, "practice", "full_time", 1),
    ("2026-04-21", "0620", "Chemistry: past paper #2 Theory", 2.0, "practice", "full_time", 2),
    ("2026-04-21", "0504", "Portugues: tipologias textuais — artigo + carta", 2.0, "study", "full_time", 3),
    # 22/04
    ("2026-04-22", "0520", "French Writing: past paper + weak points", 2.0, "practice", "full_time", 1),
    ("2026-04-22", "0610", "Biology: past paper #1 Theory", 2.0, "practice", "full_time", 2),
    ("2026-04-22", "0620", "Chemistry: past paper #3 Theory", 2.0, "practice", "full_time", 3),
    # 23/04
    ("2026-04-23", "0520", "FRENCH WRITING FINAL PREP: light review only", 1.0, "final_prep", "full_time", 1),
    ("2026-04-23", "0610", "Biology: past paper #2 Theory", 2.0, "practice", "full_time", 2),
    ("2026-04-23", "0620", "Chemistry: review weak topics", 2.0, "practice", "full_time", 3),
    # 24/04 — EXAM: French Writing
    ("2026-04-24", "0520", "EXAME: French Writing (PM)", 0, "exam", "full_time", 1),
    ("2026-04-24", "0620", "Chemistry: final review Theory", 2.0, "practice", "full_time", 2),
    ("2026-04-24", "0610", "Biology: past paper #3 Theory", 2.0, "practice", "full_time", 3),
    # 25/04
    ("2026-04-25", "0620", "Chemistry: review weak topics from past papers", 2.5, "practice", "full_time", 1),
    ("2026-04-25", "0610", "Biology: review weak topics", 2.0, "practice", "full_time", 2),
    ("2026-04-25", "0620", "Chemistry ATP: intro to practical questions", 1.5, "study", "full_time", 3),
    # 26/04
    ("2026-04-26", "0620", "Chemistry: final past paper + mark scheme review", 2.5, "practice", "full_time", 1),
    ("2026-04-26", "0610", "Biology: final review Theory — weak topics", 2.0, "practice", "full_time", 2),
    # 27/04
    ("2026-04-27", "0620", "CHEMISTRY THEORY FINAL PREP: light review", 1.5, "final_prep", "full_time", 1),
    ("2026-04-27", "0610", "Biology: focus diagrams + key processes", 2.0, "practice", "full_time", 2),
    # 28/04 — EXAM: Chemistry Theory
    ("2026-04-28", "0620", "EXAME: Chemistry Theory (PM)", 0, "exam", "full_time", 1),
    ("2026-04-28", "0610", "Biology: final past paper practice", 2.0, "practice", "full_time", 2),
    # 29/04
    ("2026-04-29", "0610", "BIOLOGY THEORY FINAL PREP: light review + key diagrams", 2.0, "final_prep", "full_time", 1),
    ("2026-04-29", "0620", "Chemistry ATP: practice experiments + questions", 2.0, "practice", "full_time", 2),
    ("2026-04-29", "0520", "French Reading: past paper #1", 1.5, "practice", "full_time", 3),
    # 30/04 — EXAM: Biology Theory
    ("2026-04-30", "0610", "EXAME: Biology Theory (PM)", 0, "exam", "full_time", 1),
    ("2026-04-30", "0620", "Chemistry ATP: practice experiments", 2.0, "practice", "full_time", 2),
    ("2026-04-30", "0520", "French Reading: past paper #2", 1.5, "practice", "full_time", 3),

    # === MAY ===
    # 01/05
    ("2026-05-01", "0620", "Chemistry ATP: typical questions + apparatus", 2.5, "practice", "full_time", 1),
    ("2026-05-01", "0625", "Physics: past paper #1 Theory", 2.5, "practice", "full_time", 2),
    ("2026-05-01", "0478", "CS: Topics 5-6 (internet + automated systems)", 2.0, "study", "full_time", 3),
    # 02/05
    ("2026-05-02", "0620", "Chemistry ATP: past paper #1", 2.0, "practice", "full_time", 1),
    ("2026-05-02", "0625", "Physics: past paper #2 Theory", 2.5, "practice", "full_time", 2),
    ("2026-05-02", "0520", "French Reading: past paper #3 + review", 1.5, "practice", "full_time", 3),
    # 03/05
    ("2026-05-03", "0620", "Chemistry ATP: past paper #2", 2.0, "practice", "full_time", 1),
    ("2026-05-03", "0625", "Physics: past paper #3 Theory", 2.5, "practice", "full_time", 2),
    ("2026-05-03", "0504", "Portugues: praticar perguntas P1", 2.0, "practice", "full_time", 3),
    # 04/05
    ("2026-05-04", "0520", "FRENCH READING FINAL PREP", 1.0, "final_prep", "full_time", 1),
    ("2026-05-04", "0620", "Chemistry ATP: review weak points", 2.0, "practice", "full_time", 2),
    ("2026-05-04", "0625", "Physics: review + formulae", 2.0, "practice", "full_time", 3),
    # 05/05 — EXAM: French Reading
    ("2026-05-05", "0520", "EXAME: French Reading (PM)", 0, "exam", "full_time", 1),
    ("2026-05-05", "0620", "Chemistry ATP: final past paper", 2.0, "practice", "full_time", 2),
    ("2026-05-05", "0625", "Physics: key concepts review", 2.0, "practice", "full_time", 3),
    # 06/05
    ("2026-05-06", "0620", "CHEMISTRY ATP FINAL PREP: light review", 1.5, "final_prep", "full_time", 1),
    ("2026-05-06", "0625", "PHYSICS THEORY FINAL PREP: formulae + key concepts", 2.0, "final_prep", "full_time", 2),
    ("2026-05-06", "0478", "CS: Topic 7 (algorithm design) + past paper intro", 2.0, "mixed", "full_time", 3),
    # 07/05 — EXAM: Chemistry ATP
    ("2026-05-07", "0620", "EXAME: Chemistry ATP (PM)", 0, "exam", "full_time", 1),
    ("2026-05-07", "0625", "Physics: light review", 1.0, "practice", "full_time", 2),
    ("2026-05-07", "0478", "CS: Topic 8 — programming practice", 2.0, "study", "full_time", 3),
    # 08/05 — EXAM: Physics Theory
    ("2026-05-08", "0625", "EXAME: Physics Theory (PM)", 0, "exam", "full_time", 1),
    ("2026-05-08", "0478", "CS: Topics 9-10 (databases + boolean logic)", 2.5, "study", "full_time", 2),
    # 09/05
    ("2026-05-09", "0610", "Biology ATP: practice experiments + questions", 3.0, "practice", "full_time", 1),
    ("2026-05-09", "0478", "CS Paper 1: past paper #1", 2.0, "practice", "full_time", 2),
    # 10/05
    ("2026-05-10", "0610", "Biology ATP: typical questions + apparatus", 2.5, "practice", "full_time", 1),
    ("2026-05-10", "0478", "CS Paper 1: past paper #2", 2.0, "practice", "full_time", 2),
    # 11/05
    ("2026-05-11", "0610", "BIOLOGY ATP FINAL PREP", 1.5, "final_prep", "full_time", 1),
    ("2026-05-11", "0478", "CS PAPER 1 FINAL PREP", 1.5, "final_prep", "full_time", 2),
    # 12/05 — EXAM: Biology ATP
    ("2026-05-12", "0610", "EXAME: Biology ATP (PM)", 0, "exam", "full_time", 1),
    ("2026-05-12", "0478", "CS Paper 1: light review", 1.0, "practice", "full_time", 2),
    # 13/05 — EXAM: CS Paper 1
    ("2026-05-13", "0478", "EXAME: CS Paper 1 (PM)", 0, "exam", "full_time", 1),
    ("2026-05-13", "0625", "Physics ATP: start practice experiments", 2.0, "practice", "full_time", 2),
    # 14/05
    ("2026-05-14", "0625", "Physics ATP: practice experiments", 2.5, "practice", "full_time", 1),
    ("2026-05-14", "0478", "CS Paper 2: programming practice", 2.5, "practice", "full_time", 2),
    ("2026-05-14", "0504", "Portugues: P1 practice", 2.0, "practice", "full_time", 3),
    # 15/05
    ("2026-05-15", "0625", "Physics ATP: typical questions", 2.5, "practice", "full_time", 1),
    ("2026-05-15", "0478", "CS Paper 2: past paper #1", 2.0, "practice", "full_time", 2),
    ("2026-05-15", "0504", "Portugues: P1 past paper", 2.0, "practice", "full_time", 3),
    # 16/05
    ("2026-05-16", "0625", "Physics ATP: past paper", 2.5, "practice", "full_time", 1),
    ("2026-05-16", "0478", "CS Paper 2: past paper #2", 2.0, "practice", "full_time", 2),
    # 17/05
    ("2026-05-17", "0625", "Physics ATP: final past paper", 2.0, "practice", "full_time", 1),
    ("2026-05-17", "0478", "CS Paper 2: final review", 2.0, "practice", "full_time", 2),
    # 18/05
    ("2026-05-18", "0625", "PHYSICS ATP FINAL PREP: light review", 1.5, "final_prep", "full_time", 1),
    ("2026-05-18", "0478", "CS PAPER 2 FINAL PREP", 1.5, "final_prep", "full_time", 2),
    # 19/05 — EXAM: Physics ATP
    ("2026-05-19", "0625", "EXAME: Physics ATP (PM)", 0, "exam", "full_time", 1),
    ("2026-05-19", "0478", "CS Paper 2: light review", 1.0, "practice", "full_time", 2),
    # 20/05 — EXAM: CS Paper 2
    ("2026-05-20", "0478", "EXAME: CS Paper 2 (PM)", 0, "exam", "full_time", 1),
    ("2026-05-20", "0504", "Portugues: P1 full past paper", 2.0, "practice", "full_time", 2),

    # === LATE MAY / JUNE ===
    # 21/05
    ("2026-05-21", "0504", "Portugues: P1 past paper + P2 writing samples", 4.0, "practice", "full_time", 1),
    ("2026-05-21", "0520", "French Listening: vocab + practice start", 2.0, "study", "full_time", 2),
    # 22/05
    ("2026-05-22", "0504", "Portugues: P1 + P2 final practice", 3.0, "practice", "full_time", 1),
    ("2026-05-22", "0520", "French Listening: practice exercises", 2.0, "practice", "full_time", 2),
    # 23/05
    ("2026-05-23", "0504", "Portugues: P1 review + weak points", 2.0, "practice", "full_time", 1),
    ("2026-05-23", "0520", "French Listening: practice", 1.5, "practice", "full_time", 2),
    # 24/05
    ("2026-05-24", "0504", "PORTUGUES P1 FINAL PREP", 1.5, "final_prep", "full_time", 1),
    # 25/05 — EXAM: Portugues P1
    ("2026-05-25", "0504", "EXAME: Portugues Paper 1 (PM)", 0, "exam", "full_time", 1),
    ("2026-05-25", "0504", "Portugues P2: review writing techniques", 1.5, "practice", "full_time", 2),
    # 26/05
    ("2026-05-26", "0504", "Portugues P2: final writing practice", 2.5, "practice", "full_time", 1),
    ("2026-05-26", "0520", "French Listening: intensive practice", 2.0, "practice", "full_time", 2),
    ("2026-05-26", "0625", "Physics MC: flashcards start", 1.5, "study", "full_time", 3),
    # 27/05
    ("2026-05-27", "0504", "PORTUGUES P2 FINAL PREP", 1.5, "final_prep", "full_time", 1),
    ("2026-05-27", "0520", "French Listening: practice", 1.5, "practice", "full_time", 2),
    ("2026-05-27", "0625", "Physics MC: past paper questions", 1.5, "practice", "full_time", 3),
    # 28/05 — EXAM: Portugues P2
    ("2026-05-28", "0504", "EXAME: Portugues Paper 2 (PM)", 0, "exam", "full_time", 1),
    ("2026-05-28", "0520", "French Listening: practice", 1.5, "practice", "full_time", 2),
    ("2026-05-28", "0625", "Physics MC: practice", 1.5, "practice", "full_time", 3),
    # 29/05
    ("2026-05-29", "0625", "Physics MC: past papers", 2.0, "practice", "full_time", 1),
    ("2026-05-29", "0520", "French Listening: intensive", 2.0, "practice", "full_time", 2),
    ("2026-05-29", "0610", "Biology MC: flashcards + start", 1.5, "study", "full_time", 3),
    ("2026-05-29", "0620", "Chemistry MC: flashcards start", 1.5, "study", "full_time", 4),
    # 30/05
    ("2026-05-30", "0625", "Physics MC: past papers", 2.0, "practice", "full_time", 1),
    ("2026-05-30", "0520", "French Listening: practice", 1.5, "practice", "full_time", 2),
    ("2026-05-30", "0610", "Biology MC: past paper questions", 1.5, "practice", "full_time", 3),
    # 31/05
    ("2026-05-31", "0625", "Physics MC: past papers", 2.0, "practice", "full_time", 1),
    ("2026-05-31", "0520", "French Listening: practice", 1.5, "practice", "full_time", 2),
    ("2026-05-31", "0620", "Chemistry MC: practice", 1.5, "practice", "full_time", 3),
    # 01/06
    ("2026-06-01", "0625", "Physics MC: final review", 2.0, "practice", "full_time", 1),
    ("2026-06-01", "0520", "French Listening: intensive", 2.0, "practice", "full_time", 2),
    ("2026-06-01", "0610", "Biology MC: past papers", 1.5, "practice", "full_time", 3),
    # 02/06
    ("2026-06-02", "0625", "PHYSICS MC FINAL PREP", 1.5, "final_prep", "full_time", 1),
    ("2026-06-02", "0520", "FRENCH LISTENING FINAL PREP", 1.5, "final_prep", "full_time", 2),
    ("2026-06-02", "0610", "Biology MC: practice", 1.5, "practice", "full_time", 3),
    ("2026-06-02", "0620", "Chemistry MC: practice", 1.5, "practice", "full_time", 4),
    # 03/06 — EXAM: Physics MC
    ("2026-06-03", "0625", "EXAME: Physics MC (PM)", 0, "exam", "full_time", 1),
    ("2026-06-03", "0520", "French Listening: light review", 1.0, "practice", "full_time", 2),
    ("2026-06-03", "0610", "Biology MC: past papers", 2.0, "practice", "full_time", 3),
    # 04/06 — EXAM: French Listening
    ("2026-06-04", "0520", "EXAME: French Listening (PM)", 0, "exam", "full_time", 1),
    ("2026-06-04", "0610", "Biology MC: intensive past papers", 2.0, "practice", "full_time", 2),
    ("2026-06-04", "0620", "Chemistry MC: past papers", 2.0, "practice", "full_time", 3),
    # 05/06
    ("2026-06-05", "0610", "Biology MC: past papers", 2.5, "practice", "full_time", 1),
    ("2026-06-05", "0620", "Chemistry MC: past papers", 2.5, "practice", "full_time", 2),
    # 06/06
    ("2026-06-06", "0610", "Biology MC: past papers", 2.0, "practice", "full_time", 1),
    ("2026-06-06", "0620", "Chemistry MC: past papers", 2.0, "practice", "full_time", 2),
    # 07/06
    ("2026-06-07", "0610", "BIOLOGY MC FINAL PREP", 1.5, "final_prep", "full_time", 1),
    ("2026-06-07", "0620", "Chemistry MC: final review", 2.0, "practice", "full_time", 2),
    # 08/06 — EXAM: Biology MC
    ("2026-06-08", "0610", "EXAME: Biology MC (PM)", 0, "exam", "full_time", 1),
    ("2026-06-08", "0620", "CHEMISTRY MC FINAL PREP", 1.5, "final_prep", "full_time", 2),
    # 09/06 — EXAM: Chemistry MC — LAST EXAM
    ("2026-06-09", "0620", "EXAME: Chemistry MC (PM) — ULTIMO EXAME!", 0, "exam", "full_time", 1),
]


# ============================================================
# Supabase REST helpers
# ============================================================

def supabase_request(path, method="GET", data=None, prefer=None):
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
        error_body = e.read().decode("utf-8")
        print(f"  ERROR {e.code}: {error_body[:500]}")
        raise


def fetch_topic_uuid_map():
    """Build topic_code → UUID map."""
    rows = supabase_request("syllabus_topics?select=id,topic_code")
    return {r["topic_code"]: r["id"] for r in rows}


# ============================================================
# Main
# ============================================================

def main():
    print("=" * 60)
    print("CLIP Tutor — Study Plan Seed")
    print(f"Total blocks: {len(PLAN)}")
    print("=" * 60)

    if DRY_RUN:
        print("[DRY RUN MODE]\n")

    # Fetch topic UUIDs
    print("Fetching topic UUID map...")
    topic_uuid_map = fetch_topic_uuid_map()
    print(f"  {len(topic_uuid_map)} topics mapped\n")

    # Build rows
    rows = []
    for date, subj, title, hours, stype, phase, order in PLAN:
        topic_codes = guess_topic_codes(title, subj)
        topic_uuids = [topic_uuid_map[tc] for tc in topic_codes if tc in topic_uuid_map]

        rows.append({
            "plan_date": date,
            "subject_code": subj,
            "title": title,
            "syllabus_topic_ids": topic_uuids if topic_uuids else [],
            "planned_hours": hours,
            "study_type": stype,
            "phase": phase,
            "sort_order": order,
            "status": "pending",
        })

    # Count stats
    dates = set(r["plan_date"] for r in rows)
    total_hours = sum(r["planned_hours"] for r in rows)
    exams = sum(1 for r in rows if r["study_type"] == "exam")
    with_topics = sum(1 for r in rows if r["syllabus_topic_ids"])

    print(f"  {len(rows)} blocks across {len(dates)} days")
    print(f"  {total_hours:.1f} total study hours")
    print(f"  {exams} exam entries")
    print(f"  {with_topics}/{len(rows)} blocks linked to syllabus topics")
    print()

    if DRY_RUN:
        print("[DRY RUN] Would insert these blocks. Run without --dry-run to insert.")
        return

    # Batch insert
    BATCH = 50
    inserted = 0
    for i in range(0, len(rows), BATCH):
        batch = rows[i:i + BATCH]
        supabase_request(
            "study_plan_entries",
            method="POST",
            data=batch,
            prefer="return=minimal",
        )
        inserted += len(batch)
        print(f"  Inserted {inserted}/{len(rows)}")

    print(f"\nDONE: {inserted} study plan entries seeded.")


if __name__ == "__main__":
    main()
