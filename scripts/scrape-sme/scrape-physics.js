/**
 * SaveMyExams Physics Scraper
 *
 * Scrapes all Physics exam questions from SaveMyExams including:
 * - Question text + marks + difficulty
 * - Diagram images (downloaded locally)
 * - Mark scheme / answers (via "View answer" dialog)
 * - Topic + sub-topic classification
 *
 * Usage: node scrape-physics.js
 * Requires: playwright installed (npx playwright install chromium)
 */

const { chromium } = require("playwright");
const fs = require("fs");
const path = require("path");
const https = require("https");
const http = require("http");

const BASE = "https://www.savemyexams.com";
const TOPICS = JSON.parse(fs.readFileSync(path.join(__dirname, "topics.json"), "utf-8"));
const OUT_DIR = path.join(__dirname, "..", "..", "data", "savemyexams", "physics");
const IMG_DIR = path.join(OUT_DIR, "images");

const QUESTION_TYPES = ["multiple-choice-questions", "theory-questions", "alternative-to-practical-questions"];
const DIFFICULTIES = ["Easy", "Medium", "Hard"];

// Rate limiting
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function downloadImage(url, filepath) {
  if (fs.existsSync(filepath)) return; // skip if already downloaded
  return new Promise((resolve, reject) => {
    const mod = url.startsWith("https") ? https : http;
    mod.get(url, { headers: { "User-Agent": "Mozilla/5.0" } }, (res) => {
      if (res.statusCode === 301 || res.statusCode === 302) {
        return downloadImage(res.headers.location, filepath).then(resolve).catch(reject);
      }
      if (res.statusCode !== 200) {
        resolve(); // skip failed downloads silently
        return;
      }
      const ws = fs.createWriteStream(filepath);
      res.pipe(ws);
      ws.on("finish", () => { ws.close(); resolve(); });
      ws.on("error", reject);
    }).on("error", reject);
  });
}

async function extractQuestionsFromPage(page) {
  return page.evaluate(() => {
    const results = [];
    const articles = document.querySelectorAll("article");

    articles.forEach((article) => {
      const parts = article.querySelectorAll(":scope > div");
      parts.forEach((part) => {
        // Skip teacher-only promo blocks and feedback blocks
        if (part.textContent?.includes("Teacher only") || part.textContent?.includes("Was this exam question helpful")) return;

        const headerDiv = part.querySelector(":scope > div:first-child");
        if (!headerDiv) return;

        // Extract label (1a, 1b, etc.)
        const allDivs = headerDiv.querySelectorAll("div");
        let label = "";
        let marks = 0;
        for (const d of allDivs) {
          const t = d.textContent?.trim() || "";
          if (/^\d+[a-z]?$/i.test(t)) label = t;
          const marksMatch = t.match(/(\d+)\s*marks?/);
          if (marksMatch) marks = parseInt(marksMatch[1]);
        }

        // Extract question content
        const contentDiv = headerDiv.querySelector(":scope > div:last-child");
        if (!contentDiv) return;

        const paragraphs = [];
        const images = [];

        contentDiv.querySelectorAll("p, h4").forEach((el) => {
          const text = el.textContent?.trim();
          if (text) paragraphs.push(text);
        });

        contentDiv.querySelectorAll("img").forEach((img) => {
          if (img.src && !img.src.includes("calculator") && !img.src.includes("sme-")) {
            images.push({ src: img.src, alt: img.alt || "" });
          }
        });

        // Extract MCQ options if present
        const options = [];
        part.querySelectorAll("li").forEach((li) => {
          const optText = li.textContent?.trim();
          if (optText) options.push(optText);
        });

        // Also check for MCQ buttons (A, B, C, D pattern)
        const mcqButtons = part.querySelectorAll("button");
        const mcqOptions = [];
        mcqButtons.forEach((btn) => {
          const t = btn.textContent?.trim();
          if (/^[ABCD]$/.test(t)) mcqOptions.push(t);
        });

        if (paragraphs.length === 0 && images.length === 0) return;

        results.push({
          label,
          marks,
          text: paragraphs,
          images,
          options: options.length > 0 ? options : mcqOptions.length > 0 ? mcqOptions : [],
          hasAnswer: !!part.querySelector('button'),
        });
      });
    });

    return results;
  });
}

async function extractAnswerForQuestion(page, questionIndex) {
  try {
    // Find all "View answer" buttons
    const buttons = await page.$$('button:has-text("View answer")');
    if (questionIndex >= buttons.length) return null;

    await buttons[questionIndex].click();
    await sleep(1000);

    // Extract from dialog
    const answer = await page.evaluate(() => {
      const dialog = document.querySelector('[role="dialog"], [class*="modal"]');
      if (!dialog) return null;

      const paragraphs = [];
      const images = [];

      dialog.querySelectorAll("p, li").forEach((el) => {
        const text = el.textContent?.trim();
        if (text) paragraphs.push(text);
      });

      dialog.querySelectorAll("img").forEach((img) => {
        if (img.src && !img.src.includes("calculator")) {
          images.push({ src: img.src, alt: img.alt || "" });
        }
      });

      return { text: paragraphs, images };
    });

    // Close dialog
    const closeBtn = await page.$('[role="dialog"] button:has-text("Close"), [role="dialog"] button[aria-label="Close"]');
    if (closeBtn) await closeBtn.click();
    await sleep(500);

    return answer;
  } catch {
    return null;
  }
}

async function scrapeTopic(page, topic, questionType, difficulty) {
  const url = `${BASE}${topic.basePath}${questionType}/`;
  console.log(`  → ${topic.topicName} / ${questionType} / ${difficulty}`);

  try {
    await page.goto(url, { waitUntil: "networkidle", timeout: 30000 });
  } catch {
    console.log(`    ⚠ Failed to load ${url}`);
    return [];
  }

  await sleep(2000);

  // Click difficulty tab
  try {
    const tab = await page.$(`[role="tab"]:has-text("${difficulty}")`);
    if (tab) {
      await tab.click();
      await sleep(1500);
    }
  } catch {
    // difficulty tab might not exist
  }

  // Navigate through all question pages
  const allQuestions = [];
  let pageNum = 1;
  const maxPages = 20;

  while (pageNum <= maxPages) {
    // Click page number if > 1
    if (pageNum > 1) {
      try {
        const pageBtn = await page.$(`button:has-text("${pageNum}")`);
        if (!pageBtn) break;
        await pageBtn.click();
        await sleep(1500);
      } catch {
        break;
      }
    }

    const questions = await extractQuestionsFromPage(page);
    if (questions.length === 0) break;

    // Extract answers for each question
    for (let i = 0; i < questions.length; i++) {
      const answer = await extractAnswerForQuestion(page, i);
      questions[i].answer = answer;
      questions[i].difficulty = difficulty;
      questions[i].questionType = questionType.replace(/-/g, "_");
      questions[i].topic = topic.topicName;
      questions[i].chapter = topic.chapter;
      questions[i].subtopics = topic.subtopics;
    }

    allQuestions.push(...questions);
    console.log(`    Page ${pageNum}: ${questions.length} questions`);

    // Check if there are more pages
    const nextPageExists = await page.$(`button:has-text("${pageNum + 1}")`);
    if (!nextPageExists) break;

    pageNum++;
  }

  return allQuestions;
}

async function main() {
  // Setup
  fs.mkdirSync(OUT_DIR, { recursive: true });
  fs.mkdirSync(IMG_DIR, { recursive: true });

  const authStatePath = path.join(__dirname, "auth-state.json");
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    storageState: fs.existsSync(authStatePath) ? authStatePath : undefined,
    userAgent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
  });
  const page = await context.newPage();

  // Verify auth works
  console.log("Checking auth...");
  await page.goto(`${BASE}/members/`, { waitUntil: "networkidle", timeout: 30000 });
  await sleep(2000);
  const isLoggedIn = await page.$('text="Hi, Paulo"');
  if (!isLoggedIn) {
    console.log("⚠ Auth expired! Run with --login flag to authenticate manually.");
    console.log("   node scrape-physics.js --login");
    if (process.argv.includes("--login")) {
      await browser.close();
      const browser2 = await chromium.launch({ headless: false });
      const ctx2 = await browser2.newContext();
      const p2 = await ctx2.newPage();
      await p2.goto(`${BASE}/members/`);
      console.log("   Please log in manually. Press Enter when done...");
      await new Promise((r) => process.stdin.once("data", r));
      await ctx2.storageState({ path: authStatePath });
      console.log("   Auth saved! Restart without --login.");
      await browser2.close();
      return;
    }
    await browser.close();
    return;
  }
  console.log("✅ Authenticated as Paulo Sarmento");

  console.log("Starting scrape...");

  const allData = {
    subject: "Physics",
    subjectCode: "0625",
    source: "SaveMyExams",
    scrapedAt: new Date().toISOString(),
    topics: [],
    questions: [],
  };

  for (const topic of TOPICS) {
    console.log(`\n📚 ${topic.chapter} > ${topic.topicName}`);

    for (const qType of QUESTION_TYPES) {
      for (const diff of DIFFICULTIES) {
        const questions = await scrapeTopic(page, topic, qType, diff);
        // questions already pushed below via allData.questions

        // Download images
        for (const q of questions) {
          for (const img of q.images) {
            const imgName = img.alt || `img_${Date.now()}`;
            const ext = img.src.includes(".png") ? ".png" : ".webp";
            const filename = imgName.replace(/[^a-zA-Z0-9_-]/g, "_") + ext;
            const filepath = path.join(IMG_DIR, filename);

            await downloadImage(img.src, filepath);
            img.localPath = `images/${filename}`;
          }

          if (q.answer) {
            for (const img of q.answer.images || []) {
              const imgName = img.alt || `ans_${Date.now()}`;
              const ext = img.src.includes(".png") ? ".png" : ".webp";
              const filename = imgName.replace(/[^a-zA-Z0-9_-]/g, "_") + ext;
              const filepath = path.join(IMG_DIR, filename);

              await downloadImage(img.src, filepath);
              img.localPath = `images/${filename}`;
            }
          }
        }

        allData.questions.push(...questions);
        await sleep(1000); // Rate limit between pages
      }
    }

    allData.topics.push({
      chapter: topic.chapter,
      name: topic.topicName,
      subtopics: topic.subtopics,
    });
  }

  // Save
  const outPath = path.join(OUT_DIR, "physics_savemyexams.json");
  fs.writeFileSync(outPath, JSON.stringify(allData, null, 2), "utf-8");

  console.log(`\n✅ Done! ${allData.questions.length} questions scraped.`);
  console.log(`   Saved to: ${outPath}`);
  console.log(`   Images in: ${IMG_DIR}`);

  // Stats
  const byDifficulty = {};
  const byType = {};
  allData.questions.forEach((q) => {
    byDifficulty[q.difficulty] = (byDifficulty[q.difficulty] || 0) + 1;
    byType[q.questionType] = (byType[q.questionType] || 0) + 1;
  });
  console.log("\n📊 Stats:");
  console.log("  By difficulty:", byDifficulty);
  console.log("  By type:", byType);

  await browser.close();
}

main().catch(console.error);
