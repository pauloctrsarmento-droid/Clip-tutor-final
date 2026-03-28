"""
ai_validate.py — Validates topic classifications using the batch files.

This script processes validation batch files and writes corrections.
Designed to be called by Claude Sonnet agents, one subject at a time.

Usage:
    python ai_validate.py <subject_code>
"""
import json
import os
import sys
import glob

OUTDIR = r"c:\Users\sarma\OneDrive\Ambiente de Trabalho\tutor final\data\extracted"


def build_prompt(batch_data):
    """Build the validation prompt for a batch."""
    topics = batch_data["topics"]
    questions = batch_data["questions"]

    lines = [f"Topics: {topics}", "", "For each question, verify if the assigned topic is correct. Reply ONLY with corrections in format: ID|CORRECT_TOPIC", "If the assignment is correct, skip it.", ""]

    for q in questions:
        text = q["text"][:180]
        lines.append(f'[{q["current_topic"]}] {q["id"]}: {text}')

    return "\n".join(lines)


def apply_corrections(subject_code, corrections):
    """Apply corrections to the verified JSON file."""
    files = {
        "0620": "chemistry_verified.json", "0625": "physics_verified.json",
        "0610": "biology_verified.json", "0478": "cs_verified.json",
        "0500": "english_lang_verified.json", "0475": "english_lit_verified.json",
        "0520": "french_verified.json", "0504": "portuguese_verified.json",
    }

    fname = files.get(subject_code)
    if not fname:
        return 0

    path = os.path.join(OUTDIR, subject_code, fname)
    with open(path, encoding="utf-8") as f:
        data = json.load(f)

    # Build correction lookup
    corr_map = {}
    for corr in corrections:
        if "|" in corr:
            parts = corr.strip().split("|")
            if len(parts) == 2:
                corr_map[parts[0].strip()] = parts[1].strip()

    # Apply
    applied = 0
    for q in data["questions"]:
        if q["id"] in corr_map:
            old = q.get("syllabus_topic_id")
            new = corr_map[q["id"]]
            if old != new:
                q["syllabus_topic_id"] = new
                q["topic_confidence"] = 0.95
                q["topic_method"] = "ai_validated"
                applied += 1

    with open(path, "w", encoding="utf-8") as f:
        json.dump(data, f, indent=2, ensure_ascii=False)

    return applied


def main():
    sys.stdout.reconfigure(encoding="utf-8")

    if len(sys.argv) < 2:
        print("Usage: python ai_validate.py <subject_code>")
        sys.exit(1)

    subject_code = sys.argv[1]

    # Find all batch files for this subject
    batch_files = sorted(glob.glob(os.path.join(OUTDIR, "val_batch_*.json")))
    subject_batches = []
    for bf in batch_files:
        with open(bf, encoding="utf-8") as f:
            bd = json.load(f)
        if bd["subject_code"] == subject_code:
            subject_batches.append((bf, bd))

    print(f"{subject_code}: {len(subject_batches)} batches to validate")

    # Output all prompts for the agent to process
    for bf, bd in subject_batches:
        prompt = build_prompt(bd)
        print(f"\n--- BATCH {bd['batch_num']} ({len(bd['questions'])} questions) ---")
        print(prompt)


if __name__ == "__main__":
    main()
