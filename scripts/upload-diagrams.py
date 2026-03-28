"""
Upload all diagram PNGs to Supabase Storage bucket 'diagrams'.
Uses parallel uploads (10 workers) with retry and timeout.

Usage: py scripts/upload-diagrams.py [--dry-run]
"""

import os
import sys
import urllib.request
import time
from concurrent.futures import ThreadPoolExecutor, as_completed

SUPABASE_URL = "https://lltcfjmshnhfmavlxpxr.supabase.co"
SERVICE_KEY = os.environ["SUPABASE_SERVICE_ROLE_KEY"]

BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DIAGRAMS_DIR = os.path.join(BASE_DIR, "data", "diagrams")

DRY_RUN = "--dry-run" in sys.argv
WORKERS = 10
TIMEOUT = 30
MAX_RETRIES = 2


def upload_one(local_path, storage_path):
    """Upload a single file with retries."""
    url = f"{SUPABASE_URL}/storage/v1/object/diagrams/{storage_path}"

    with open(local_path, "rb") as f:
        file_data = f.read()

    for attempt in range(MAX_RETRIES + 1):
        req = urllib.request.Request(url, data=file_data, method="POST", headers={
            "apikey": SERVICE_KEY,
            "Authorization": f"Bearer {SERVICE_KEY}",
            "Content-Type": "image/png",
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


def main():
    print("=" * 60)
    print("CLIP Tutor — Diagram Upload (parallel)")
    print(f"Workers: {WORKERS}, Timeout: {TIMEOUT}s, Retries: {MAX_RETRIES}")
    print("=" * 60)

    # Collect all PNGs
    files = []
    for paper_dir in sorted(os.listdir(DIAGRAMS_DIR)):
        full_dir = os.path.join(DIAGRAMS_DIR, paper_dir)
        if not os.path.isdir(full_dir):
            continue
        for fname in sorted(os.listdir(full_dir)):
            if fname.endswith(".png"):
                local = os.path.join(full_dir, fname)
                remote = f"{paper_dir}/{fname}"
                files.append((local, remote))

    total = len(files)
    folders = len(set(os.path.dirname(f[1]) for f in files))
    print(f"Found {total} PNGs in {folders} folders\n")

    if DRY_RUN:
        print(f"[DRY RUN] Would upload {total} files")
        return

    uploaded = 0
    failed = 0
    failed_files = []
    start = time.time()

    with ThreadPoolExecutor(max_workers=WORKERS) as pool:
        futures = {
            pool.submit(upload_one, local, remote): remote
            for local, remote in files
        }

        for i, future in enumerate(as_completed(futures), 1):
            path, ok, err = future.result()
            if ok:
                uploaded += 1
            else:
                failed += 1
                failed_files.append((path, err))

            if i % 50 == 0 or i == total:
                elapsed = time.time() - start
                rate = i / elapsed if elapsed > 0 else 0
                left = (total - i) / rate if rate > 0 else 0
                print(f"  {i}/{total} — {uploaded} ok, {failed} fail — {rate:.1f}/s, ~{left:.0f}s left")

    elapsed = time.time() - start
    print(f"\n{'=' * 60}")
    print(f"DONE in {elapsed:.0f}s: {uploaded} uploaded, {failed} failed")

    if failed_files:
        print(f"\nFailed ({len(failed_files)}):")
        for path, err in failed_files[:30]:
            print(f"  {path}: {err}")

    print(f"\nSample URLs:")
    for _, remote in files[:3]:
        print(f"  {SUPABASE_URL}/storage/v1/object/public/diagrams/{remote}")
    print("=" * 60)


if __name__ == "__main__":
    main()
