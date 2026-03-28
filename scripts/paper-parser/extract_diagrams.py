"""
extract_diagrams.py — Extract diagram PNGs from IGCSE question paper PDFs.

Caption-based naming: Fig. 3.1 → fig_3_1.png, Table 2.1 → table_2_1.png
Organized in per-paper folders: data/diagrams/{paper_id}/

Usage:
    python extract_diagrams.py                     # Extract all subjects
    python extract_diagrams.py --subject 0625      # Physics only
"""
import fitz
import os
import re
import shutil
import sys
from pathlib import Path

# ── Configuration ────────────────────────────────────────────────────
KB = Path(r"c:\Users\sarma\OneDrive\Ambiente de Trabalho\TUTOR FILHA\clip-tutor-kb\past-papers")
OUTDIR = Path(r"c:\Users\sarma\OneDrive\Ambiente de Trabalho\tutor final\data\diagrams")

SCALE = 2
PADDING = 25
MIN_CLUSTER_W = 25           # lowered for small chemical structures (bonds, boxes)
MIN_CLUSTER_H = 10           # lowered for flat chemistry structures (14pt tall bond lines)
MERGE_GAP = 15
LEFT_MARGIN = 100
CAPTION_MARGIN = 40

RE_FIG_CAPTION = re.compile(r'Fig\.\s*(\d+)\.(\d+)')
RE_TABLE_CAPTION = re.compile(r'Table\s+(\d+)\.(\d+)')

SUBJECTS = [
    ("0620", "chemistry", ["41", "42", "43"]),
    ("0625", "physics", ["41", "42", "43"]),
    ("0610", "biology", ["41", "42", "43"]),
    ("0478", "cs", ["11", "21"]),
]


# ── Drawing Detection ────────────────────────────────────────────────

def find_raster_clusters(page):
    clusters = []
    for info in page.get_image_info():
        bbox = info.get("bbox")
        if bbox:
            r = fitz.Rect(bbox)
            if r.width >= MIN_CLUSTER_W and r.height >= MIN_CLUSTER_H:
                clusters.append(r)
    clusters.sort(key=lambda c: c.y0)
    return clusters


def find_drawing_clusters(page):
    drawings = page.get_drawings()
    if not drawings:
        return find_raster_clusters(page)

    pw, ph = page.rect.width, page.rect.height
    rects = []
    for d in drawings:
        r = d["rect"]
        if r.width < 2 and r.height < 2:
            continue
        # Filter margin elements
        if r.x0 > pw * 0.88:                    # right margin bar
            continue
        if r.height > ph * 0.8 and r.width < 10:  # full-page vertical line
            continue
        if r.width > pw * 0.8 and r.height < 5:   # full-page horizontal line
            continue
        if r.y0 < 25 and r.y1 < 55:               # top barcode
            continue
        if r.y0 > ph - 30:                         # bottom copyright strip
            continue
        # Corner marks
        if r.width < 25 and r.height < 25:
            if (r.x0 < 70 and r.y0 < 55) or (r.x0 < 70 and r.y1 > ph - 55) or (r.y1 > ph - 55):
                continue
        rects.append(r)
    if not rects:
        return find_raster_clusters(page)

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

    changed = True
    passes = 0
    while changed and passes < 20:
        changed = False
        passes += 1
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
                    c = fitz.Rect(
                        min(c.x0, c2.x0), min(c.y0, c2.y0),
                        max(c.x1, c2.x1), max(c.y1, c2.y1))
                    used.add(j)
                    changed = True
            new_clusters.append(c)
            used.add(i)
        clusters = new_clusters

    clusters = [c for c in clusters if c.width >= MIN_CLUSTER_W and c.height >= MIN_CLUSTER_H]
    clusters.sort(key=lambda c: c.y0)
    return clusters


# ── Label Expansion ──────────────────────────────────────────────────

def expand_cluster_with_labels(page, cluster):
    """Expand cluster with nearby labels. X-clipped to prevent bridging."""
    blocks = page.get_text("blocks")
    expanded = fitz.Rect(cluster)
    label_margin = 30
    orig = fitz.Rect(cluster)

    for b in blocks:
        x0, y0, x1, y1, text, bn, bt = b
        if bt != 0:
            continue
        text = text.strip()
        if len(text) > 60:
            continue
        if re.match(r'^\d+[\s\t]', text):
            continue
        if re.match(r'^\([a-z]\)', text):
            continue
        if re.match(r'^\([ivx]+\)', text):
            continue
        if y0 > orig.y1 + label_margin:
            continue
        if (x0 < orig.x1 + label_margin and x1 > orig.x0 - label_margin and
            y0 < orig.y1 + label_margin and y1 > orig.y0 - label_margin):
            clipped_x0 = max(x0, orig.x0 - label_margin)
            clipped_x1 = min(x1, orig.x1 + label_margin)
            if clipped_x0 >= clipped_x1:
                continue
            expanded = fitz.Rect(
                min(expanded.x0, clipped_x0), min(expanded.y0, y0),
                max(expanded.x1, clipped_x1), max(expanded.y1, y1))
    return expanded


def crop_diagram(page, rect):
    pad_pts = PADDING / SCALE
    crop = fitz.Rect(
        max(0, rect.x0 - pad_pts),
        max(0, rect.y0 - pad_pts),
        min(page.rect.width, rect.x1 + pad_pts),
        min(page.rect.height, rect.y1 + pad_pts))
    mat = fitz.Matrix(SCALE, SCALE)
    pix = page.get_pixmap(matrix=mat, clip=crop)
    return pix.tobytes("png")


# ── Caption Detection ────────────────────────────────────────────────

def find_cluster_caption(page, cluster):
    """Find 'Fig. X.Y' or 'Table X.Y' caption near a cluster.
    Returns (type, major, minor) e.g. ('fig', '3', '1') or None.
    """
    blocks = page.get_text("blocks")
    search_rect = fitz.Rect(
        cluster.x0 - CAPTION_MARGIN,
        cluster.y0 - CAPTION_MARGIN,
        cluster.x1 + CAPTION_MARGIN,
        cluster.y1 + CAPTION_MARGIN)

    for b in blocks:
        x0, y0, x1, y1, text, bn, bt = b
        if bt != 0:
            continue
        block_rect = fitz.Rect(x0, y0, x1, y1)
        if not block_rect.intersects(search_rect):
            continue

        m = RE_FIG_CAPTION.search(text)
        if m:
            return ("fig", m.group(1), m.group(2))
        m = RE_TABLE_CAPTION.search(text)
        if m:
            return ("table", m.group(1), m.group(2))

    return None


# ── Main Extraction ──────────────────────────────────────────────────

def extract_paper(qp_path, out_dir):
    """Extract diagrams from a single QP PDF.
    Names by caption (fig_3_1.png) or position (unknown_page5_y230.png).
    Returns list of (filename, caption_or_none) and counts.
    """
    doc = fitz.open(str(qp_path))
    os.makedirs(out_dir, exist_ok=True)

    results = []
    captioned = 0
    unknown = 0
    seen_captions = set()

    for pn in range(1, len(doc)):
        page = doc[pn]
        clusters = find_drawing_clusters(page)
        if not clusters:
            continue

        for cluster in clusters:
            # Expand with labels
            expanded = expand_cluster_with_labels(page, cluster)

            # Crop
            png_data = crop_diagram(page, expanded)

            # Quality validation
            if len(png_data) < 2000:
                continue
            if expanded.width < 50 and expanded.height < 50:
                continue

            # Find caption
            caption = find_cluster_caption(page, expanded)

            if caption:
                ctype, major, minor = caption
                fname = f"{ctype}_{major}_{minor}.png"
                # Avoid duplicates (same caption on same page from different clusters)
                if fname in seen_captions:
                    continue
                seen_captions.add(fname)
                captioned += 1
            else:
                fname = f"unknown_page{pn}_y{int(cluster.y0)}.png"
                unknown += 1

            fpath = os.path.join(out_dir, fname)
            with open(fpath, "wb") as f:
                f.write(png_data)

            results.append((fname, caption))

    doc.close()
    return results, captioned, unknown


def run_all(subject_filter=None):
    """Extract diagrams for all subjects."""
    sys.stdout.reconfigure(encoding="utf-8")
    total_pngs = 0
    total_captioned = 0
    total_unknown = 0
    all_unknowns = []

    # Clean output dir
    if OUTDIR.exists() and not subject_filter:
        shutil.rmtree(OUTDIR)
    os.makedirs(OUTDIR, exist_ok=True)

    for code, subj_name, variants in SUBJECTS:
        if subject_filter and code != subject_filter:
            continue

        subj_pngs = 0
        subj_captioned = 0
        subj_unknown = 0
        subj_papers = 0
        subj_unknowns = []

        for year in range(2019, 2026):
            for session in ["m", "s", "w"]:
                for variant in variants:
                    qp = KB / code / str(year) / f"{code}_{session}{str(year)[2:]}_qp_{variant}.pdf"
                    if not qp.exists():
                        continue

                    # Build paper_id
                    paper_id = f"{code}_{session}{str(year)[2:]}_{variant}"
                    paper_dir = OUTDIR / paper_id

                    try:
                        results, cap, unk = extract_paper(str(qp), str(paper_dir))
                        subj_pngs += len(results)
                        subj_captioned += cap
                        subj_unknown += unk
                        subj_papers += 1
                        for fname, caption in results:
                            if caption is None:
                                subj_unknowns.append(f"{paper_id}/{fname}")
                    except Exception as e:
                        print(f"  ERROR {qp.stem}: {e}")

        total_pngs += subj_pngs
        total_captioned += subj_captioned
        total_unknown += subj_unknown
        all_unknowns.extend(subj_unknowns)
        print(f"{code} {subj_name:<12s} {subj_papers:>3d} papers | {subj_pngs:>4d} PNGs | {subj_captioned:>4d} captioned | {subj_unknown:>3d} unknown")

    print(f"\nTotal: {total_pngs} PNGs ({total_captioned} captioned, {total_unknown} unknown)")

    if all_unknowns:
        print(f"\n--- Unknown PNGs ({len(all_unknowns)}) ---")
        for u in all_unknowns[:50]:
            print(f"  {u}")
        if len(all_unknowns) > 50:
            print(f"  ... and {len(all_unknowns) - 50} more")


if __name__ == "__main__":
    subject = None
    if "--subject" in sys.argv:
        idx = sys.argv.index("--subject")
        subject = sys.argv[idx + 1]
    run_all(subject)
