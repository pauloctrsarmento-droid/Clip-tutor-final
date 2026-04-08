"""
Fetch SaveMyExams subtopic slug mapping for all relevant subjects.

Output: data/sme_html/subtopic_slugs.json with structure:
{
  "0610_bio_t6_s1": "6-plant-nutrition/6-1-photosynthesis",
  ...
}

The key maps our internal ID format (subject_code + topic + section)
to the SME URL path used in topic-questions URLs.

Usage: py -u scripts/fetch_sme_subtopic_slugs.py
"""

import json
import os
import re
import sys
import urllib.request

SUBJECT_SLUGS = {
    "0620": ("chemistry", "23", "chem"),
    "0625": ("physics", "23", "phys"),
    "0610": ("biology", "23", "bio"),
    "0478": ("computer-science", "23", "cs"),
}

BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUTPUT_PATH = os.path.join(BASE_DIR, "data", "sme_html", "subtopic_slugs.json")


def fetch_index(subject_slug, spec):
    url = f"https://www.savemyexams.com/igcse/{subject_slug}/cie/{spec}/topic-questions/"
    req = urllib.request.Request(url, headers={
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
        "Accept": "text/html",
    })
    with urllib.request.urlopen(req, timeout=30) as resp:
        html = resp.read().decode("utf-8")
    m = re.search(r'<script id="__NEXT_DATA__"[^>]*>(.*?)</script>', html, re.DOTALL)
    if not m:
        raise RuntimeError(f"No __NEXT_DATA__ found at {url}")
    return json.loads(m.group(1))["props"]["pageProps"]


def build_mapping_for_subject(subject_code):
    subject_slug, spec, internal_short = SUBJECT_SLUGS[subject_code]
    print(f"Fetching {subject_slug}...", flush=True)
    pp = fetch_index(subject_slug, spec)

    sections = pp.get("sections", [])
    topics = pp.get("topics", [])

    # Index sections by order -> slug
    section_by_id = {s["id"]: s for s in sections}
    section_by_order = {}
    for s in sections:
        order = s["attributes"]["order"]
        section_by_order[order] = s

    # Group topics by section_id in order
    topics_by_section = {}
    for t in topics:
        sec_rel = t.get("relationships", {}).get("section", {}).get("data", {})
        sec_id = sec_rel.get("id") if sec_rel else None
        if not sec_id:
            continue
        topics_by_section.setdefault(sec_id, []).append(t)

    # Sort topics within each section by order
    for sec_id in topics_by_section:
        topics_by_section[sec_id].sort(key=lambda t: t["attributes"].get("order", 0))

    # Build mapping: {subject}_{internal_short}_t{N}_s{M} -> {section_slug}/{topic_slug}
    mapping = {}
    for order, section in sorted(section_by_order.items()):
        topic_num = order + 1  # T1 = order 0, T2 = order 1
        section_slug = section["attributes"]["slug"]
        section_id = section["id"]
        topics_in_section = topics_by_section.get(section_id, [])

        for idx, topic in enumerate(topics_in_section):
            section_num = idx + 1  # s1 = first topic, s2 = second, etc.
            topic_slug = topic["attributes"]["slug"]
            key = f"{subject_code}_{internal_short}_t{topic_num}_s{section_num}"
            value = f"{section_slug}/{topic_slug}"
            mapping[key] = value

    print(f"  {len(mapping)} mappings built", flush=True)
    return mapping


def main():
    all_mappings = {}
    for subject_code in SUBJECT_SLUGS:
        try:
            mapping = build_mapping_for_subject(subject_code)
            all_mappings.update(mapping)
        except Exception as e:
            print(f"  ERROR for {subject_code}: {e}", flush=True)

    os.makedirs(os.path.dirname(OUTPUT_PATH), exist_ok=True)
    with open(OUTPUT_PATH, "w", encoding="utf-8") as f:
        json.dump(all_mappings, f, indent=2, ensure_ascii=False)

    print(f"\nSaved {len(all_mappings)} mappings to {OUTPUT_PATH}", flush=True)

    # Sample output
    print("\nSample mappings:")
    for key in list(all_mappings.keys())[:5]:
        print(f"  {key} -> {all_mappings[key]}")


if __name__ == "__main__":
    main()
