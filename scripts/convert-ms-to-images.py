"""
Convert all mark scheme PDFs to PNG images and upload to Supabase Storage.
Run once — images are cached permanently in the 'ms-images' bucket.

Usage: py scripts/convert-ms-to-images.py [--dry-run] [--paper PAPER_ID]
"""

import fitz  # PyMuPDF
import io
import json
import os
import sys
import urllib.request
import urllib.error

SUPABASE_URL = "https://lltcfjmshnhfmavlxpxr.supabase.co"
SERVICE_KEY = None
env_path = os.path.join(os.path.dirname(__file__), "..", "web", ".env.local")
if os.path.exists(env_path):
    with open(env_path) as f:
        for line in f:
            if line.startswith("SUPABASE_SERVICE_ROLE_KEY="):
                SERVICE_KEY = line.strip().split("=", 1)[1]
                break

if not SERVICE_KEY:
    print("ERROR: SUPABASE_SERVICE_ROLE_KEY not found")
    sys.exit(1)

DRY_RUN = "--dry-run" in sys.argv
SINGLE_PAPER = None
for i, arg in enumerate(sys.argv):
    if arg == "--paper" and i + 1 < len(sys.argv):
        SINGLE_PAPER = sys.argv[i + 1]


def storage_upload(path, data, content_type="image/png"):
    """Upload a file to Supabase Storage ms-images bucket."""
    url = f"{SUPABASE_URL}/storage/v1/object/ms-images/{path}"
    headers = {
        "apikey": SERVICE_KEY,
        "Authorization": f"Bearer {SERVICE_KEY}",
        "Content-Type": content_type,
    }
    req = urllib.request.Request(url, data=data, method="POST", headers=headers)
    try:
        with urllib.request.urlopen(req) as resp:
            return True
    except urllib.error.HTTPError as e:
        if e.code == 400 and b"Duplicate" in e.read():
            return True  # Already exists
        return False


def storage_exists(paper_id):
    """Check if ms-images already exist for this paper."""
    url = f"{SUPABASE_URL}/storage/v1/object/list/ms-images"
    headers = {
        "apikey": SERVICE_KEY,
        "Authorization": f"Bearer {SERVICE_KEY}",
        "Content-Type": "application/json",
    }
    data = json.dumps({"prefix": f"{paper_id}/", "limit": 1}).encode()
    req = urllib.request.Request(url, data=data, method="POST", headers=headers)
    try:
        with urllib.request.urlopen(req) as resp:
            files = json.loads(resp.read().decode())
            return len(files) > 0
    except urllib.error.HTTPError:
        return False


def get_all_papers():
    """Get all exam papers that have mark schemes."""
    url = f"{SUPABASE_URL}/rest/v1/exam_papers?select=id&limit=1000"
    headers = {"apikey": SERVICE_KEY, "Authorization": f"Bearer {SERVICE_KEY}"}
    papers = []
    offset = 0
    while True:
        req = urllib.request.Request(
            f"{url}&offset={offset}", headers=headers
        )
        with urllib.request.urlopen(req) as resp:
            data = json.loads(resp.read().decode())
        papers.extend([p["id"] for p in data])
        if len(data) < 1000:
            break
        offset += 1000
    return papers


def convert_paper(paper_id):
    """Download MS PDF, convert to PNGs, upload to Storage."""
    ms_url = f"{SUPABASE_URL}/storage/v1/object/public/papers/{paper_id}/ms.pdf"

    # Download PDF
    try:
        req = urllib.request.Request(ms_url)
        with urllib.request.urlopen(req) as resp:
            pdf_bytes = resp.read()
    except urllib.error.HTTPError:
        return 0  # No mark scheme PDF

    # Convert pages to PNG
    doc = fitz.open(stream=pdf_bytes, filetype="pdf")
    count = 0

    for page_num in range(len(doc)):
        page = doc[page_num]
        # Render at 150 DPI (good balance of quality vs size)
        pix = page.get_pixmap(dpi=150)
        png_bytes = pix.tobytes("png")

        path = f"{paper_id}/page_{page_num + 1}.png"

        if DRY_RUN:
            print(f"    [DRY RUN] Would upload {path} ({len(png_bytes)} bytes)")
        else:
            if storage_upload(path, png_bytes):
                count += 1
            else:
                print(f"    ERROR uploading {path}")

    doc.close()
    return count if not DRY_RUN else len(doc)


def main():
    print("=" * 60)
    print("CLIP Tutor — Convert Mark Schemes to Images")
    print("=" * 60)

    if DRY_RUN:
        print("[DRY RUN MODE]\n")

    # Create bucket if needed
    if not DRY_RUN:
        url = f"{SUPABASE_URL}/storage/v1/bucket"
        headers = {
            "apikey": SERVICE_KEY,
            "Authorization": f"Bearer {SERVICE_KEY}",
            "Content-Type": "application/json",
        }
        data = json.dumps({
            "id": "ms-images",
            "name": "ms-images",
            "public": True,
        }).encode()
        req = urllib.request.Request(url, data=data, method="POST", headers=headers)
        try:
            urllib.request.urlopen(req)
            print("Created ms-images bucket")
        except urllib.error.HTTPError:
            pass  # Already exists

    if SINGLE_PAPER:
        papers = [SINGLE_PAPER]
    else:
        papers = get_all_papers()

    print(f"Papers to process: {len(papers)}\n")

    converted = 0
    skipped = 0
    failed = 0

    for i, paper_id in enumerate(papers):
        # Skip if already converted
        if not DRY_RUN and not SINGLE_PAPER and storage_exists(paper_id):
            skipped += 1
            continue

        pages = convert_paper(paper_id)
        if pages > 0:
            converted += 1
            print(f"  [{i+1}/{len(papers)}] {paper_id}: {pages} pages")
        else:
            failed += 1

        if (i + 1) % 50 == 0:
            print(f"  Progress: {i+1}/{len(papers)} ({converted} converted, {skipped} skipped)")

    print(f"\nDone: {converted} papers converted, {skipped} skipped, {failed} no MS PDF")


if __name__ == "__main__":
    main()
