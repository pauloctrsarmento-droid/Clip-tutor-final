/**
 * Cleans question text and parent context extracted from PDFs.
 *
 * The word-level PDF parser captures diagram labels, axis values,
 * "BLANK PAGE" markers, and other visual noise. This module strips
 * that noise so the quiz UI shows only the meaningful question text.
 */

/** Lines that are pure junk from the PDF */
const JUNK_LINES = [
  "BLANK PAGE",
  "[Turn over",
  "[Turn over]",
  "© UCLES",
];

/**
 * Returns true if a line is likely an axis tick value or short diagram label
 * that adds no meaning without the diagram image.
 *
 * Examples: "350", "0", "5.0", "0.30", "Fig. 3.1"
 */
function isAxisOrTickValue(line: string): boolean {
  const t = line.trim();
  if (!t) return true;

  // Pure number (integer or decimal, possibly negative)
  if (/^-?\d+(\.\d+)?$/.test(t)) return true;

  // "Fig. X.Y" standalone reference — keep only if it's a full sentence
  if (/^Fig\.\s?\d+\.\d+$/i.test(t)) return true;

  return false;
}

/**
 * Returns true if a line looks like a standalone diagram label
 * (very short, no verb, not a unit or meaningful phrase).
 *
 * Keeps lines that are units ("m / s"), short questions, or meaningful phrases.
 */
function isDiagramLabel(line: string): boolean {
  const t = line.trim();
  if (!t) return true;

  // Already caught by isAxisOrTickValue
  if (isAxisOrTickValue(t)) return true;

  // Very short single words that are likely diagram annotations
  // but NOT if they look like units or chemistry terms
  if (t.length <= 3 && /^[a-zA-Z]+$/.test(t)) {
    // Keep known units and meaningful short words
    const keepShort = new Set(["cm", "mm", "kg", "km", "Hz", "pH", "cm3", "dm3", "mol", "ohm", "and", "the", "for", "not", "its", "has", "are", "was", "his", "her", "but", "all", "can", "had", "one", "our", "out", "you", "may"]);
    if (!keepShort.has(t.toLowerCase())) return true;
  }

  return false;
}

/**
 * Returns true if a line is a "real sentence" — has a verb-like structure,
 * contains a period/question mark, or is long enough to be meaningful.
 */
function isSentenceLine(line: string): boolean {
  const t = line.trim();
  if (!t) return false;

  // Has sentence-ending punctuation
  if (/[.?!:]$/.test(t)) return true;

  // Contains common sentence patterns (articles, prepositions, verbs)
  if (/\b(the|a|an|is|are|was|has|of|in|on|at|for|by|with|from|to|and|that|which|when|where|this|each|its|their|if|as|or|be|it|not|you|all|can|will|may|also|than|into|between|through|during|after|before|about|what|how|calculate|determine|state|describe|explain|name|give|suggest|identify|define|compare|outline|predict|draw|label|complete|measure|find|show|write|use)\b/i.test(t)) return true;

  // Contains equals sign (formula placeholder like "F = ..." or "speed = ...")
  if (/=/.test(t)) return true;

  // Contains numbers with units BUT only if part of a longer phrase (not just "10 cm" standalone)
  if (t.length >= 15 && /\d+\.?\d*\s*(kg|m|s|N|J|W|V|A|Hz|Pa|cm|mm|km|g|mol|dm|ohm)\b/i.test(t)) return true;

  return false;
}

/**
 * Clean parent_context: remove axis values, diagram labels, and junk.
 *
 * Strategy: keep only lines that look like real sentences. Diagram labels
 * ("rectangular block", "atmosphere", "water", "30N", "Fig. 3.1") and
 * axis tick values ("350", "300", "250") are all short non-sentence fragments.
 */
export function cleanParentContext(context: string | null): string | null {
  if (!context) return null;

  const lines = context.split("\n");

  const kept = lines.filter((line) => {
    const t = line.trim();

    // Remove universal junk
    if (JUNK_LINES.some((j) => t.startsWith(j))) return false;

    // Keep empty lines (will be collapsed later)
    if (!t) return true;

    // Always remove standalone "Fig. X.Y" references (the diagram image shows this)
    if (/^Fig\.\s?\d+\.\d+$/i.test(t)) return false;

    // Always remove pure axis tick values
    if (isAxisOrTickValue(t)) return false;

    // Keep lines that look like real sentences
    if (isSentenceLine(t)) return true;

    // For remaining short lines: likely diagram labels — remove them
    // Real data never has standalone words like "car", "track", "atmosphere"
    // as meaningful context without being part of a sentence
    if (t.length < 20 && !isSentenceLine(t)) return false;

    return true;
  });

  let result = kept
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();

  // Remove mark scheme artifacts from parent context too
  result = result.replace(/\[Total\s*:\s*\d+\]/gi, "");
  result = result.replace(/\[\d+\]/g, "");
  result = result.replace(/\[PAUSE\]/gi, "");
  result = result.replace(/^\d+\s*\.{2,}\s*$/gm, "");
  result = result.trim();

  return result || null;
}

/**
 * Clean question_text: remove junk markers and artifacts.
 */
export function cleanQuestionText(text: string): string {
  let result = text;

  // Remove "BLANK PAGE" (sometimes at end of text)
  result = result.replace(/\s*BLANK PAGE\s*/g, "");

  // Remove "[Turn over" / "[Turn over]"
  result = result.replace(/\s*\[Turn over\]?\s*/g, "");

  // Remove mark scheme artifacts: [1], [2], [Total : 12], [PAUSE], etc.
  result = result.replace(/\[Total\s*:\s*\d+\]/gi, "");
  result = result.replace(/\[\d+\]/g, "");
  result = result.replace(/\[PAUSE\]/gi, "");

  // Remove answer space placeholders: "1 ... [1]" → "" or "1 ..." → ""
  result = result.replace(/^\d+\s*\.{2,}\s*$/gm, "");

  // Remove "(i)" "(ii)" sub-part markers that are orphaned
  result = result.replace(/^\s*\(i+\)\s*\.{2,}\s*$/gm, "");

  // Remove answer-line prompts from paper: "deduction ...", "explanation ...", "name ...", etc.
  // These are short lines (1-4 words) ending in "..." where students would write on paper.
  // Exclude lines that contain sentence structure (articles, prepositions) to keep real text.
  result = result.replace(/^[ \t]*[A-Za-z][\w\s]{0,40}\.{2,}\s*$/gm, (match) => {
    const trimmed = match.trim();
    // Keep if it looks like a real sentence fragment (has articles/prepositions/conjunctions)
    if (/\b(the|a|an|is|are|was|were|has|have|of|in|on|at|for|by|with|from|to|and|that|which|when|where|as|it|its|they|he|she|if)\b/i.test(trimmed)) {
      return match;
    }
    // Keep if it's very long (likely a real sentence with "..." as ellipsis)
    if (trimmed.length > 50) return match;
    // Remove short answer prompts like "deduction ...", "name ...", "colour ..."
    return "";
  });

  // Remove ", ," artifact (empty table cells from PDF)
  result = result.replace(/[,\s]*,\s*,\s*/g, "");

  // Remove trailing commas left over
  result = result.replace(/,\s*$/, "");

  // Remove "Exercice X Questions Y-Z" headers from other sections
  result = result.replace(/Exercice\s+\d+\s+Questions?\s+\d+.*/gi, "");

  // Remove standalone "Fig. X.Y" references (the diagram image is shown separately)
  result = result.replace(/^\s*Fig\.\s?\d+\.\d+\s*$/gm, "");

  // Remove diagram labels: short non-sentence lines that leaked from PDF figures.
  // Same logic as cleanParentContext — lines < 25 chars that aren't sentences.
  const lines = result.split("\n");
  const filtered = lines.filter((line) => {
    const t = line.trim();
    if (!t) return true; // keep blank lines (collapsed later)
    if (isAxisOrTickValue(t)) return false;
    if (t.length < 25 && !isSentenceLine(t) && !isDiagramLabel(t)) {
      // Additional check: keep if it looks like a sub-part label e.g. "(a)", "(b)(i)"
      if (/^\(/.test(t)) return true;
      return false;
    }
    if (isDiagramLabel(t)) return false;
    return true;
  });
  result = filtered.join("\n");

  // Clean up extra whitespace
  result = result.replace(/\n{3,}/g, "\n\n").trim();

  return result;
}

/**
 * Convert scientific notation patterns to superscript rendering.
 *
 * Handles:  "10–4" → "10⁻⁴"   "10−3" → "10⁻³"   "108" after "× " → "10⁸"
 *
 * Uses Unicode superscript characters so it works without KaTeX.
 */
const SUPERSCRIPT_MAP: Record<string, string> = {
  "0": "\u2070",
  "1": "\u00b9",
  "2": "\u00b2",
  "3": "\u00b3",
  "4": "\u2074",
  "5": "\u2075",
  "6": "\u2076",
  "7": "\u2077",
  "8": "\u2078",
  "9": "\u2079",
  "-": "\u207b",
  "+": "\u207a",
  "\u2013": "\u207b", // en-dash → superscript minus
  "\u2212": "\u207b", // minus sign → superscript minus
};

function toSuperscript(s: string): string {
  return s
    .split("")
    .map((c) => SUPERSCRIPT_MAP[c] ?? c)
    .join("");
}

export function formatScientificNotation(text: string): string {
  // "× 10–4" or "× 10−3" or "x 10-4" (with en-dash, minus sign, or hyphen after 10)
  // Captures: × 10<sign><digits>
  let result = text.replace(
    /([×x]\s*10)[\u2013\u2212-](\d+)/g,
    (_, prefix: string, exp: string) => `${prefix}${toSuperscript("-" + exp)}`
  );

  // "× 108" or "× 103" (positive exponent, only when preceded by × or x)
  result = result.replace(
    /([×x]\s*10)(\d{1,2})(?!\d)(?!\.\d)/g,
    (_, prefix: string, exp: string) => {
      // Only convert if exponent is reasonable (1-30) to avoid false positives
      const n = parseInt(exp, 10);
      if (n >= 1 && n <= 30) return `${prefix}${toSuperscript(exp)}`;
      return `${prefix}${exp}`;
    }
  );

  // Fix degree symbol: "45�" → "45°" (replacement char from PDF)
  result = result.replace(/(\d)\ufffd/g, "$1°");
  result = result.replace(/(\d)�/g, "$1°");

  return result;
}

/**
 * Full cleanup pipeline for question display.
 */
export function cleanForDisplay(
  questionText: string,
  parentContext: string | null
): { questionText: string; parentContext: string | null } {
  let qt = cleanQuestionText(questionText);
  qt = formatScientificNotation(qt);

  let ctx = cleanParentContext(parentContext);
  if (ctx) ctx = formatScientificNotation(ctx);

  return { questionText: qt, parentContext: ctx };
}
