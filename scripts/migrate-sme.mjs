/**
 * Migrate SaveMyExams questions into Supabase exam_questions table.
 *
 * Steps:
 * 1. Add difficulty + source columns (run SQL manually first)
 * 2. Deactivate old questions for SME subjects
 * 3. Create virtual paper entries for SME data
 * 4. Transform & insert SME questions
 *
 * Usage: node scripts/migrate-sme.mjs
 * Prereq: Run the ALTER TABLE SQL in Supabase SQL Editor first
 */

import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "..");

// ── Load env ────────────────────────────────────────────
const envFile = readFileSync(resolve(ROOT, "web", ".env.local"), "utf-8");
const getEnv = (key) => {
  const match = envFile.match(new RegExp(`^${key}=(.+)$`, "m"));
  return match?.[1]?.trim();
};

const SUPABASE_URL = getEnv("NEXT_PUBLIC_SUPABASE_URL");
const SUPABASE_KEY = getEnv("SUPABASE_SERVICE_ROLE_KEY");

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

// ── SME data files ──────────────────────────────────────
const SME_FILES = {
  "0625": resolve(ROOT, "data/savemyexams/physics/sme_physics.json"),
  "0620": resolve(ROOT, "data/savemyexams/chemistry_sme.json"),
  "0610": resolve(ROOT, "data/savemyexams/biology_sme.json"),
  "0478": resolve(ROOT, "data/savemyexams/cs_sme.json"),
  "0475": resolve(ROOT, "data/savemyexams/eng_lit_sme.json"),
};

// ── Helpers ─────────────────────────────────────────────
function cleanQuestionText(text) {
  if (!text) return "";
  // Remove [IMG:...|ALT:...] tags
  let cleaned = text.replace(/\[IMG:[^\]]+\]/g, "");
  // Remove [TABLE]
  cleaned = cleaned.replace(/\[TABLE[^\]]*\]/g, "");
  // Clean whitespace
  cleaned = cleaned.replace(/\n{3,}/g, "\n\n").trim();
  return cleaned;
}

function extractImageUrls(text, images) {
  const urls = [];
  // From [IMG:url|ALT:text] in text
  for (const match of (text || "").matchAll(/\[IMG:(https?:\/\/[^|]+)/g)) {
    urls.push(match[1]);
  }
  // From explicit images array
  if (images) {
    for (const img of images) {
      if (typeof img === "string" && img.startsWith("http")) urls.push(img);
    }
  }
  // Deduplicate
  return [...new Set(urls)];
}

function extractCorrectAnswer(answerText, correctChoice) {
  if (correctChoice) return correctChoice;
  if (!answerText) return null;
  const match = answerText.match(/correct answer is\s*[:\s]*([A-D])/i);
  return match ? match[1] : null;
}

// ── Step 1: Deactivate old questions ────────────────────
async function deactivateOld(subjectCodes) {
  console.log("\n📦 Step 1: Deactivating old questions...");

  for (const code of subjectCodes) {
    const { data, error } = await supabase
      .from("exam_questions")
      .update({ evaluation_ready: false })
      .eq("subject_code", code)
      .neq("source", "sme")
      .select("id");

    if (error) {
      // source column might not exist yet - try without filter
      const { data: d2 } = await supabase
        .from("exam_questions")
        .update({ evaluation_ready: false })
        .eq("subject_code", code)
        .select("id");
      console.log(`  ${code}: ${d2?.length || 0} deactivated (no source filter)`);
    } else {
      console.log(`  ${code}: ${data?.length || 0} deactivated`);
    }
  }
}

// ── Step 2: Ensure virtual papers ───────────────────────
async function ensurePaper(subjectCode) {
  const paperId = `sme_${subjectCode}`;
  await supabase.from("exam_papers").upsert({
    id: paperId,
    subject_code: subjectCode,
    session: "sme",
    variant: "00",
    year: 2025,
    total_questions: 0,
    total_marks: 0,
  });
  return paperId;
}

// ── Step 3: Load topic mapping ──────────────────────────
async function loadTopicMap(subjectCode) {
  const { data } = await supabase
    .from("syllabus_topics")
    .select("id, topic_code, name")
    .eq("subject_code", subjectCode);

  const map = {};
  for (const t of data || []) {
    map[t.name.toLowerCase()] = t.id;
    if (t.topic_code) map[t.topic_code.toLowerCase()] = t.id;
  }
  return map;
}

function findBestTopic(smeTopic, topicMap) {
  if (!smeTopic) return null;
  const lower = smeTopic.toLowerCase();
  if (topicMap[lower]) return topicMap[lower];

  // Fuzzy: most word overlap
  const words = new Set(lower.split(/\s+/));
  let best = null;
  let bestScore = 0;
  for (const [key, id] of Object.entries(topicMap)) {
    const keyWords = new Set(key.split(/\s+/));
    let overlap = 0;
    for (const w of words) if (keyWords.has(w)) overlap++;
    if (overlap > bestScore) {
      bestScore = overlap;
      best = id;
    }
  }
  return bestScore >= 2 ? best : null;
}

// ── Step 4: Transform & insert ──────────────────────────
function transformQuestion(q, paperId, subjectCode, topicId, idx) {
  const questionText = q.questionText || "";
  const answerText = q.answerText || "";

  const allImages = extractImageUrls(questionText + "\n" + answerText, q.images);
  const cleanText = cleanQuestionText(questionText);

  // Response type
  let responseType = "text";
  const smeType = q.type || q.questionType || "";
  if (smeType.includes("multiple_choice") || q.questionType === "multiple_choice") {
    responseType = "mcq";
  } else if (/\bcalculat/i.test(cleanText)) {
    responseType = "numeric";
  }

  // MCQ: build mark_scheme with options
  let correctAnswer = null;
  let markScheme = answerText;

  if (responseType === "mcq" && q.choices?.length) {
    const optLines = q.choices.map((c, i) => {
      const letter = String.fromCharCode(65 + i);
      const text = typeof c === "object" ? (c.text || "") : String(c);
      return `${letter}: ${text}`;
    });
    correctAnswer = q.correctChoice || extractCorrectAnswer(answerText);
    markScheme = optLines.join("\n") + "\n\n" + answerText;
  }

  const qId = q.id || `sme_${subjectCode}_${idx}`;

  return {
    id: qId,
    paper_id: paperId,
    subject_code: subjectCode,
    syllabus_topic_id: topicId,
    question_number: idx + 1,
    part_label: null,
    group_id: q.qId || null,
    question_text: cleanText,
    parent_context: null,
    marks: q.marks || 1,
    correct_answer: correctAnswer,
    mark_scheme: markScheme,
    mark_points: [],
    question_type: "short",
    response_type: responseType,
    has_diagram: allImages.length > 0,
    fig_refs: [],
    table_refs: [],
    evaluation_ready: true,
    is_stem: false,
    part_order: 0,
    sibling_count: 1,
    // New fields (may fail if columns don't exist yet)
    difficulty: q.difficulty || "medium",
    source: "sme",
    source_id: q.id || null,
    diagram_urls: allImages,
  };
}

async function ingestSubject(subjectCode, filepath) {
  console.log(`\n📚 Ingesting ${subjectCode}...`);

  let data;
  try {
    data = JSON.parse(readFileSync(filepath, "utf-8"));
  } catch (e) {
    console.log(`  ⚠ Cannot read ${filepath}`);
    return 0;
  }

  const questions = data.questions || [];
  console.log(`  Found ${questions.length} question parts`);

  const paperId = await ensurePaper(subjectCode);
  const topicMap = await loadTopicMap(subjectCode);
  console.log(`  Topic mappings: ${Object.keys(topicMap).length}`);

  // Transform
  const rows = [];
  let skipped = 0;
  for (let i = 0; i < questions.length; i++) {
    const q = questions[i];
    if (!q.questionText?.trim()) { skipped++; continue; }

    const topicId = findBestTopic(q.topic, topicMap);
    const row = transformQuestion(q, paperId, subjectCode, topicId, i);
    rows.push(row);
  }

  console.log(`  Transformed ${rows.length} (skipped ${skipped} empty)`);

  // Insert in batches
  const BATCH = 100;
  let inserted = 0;
  for (let i = 0; i < rows.length; i += BATCH) {
    const batch = rows.slice(i, i + BATCH);

    // Try with new columns first
    let { error } = await supabase.from("exam_questions").upsert(batch);

    if (error && error.message?.includes("difficulty")) {
      // Columns don't exist yet - strip new fields
      console.log("  ⚠ New columns not found, inserting without difficulty/source...");
      const stripped = batch.map(({ difficulty, source, source_id, diagram_urls, ...rest }) => rest);
      const res = await supabase.from("exam_questions").upsert(stripped);
      error = res.error;
    }

    if (error) {
      console.log(`  ⚠ Batch ${Math.floor(i / BATCH) + 1} error: ${error.message?.substring(0, 100)}`);
      // Try one by one
      for (const row of batch) {
        const { error: e2 } = await supabase.from("exam_questions").upsert(row);
        if (!e2) inserted++;
        else {
          // Strip new fields and retry
          const { difficulty, source, source_id, diagram_urls, ...rest } = row;
          const { error: e3 } = await supabase.from("exam_questions").upsert(rest);
          if (!e3) inserted++;
          else console.log(`    ✗ ${row.id}: ${e3.message?.substring(0, 60)}`);
        }
      }
    } else {
      inserted += batch.length;
    }

    if ((i + BATCH) % 500 === 0 || i + BATCH >= rows.length) {
      console.log(`  Progress: ${Math.min(inserted, rows.length)}/${rows.length}`);
    }
  }

  // Update paper total
  await supabase.from("exam_papers").update({
    total_questions: inserted,
    total_marks: rows.reduce((sum, r) => sum + (r.marks || 1), 0),
  }).eq("id", paperId);

  console.log(`  ✅ ${inserted}/${rows.length} inserted for ${subjectCode}`);
  return inserted;
}

// ── Main ────────────────────────────────────────────────
async function main() {
  console.log("=".repeat(60));
  console.log("SaveMyExams → Supabase Migration");
  console.log("=".repeat(60));

  // Test connection
  const { count } = await supabase.from("exam_questions").select("id", { count: "exact", head: true });
  console.log(`\nConnected! Current questions in DB: ${count}`);

  const subjectCodes = Object.keys(SME_FILES);

  // Deactivate old
  await deactivateOld(subjectCodes);

  // Ingest each subject
  let total = 0;
  for (const [code, filepath] of Object.entries(SME_FILES)) {
    const n = await ingestSubject(code, filepath);
    total += n;
  }

  console.log(`\n${"=".repeat(60)}`);
  console.log(`✅ Migration complete! ${total} questions inserted.`);
  console.log("=".repeat(60));

  // Verify
  console.log("\nVerification:");
  for (const code of subjectCodes) {
    const { count: c } = await supabase
      .from("exam_questions")
      .select("id", { count: "exact", head: true })
      .eq("subject_code", code)
      .eq("evaluation_ready", true);
    console.log(`  ${code}: ${c} active questions`);
  }
}

main().catch(console.error);
