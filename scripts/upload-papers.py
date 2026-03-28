"""
Upload past paper PDFs to Supabase Storage bucket 'papers'.
Only uploads PDFs matching papers in exam_papers table (438 files, ~361MB).
Then updates exam_papers rows with qp_url / ms_url.

Structure: papers/{paper_id}/qp.pdf, papers/{paper_id}/ms.pdf
Usage: py scripts/upload-papers.py [--dry-run]
"""

import json
import os
import sys
import glob
import time
import urllib.request
from concurrent.futures import ThreadPoolExecutor, as_completed

sys.stdout.reconfigure(encoding="utf-8")

SUPABASE_URL = "https://lltcfjmshnhfmavlxpxr.supabase.co"
SERVICE_KEY = os.environ["SUPABASE_SERVICE_ROLE_KEY"]
MGMT_TOKEN = os.environ["SUPABASE_ACCESS_TOKEN"]
MGMT_API = "https://api.supabase.com/v1/projects/lltcfjmshnhfmavlxpxr/database/query"

PDF_BASE = "c:/Users/sarma/OneDrive/Ambiente de Trabalho/TUTOR FILHA/clip-tutor-kb/past-papers"
SUBJECTS = ["0620", "0625", "0610", "0478", "0520", "0504"]
WORKERS = 10
TIMEOUT = 30
MAX_RETRIES = 2
DRY_RUN = "--dry-run" in sys.argv


def run_sql(sql):
    data = json.dumps({"query": sql}).encode("utf-8")
    req = urllib.request.Request(MGMT_API, data=data, method="POST", headers={
        "Authorization": f"Bearer {MGMT_TOKEN}",
        "Content-Type": "application/json",
        "User-Agent": "supabase-cli/2.84.4",
    })
    resp = urllib.request.urlopen(req)
    return json.loads(resp.read().decode("utf-8"))


def upload_one(local_path, storage_path):
    with open(local_path, "rb") as f:
        file_data = f.read()

    url = f"{SUPABASE_URL}/storage/v1/object/papers/{storage_path}"
    for attempt in range(MAX_RETRIES + 1):
        req = urllib.request.Request(url, data=file_data, method="POST", headers={
            "apikey": SERVICE_KEY,
            "Authorization": f"Bearer {SERVICE_KEY}",
            "Content-Type": "application/pdf",
            "x-upsert": "true",
        })
        try:
            resp = urllib.request.urlopen(req, timeout=TIMEOUT)
            resp.read()
            return (storage_path, True, None)
        except Exception as e:
            if attempt < MAX_RETRIES:
                time.sleep(1)
                continue
            return (storage_path, False, str(e)[:120])

    return (storage_path, False, "max retries")


def parse_filename(fname):
    """Parse '0620_m19_qp_42' → (paper_id='0620_m19_42', type='qp')"""
    parts = fname.split("_")
    if len(parts) >= 4 and parts[2] in ("qp", "ms"):
        paper_id = f"{parts[0]}_{parts[1]}_{parts[3]}"
        return paper_id, parts[2]
    return None, None


def main():
    print("=" * 60)
    print("CLIP Tutor — Paper PDF Upload")
    print(f"Workers: {WORKERS}, Subjects: {', '.join(SUBJECTS)}")
    print("=" * 60)

    # 1. Get paper IDs from DB
    print("\nFetching paper IDs from exam_papers...")
    result = run_sql("SELECT id FROM exam_papers")
    paper_ids = set(r["id"] for r in result)
    print(f"  {len(paper_ids)} papers in DB")

    # 2. Collect matching PDFs
    print("\nScanning PDFs...")
    uploads = []  # (local_path, storage_path, paper_id, type)
    skipped = 0

    for code in SUBJECTS:
        for pdf in glob.glob(f"{PDF_BASE}/{code}/**/*.pdf", recursive=True):
            fname = os.path.basename(pdf).replace(".pdf", "")
            paper_id, ptype = parse_filename(fname)
            if paper_id and paper_id in paper_ids:
                storage_path = f"{paper_id}/{ptype}.pdf"
                uploads.append((pdf, storage_path, paper_id, ptype))
            else:
                skipped += 1

    total_size = sum(os.path.getsize(u[0]) for u in uploads)
    print(f"  {len(uploads)} PDFs to upload ({total_size // 1024 // 1024}MB)")
    print(f"  {skipped} PDFs skipped (not in exam_papers)")

    if DRY_RUN:
        print("\n[DRY RUN] Would upload these files:")
        for _, sp, _, _ in uploads[:5]:
            print(f"  papers/{sp}")
        print(f"  ... and {len(uploads) - 5} more")
        return

    # 3. Upload in parallel
    print("\nUploading...")
    uploaded = 0
    failed = 0
    failed_files = []
    start = time.time()

    with ThreadPoolExecutor(max_workers=WORKERS) as pool:
        futures = {
            pool.submit(upload_one, local, sp): sp
            for local, sp, _, _ in uploads
        }
        for i, future in enumerate(as_completed(futures), 1):
            path, ok, err = future.result()
            if ok:
                uploaded += 1
            else:
                failed += 1
                failed_files.append((path, err))

            if i % 50 == 0 or i == len(uploads):
                elapsed = time.time() - start
                rate = i / elapsed if elapsed > 0 else 0
                left = (len(uploads) - i) / rate if rate > 0 else 0
                print(f"  {i}/{len(uploads)} — {uploaded} ok, {failed} fail — {rate:.1f}/s, ~{left:.0f}s left")

    elapsed = time.time() - start
    print(f"\nUpload done in {elapsed:.0f}s: {uploaded} ok, {failed} failed")

    if failed_files:
        print(f"\nFailed ({len(failed_files)}):")
        for path, err in failed_files[:10]:
            print(f"  {path}: {err}")

    # 4. Update exam_papers with URLs
    print("\nUpdating exam_papers with URLs...")
    base_url = f"{SUPABASE_URL}/storage/v1/object/public/papers"

    # Build a map: paper_id → {qp: bool, ms: bool}
    paper_files = {}
    for _, sp, pid, ptype in uploads:
        if pid not in paper_files:
            paper_files[pid] = {}
        paper_files[pid][ptype] = True

    updated = 0
    for pid, types in paper_files.items():
        sets = []
        safe_pid = pid.replace("'", "''")
        if "qp" in types:
            sets.append(f"qp_url = '{base_url}/{safe_pid}/qp.pdf'")
        if "ms" in types:
            sets.append(f"ms_url = '{base_url}/{safe_pid}/ms.pdf'")
        if sets:
            sql = f"UPDATE exam_papers SET {', '.join(sets)} WHERE id = '{safe_pid}'"
            run_sql(sql)
            updated += 1

    print(f"  {updated} papers updated with URLs")

    # 5. Verify
    print("\nVerification:")
    result = run_sql("SELECT count(*)::int AS c FROM exam_papers WHERE qp_url IS NOT NULL")
    print(f"  Papers with qp_url: {result[0]['c']}")
    result = run_sql("SELECT count(*)::int AS c FROM exam_papers WHERE ms_url IS NOT NULL")
    print(f"  Papers with ms_url: {result[0]['c']}")

    print(f"\nSample URLs:")
    result = run_sql("SELECT id, qp_url, ms_url FROM exam_papers WHERE qp_url IS NOT NULL LIMIT 3")
    for r in result:
        print(f"  {r['id']}:")
        print(f"    QP: {r['qp_url']}")
        print(f"    MS: {r['ms_url']}")

    print("=" * 60)


if __name__ == "__main__":
    main()
