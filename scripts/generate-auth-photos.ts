/**
 * One-time script to generate auth/landing page photography via DALL-E 3.
 *
 * Usage:
 *   OPENAI_API_KEY=... npx tsx scripts/generate-auth-photos.ts
 *   OPENAI_API_KEY=... npx tsx scripts/generate-auth-photos.ts hero.jpg
 *
 * Pass a filename as an argument to regenerate only that one photo.
 * Total cost: ~$0.60 for all 6 HD photos.
 */

import { writeFile, mkdir } from "node:fs/promises";
import { join } from "node:path";

interface PhotoSpec {
  file: string;
  size: "1024x1024" | "1792x1024" | "1024x1792";
  prompt: string;
}

const PROMPTS: PhotoSpec[] = [
  {
    file: "hero.jpg",
    size: "1792x1024",
    prompt:
      "Editorial photograph of a 16-year-old student studying at a wooden desk by a large window, late afternoon golden hour light streaming in, open textbook and handwritten notes, warm terracotta and cream color palette, shallow depth of field, shot on Fujifilm X-T4 with 35mm lens, subtle film grain, candid documentary style, authentic teenage bedroom, natural pose, not staged, cinematic color grading",
  },
  {
    file: "feature-practice.jpg",
    size: "1024x1024",
    prompt:
      "Close-up editorial photo of hands writing mathematical equations in a leather-bound notebook with a fountain pen, warm brass desk lamp glow, wooden table surface, blurred books in background, terracotta and cream tones, 50mm lens shallow depth of field, cinematic film grain, authentic study moment, overhead angle",
  },
  {
    file: "feature-repetition.jpg",
    size: "1024x1024",
    prompt:
      "Editorial photograph of handmade paper flashcards spread across a cream linen surface, warm morning light from the left, soft shadows, one card held in a hand at the edge of frame, minimal composition, terracotta accents on the cards, shot on film, photojournalism style, shallow depth of field",
  },
  {
    file: "feature-papers.jpg",
    size: "1024x1024",
    prompt:
      "Editorial photo of stacked Cambridge exam papers on a wooden desk next to a cup of tea in a ceramic mug, vintage brass desk lamp glowing, warm golden hour light, shallow depth of field, authentic study environment, cinematic color grading, terracotta and cream palette",
  },
  {
    file: "school.jpg",
    size: "1792x1024",
    prompt:
      "Editorial wide-angle photograph of a historic European international school library interior, warm afternoon light streaming through tall arched windows, dark wooden bookshelves filled with books, a few students reading at long wooden tables, Porto Portugal architecture feel, cinematic warm tones, candid photojournalism, film grain, shallow depth of field on foreground",
  },
  {
    file: "auth-bg.jpg",
    size: "1024x1792",
    prompt:
      "Editorial vertical photograph of an open leather-bound book on a cream linen tablecloth with dried lavender flowers and a porcelain cup of coffee, warm golden window light from the right, shallow depth of field, terracotta and cream color palette, minimalist composition, film photography aesthetic, shot on medium format",
  },
];

const OUT_DIR = join(process.cwd(), "web/public/auth");

async function generateOne(prompt: string, size: string): Promise<string> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error("OPENAI_API_KEY is not set");

  const res = await fetch("https://api.openai.com/v1/images/generations", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: "dall-e-3",
      prompt,
      size,
      quality: "hd",
      n: 1,
    }),
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`DALL-E error ${res.status}: ${errText.slice(0, 300)}`);
  }

  const json = (await res.json()) as { data: { url: string }[] };
  return json.data[0].url;
}

async function main() {
  const filter = process.argv[2]; // optional filename to regenerate only one
  const toGenerate = filter
    ? PROMPTS.filter((p) => p.file === filter)
    : PROMPTS;

  if (toGenerate.length === 0) {
    console.error(`No photo matches "${filter}". Available:`);
    PROMPTS.forEach((p) => console.error(`  - ${p.file}`));
    process.exit(1);
  }

  await mkdir(OUT_DIR, { recursive: true });
  console.log(`Generating ${toGenerate.length} photo(s) to ${OUT_DIR}\n`);

  for (const { file, size, prompt } of toGenerate) {
    console.log(`→ ${file} (${size})`);
    try {
      const url = await generateOne(prompt, size);
      const imgRes = await fetch(url);
      if (!imgRes.ok) throw new Error(`Download failed: ${imgRes.status}`);
      const buf = Buffer.from(await imgRes.arrayBuffer());
      await writeFile(join(OUT_DIR, file), buf);
      console.log(`  ✓ saved ${file} (${(buf.length / 1024).toFixed(0)} KB)`);
    } catch (err) {
      console.error(`  ✗ ${file}: ${err instanceof Error ? err.message : err}`);
    }
  }

  const costPerSquare = 0.08;
  const costPerWide = 0.12;
  const squares = toGenerate.filter((p) => p.size === "1024x1024").length;
  const wides = toGenerate.length - squares;
  const totalCost = squares * costPerSquare + wides * costPerWide;
  console.log(`\nDone. Estimated cost: $${totalCost.toFixed(2)}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
