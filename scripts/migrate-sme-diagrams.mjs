/**
 * Migrate SaveMyExams diagram images from CDN to Supabase Storage.
 *
 * Steps:
 * 1. Collect all unique CDN URLs from SME JSON files
 * 2. Download images locally (physics already has them)
 * 3. Upload to Supabase Storage: diagrams/sme_{code}/{filename}.png
 * 4. Update exam_questions: set fig_refs to local filenames, clear diagram_urls
 *
 * Usage: node scripts/migrate-sme-diagrams.mjs [--dry-run] [--skip-download] [--skip-upload] [--skip-db]
 */

import { createClient } from "../web/node_modules/@supabase/supabase-js/dist/index.mjs";
import { readFileSync, writeFileSync, existsSync, mkdirSync, renameSync } from "fs";
import { resolve, dirname, basename, extname } from "path";
import { fileURLToPath } from "url";
import https from "https";
import http from "http";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "..");

const DRY_RUN = process.argv.includes("--dry-run");
const SKIP_DOWNLOAD = process.argv.includes("--skip-download");
const SKIP_UPLOAD = process.argv.includes("--skip-upload");
const SKIP_DB = process.argv.includes("--skip-db");

// ── Load env ────────────────────────────────────────────
const envFile = readFileSync(resolve(ROOT, "web", ".env.local"), "utf-8");
const getEnv = (key) => {
  const match = envFile.match(new RegExp(`^${key}=(.+)$`, "m"));
  return match?.[1]?.trim();
};

const SUPABASE_URL = getEnv("NEXT_PUBLIC_SUPABASE_URL");
const SUPABASE_KEY = getEnv("SUPABASE_SERVICE_ROLE_KEY");
const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

// ── Config ──────────────────────────────────────────────
const WORKERS = 10;
const MAX_RETRIES = 2;
const TIMEOUT_MS = 30_000;

const SME_FILES = {
  "0625": resolve(ROOT, "data/savemyexams/physics/sme_physics.json"),
  "0620": resolve(ROOT, "data/savemyexams/chemistry_sme.json"),
  "0610": resolve(ROOT, "data/savemyexams/biology_sme.json"),
  "0478": resolve(ROOT, "data/savemyexams/cs_sme.json"),
};

const IMAGE_DIRS = {
  "0625": resolve(ROOT, "data/savemyexams/physics/images"),
  "0620": resolve(ROOT, "data/savemyexams/chemistry/images"),
  "0610": resolve(ROOT, "data/savemyexams/biology/images"),
  "0478": resolve(ROOT, "data/savemyexams/cs/images"),
};

// ── Helpers ─────────────────────────────────────────────

/** Extract filename from CDN URL, sanitized for Supabase Storage */
function cdnFilename(url) {
  const raw = basename(new URL(url).pathname);
  // Replace ~ (invalid in Supabase keys) with -
  return raw.replace(/~/g, "-");
}

/** Extract all unique CDN URLs from an SME JSON file */
function extractUrls(filepath) {
  const data = JSON.parse(readFileSync(filepath, "utf-8"));
  const questions = data.questions || [];
  const urlMap = new Map(); // url -> Set<questionId>

  for (const q of questions) {
    const urls = new Set();
    // From images array
    if (q.images) {
      for (const img of q.images) {
        if (typeof img === "string" && img.startsWith("http")) urls.add(img);
      }
    }
    // From inline [IMG:url|ALT:text] in questionText
    for (const m of (q.questionText || "").matchAll(/\[IMG:(https?:\/\/[^||\]]+)/g)) {
      urls.add(m[1]);
    }
    // From answerText too
    for (const m of (q.answerText || "").matchAll(/\[IMG:(https?:\/\/[^||\]]+)/g)) {
      urls.add(m[1]);
    }

    for (const url of urls) {
      if (!urlMap.has(url)) urlMap.set(url, new Set());
      urlMap.get(url).add(q.id);
    }
  }

  return { urlMap, questions };
}

/** Build question→filenames mapping from SME JSON */
function buildQuestionImageMap(filepath) {
  const data = JSON.parse(readFileSync(filepath, "utf-8"));
  const questions = data.questions || [];
  const qMap = new Map(); // questionId -> [filenames]

  for (const q of questions) {
    const urls = [];
    if (q.images) {
      for (const img of q.images) {
        if (typeof img === "string" && img.startsWith("http")) urls.push(img);
      }
    }
    for (const m of (q.questionText || "").matchAll(/\[IMG:(https?:\/\/[^||\]]+)/g)) {
      urls.push(m[1]);
    }
    for (const m of (q.answerText || "").matchAll(/\[IMG:(https?:\/\/[^||\]]+)/g)) {
      urls.push(m[1]);
    }

    const unique = [...new Set(urls)];
    if (unique.length > 0) {
      qMap.set(q.id, unique.map((u) => cdnFilename(u)));
    }
  }

  return qMap;
}

/** Download a single file from URL */
function downloadFile(url, destPath) {
  return new Promise((resolve, reject) => {
    const proto = url.startsWith("https") ? https : http;
    const req = proto.get(url, { timeout: TIMEOUT_MS }, (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        downloadFile(res.headers.location, destPath).then(resolve).catch(reject);
        return;
      }
      if (res.statusCode !== 200) {
        res.resume();
        reject(new Error(`HTTP ${res.statusCode}`));
        return;
      }
      const chunks = [];
      res.on("data", (c) => chunks.push(c));
      res.on("end", () => {
        const buf = Buffer.concat(chunks);
        writeFileSync(destPath, buf);
        resolve(buf.length);
      });
      res.on("error", reject);
    });
    req.on("error", reject);
    req.on("timeout", () => { req.destroy(); reject(new Error("timeout")); });
  });
}

/** Upload a single file to Supabase Storage */
async function uploadOne(localPath, storagePath) {
  const fileData = readFileSync(localPath);
  const ext = extname(localPath).toLowerCase();
  const contentType = ext === ".png" ? "image/png"
    : ext === ".jpg" || ext === ".jpeg" ? "image/jpeg"
    : ext === ".gif" ? "image/gif"
    : ext === ".svg" ? "image/svg+xml"
    : "image/png";

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    try {
      const res = await fetch(`${SUPABASE_URL}/storage/v1/object/diagrams/${storagePath}`, {
        method: "POST",
        headers: {
          apikey: SUPABASE_KEY,
          Authorization: `Bearer ${SUPABASE_KEY}`,
          "Content-Type": contentType,
          "x-upsert": "true",
        },
        body: fileData,
      });
      if (res.ok) return { path: storagePath, ok: true };
      const text = await res.text();
      if (attempt < MAX_RETRIES) continue;
      return { path: storagePath, ok: false, error: `HTTP ${res.status}: ${text.slice(0, 100)}` };
    } catch (e) {
      if (attempt < MAX_RETRIES) continue;
      return { path: storagePath, ok: false, error: e.message?.slice(0, 100) };
    }
  }
}

/** Run tasks in parallel with concurrency limit */
async function parallel(tasks, concurrency) {
  const results = [];
  let idx = 0;

  async function worker() {
    while (idx < tasks.length) {
      const i = idx++;
      results[i] = await tasks[i]();
    }
  }

  await Promise.all(Array.from({ length: Math.min(concurrency, tasks.length) }, () => worker()));
  return results;
}

// ── Main ────────────────────────────────────────────────

async function main() {
  console.log("=".repeat(60));
  console.log("SME Diagram Migration → Supabase Storage");
  console.log(`Flags: dry=${DRY_RUN}, skipDl=${SKIP_DOWNLOAD}, skipUp=${SKIP_UPLOAD}, skipDb=${SKIP_DB}`);
  console.log("=".repeat(60));

  const allFailed = [];
  const stats = {};

  for (const [code, filepath] of Object.entries(SME_FILES)) {
    console.log(`\n📚 ${code}: ${basename(filepath)}`);
    const imageDir = IMAGE_DIRS[code];
    const paperId = `sme_${code}`;

    // Load existing image_map if any
    const mapPath = resolve(dirname(filepath), code === "0625" ? "image_map.json" : `${code}_image_map.json`);
    let imageMap = {};
    if (existsSync(mapPath)) {
      imageMap = JSON.parse(readFileSync(mapPath, "utf-8"));
      console.log(`  Loaded existing image_map: ${Object.keys(imageMap).length} entries`);
    }

    // Extract all unique CDN URLs
    const { urlMap } = extractUrls(filepath);
    const allUrls = [...urlMap.keys()];
    console.log(`  ${allUrls.length} unique CDN URLs across ${urlMap.size} images`);

    if (allUrls.length === 0) {
      stats[code] = { urls: 0, downloaded: 0, uploaded: 0, dbUpdated: 0 };
      continue;
    }

    // ── Step 1: Download ──────────────────────────
    if (!existsSync(imageDir)) mkdirSync(imageDir, { recursive: true });

    let downloaded = 0;
    let skipped = 0;
    let dlFailed = 0;

    if (!SKIP_DOWNLOAD) {
      console.log(`  Downloading to ${imageDir}...`);

      const dlTasks = allUrls.map((url) => async () => {
        const filename = cdnFilename(url);
        const dest = resolve(imageDir, filename);

        // Rename old file with ~ to sanitized name
        const rawName = basename(new URL(url).pathname);
        const oldPath = resolve(imageDir, rawName);
        if (!existsSync(dest) && existsSync(oldPath) && rawName !== filename) {
          renameSync(oldPath, dest);
        }

        // Skip if already downloaded
        if (existsSync(dest)) {
          imageMap[url] = filename;
          skipped++;
          return;
        }

        try {
          await downloadFile(url, dest);
          imageMap[url] = filename;
          downloaded++;
        } catch (e) {
          dlFailed++;
          allFailed.push({ code, url, error: e.message });
        }
      });

      if (DRY_RUN) {
        const existing = allUrls.filter((u) => existsSync(resolve(imageDir, cdnFilename(u)))).length;
        console.log(`  [DRY RUN] ${existing} exist, ${allUrls.length - existing} to download`);
      } else {
        await parallel(dlTasks, WORKERS);
        console.log(`  Downloaded: ${downloaded}, Skipped: ${skipped}, Failed: ${dlFailed}`);
      }
    } else {
      // Build imageMap from existing files (rename ~ files if needed)
      for (const url of allUrls) {
        const filename = cdnFilename(url);
        const dest = resolve(imageDir, filename);
        const rawName = basename(new URL(url).pathname);
        const oldPath = resolve(imageDir, rawName);
        if (!existsSync(dest) && existsSync(oldPath) && rawName !== filename) {
          renameSync(oldPath, dest);
        }
        if (existsSync(dest)) {
          imageMap[url] = filename;
        }
      }
      console.log(`  [SKIP DL] ${Object.keys(imageMap).length} files found locally`);
    }

    // Save image_map
    const saveMapPath = resolve(dirname(imageDir), `${code === "0625" ? "" : code + "_"}image_map.json`);
    if (!DRY_RUN) {
      writeFileSync(
        code === "0625" ? mapPath : resolve(dirname(filepath), `${code}_image_map.json`),
        JSON.stringify(imageMap, null, 2)
      );
    }

    // ── Step 2: Upload to Supabase ────────────────
    let uploaded = 0;
    let upFailed = 0;

    if (!SKIP_UPLOAD && !DRY_RUN) {
      console.log(`  Uploading to diagrams/${paperId}/...`);

      const uploadTasks = Object.values(imageMap).map((filename) => async () => {
        const localPath = resolve(imageDir, filename);
        if (!existsSync(localPath)) return;

        // Normalize filename for storage (lowercase extension)
        const storageName = filename.endsWith(".PNG") ? filename + ".png"
          : filename.endsWith(".JPG") ? filename + ".jpg"
          : filename;
        const storagePath = `${paperId}/${storageName}`;

        const result = await uploadOne(localPath, storagePath);
        if (result.ok) {
          uploaded++;
        } else {
          upFailed++;
          allFailed.push({ code, file: filename, error: result.error });
        }
      });

      await parallel(uploadTasks, WORKERS);
      console.log(`  Uploaded: ${uploaded}, Failed: ${upFailed}`);
    }

    // ── Step 3: Update DB fig_refs ────────────────
    let dbUpdated = 0;

    if (!SKIP_DB && !DRY_RUN) {
      console.log(`  Updating fig_refs in DB...`);

      const qMap = buildQuestionImageMap(filepath);
      const batches = [];
      let batch = [];

      for (const [qId, filenames] of qMap) {
        // Normalize filenames: strip extension for fig_ref (getDiagramUrl adds .png)
        const figRefs = filenames.map((f) => {
          // Remove .png/.PNG extension for the ref
          const noExt = f.replace(/\.(png|jpg|jpeg|gif|svg)$/i, "");
          return noExt;
        });

        batch.push({ id: qId, figRefs });
        if (batch.length >= 50) {
          batches.push(batch);
          batch = [];
        }
      }
      if (batch.length > 0) batches.push(batch);

      for (const b of batches) {
        const updates = b.map(({ id, figRefs }) =>
          supabase
            .from("exam_questions")
            .update({ fig_refs: figRefs })
            .eq("id", id)
            .select("id")
        );

        const results = await Promise.all(updates);
        for (const { data, error } of results) {
          if (data?.length) dbUpdated += data.length;
          if (error) console.log(`    DB error: ${error.message}`);
        }
      }

      console.log(`  DB updated: ${dbUpdated} questions`);
    }

    stats[code] = {
      urls: allUrls.length,
      downloaded: downloaded + skipped,
      uploaded,
      dbUpdated,
    };
  }

  // ── Summary ───────────────────────────────────────
  console.log("\n" + "=".repeat(60));
  console.log("SUMMARY");
  console.log("=".repeat(60));

  for (const [code, s] of Object.entries(stats)) {
    console.log(`  ${code}: ${s.urls} URLs, ${s.downloaded} local, ${s.uploaded} uploaded, ${s.dbUpdated} DB rows`);
  }

  if (allFailed.length > 0) {
    console.log(`\n⚠ Failures (${allFailed.length}):`);
    for (const f of allFailed.slice(0, 20)) {
      console.log(`  ${f.code} ${f.url || f.file}: ${f.error}`);
    }

    writeFileSync(
      resolve(ROOT, "data/savemyexams/failed_downloads.json"),
      JSON.stringify(allFailed, null, 2)
    );
    console.log(`  Full list → data/savemyexams/failed_downloads.json`);
  }

  console.log("\n" + "=".repeat(60));
  console.log("DONE");
  console.log("=".repeat(60));
}

main().catch((e) => {
  console.error("Fatal:", e);
  process.exit(1);
});
