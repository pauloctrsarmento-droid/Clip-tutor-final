/**
 * Client-side stream parser for Chat Tutor responses.
 *
 * The tutor responds with:
 *   visible message text
 *   <<<ACTION>>>
 *   {"type": "launch_quiz", "config": {...}}
 *   <<<INTERNAL>>>
 *   {"current_phase": "explanation", ...}
 *
 * This parser yields text chunks in real-time and emits
 * parsed action/internal objects once the delimiters arrive.
 */

import type { TutorAction, TutorInternal } from "@/lib/types";

// ── Chunk types emitted by the parser ──────────────────────

export type StreamChunk =
  | { type: "text"; content: string }
  | { type: "action"; data: TutorAction }
  | { type: "internal"; data: TutorInternal }
  | { type: "error"; message: string };

// ── JSON repair helper ─────────────────────────────────────

/**
 * Try to parse JSON, with fallback attempts to fix common LLM errors:
 * - Missing commas between keys
 * - Missing opening braces in nested objects
 * - Truncated JSON (close unclosed braces/brackets)
 */
function tryParseJson<T>(raw: string): T | null {
  // Attempt 1: direct parse
  try { return JSON.parse(raw) as T; } catch { /* continue */ }

  // Attempt 2: extract first complete JSON object from the string
  const firstBrace = raw.indexOf("{");
  if (firstBrace < 0) return null;

  let depth = 0;
  let inString = false;
  let escape = false;
  let lastBrace = -1;

  for (let i = firstBrace; i < raw.length; i++) {
    const ch = raw[i];
    if (escape) { escape = false; continue; }
    if (ch === "\\") { escape = true; continue; }
    if (ch === '"') { inString = !inString; continue; }
    if (inString) continue;
    if (ch === "{") depth++;
    if (ch === "}") { depth--; if (depth === 0) { lastBrace = i; break; } }
  }

  if (lastBrace > firstBrace) {
    try { return JSON.parse(raw.slice(firstBrace, lastBrace + 1)) as T; } catch { /* continue */ }
  }

  // Attempt 3: close unclosed braces
  let fixed = raw.slice(firstBrace);
  // Count open braces
  let openBraces = 0;
  let openBrackets = 0;
  inString = false;
  escape = false;
  for (const ch of fixed) {
    if (escape) { escape = false; continue; }
    if (ch === "\\") { escape = true; continue; }
    if (ch === '"') { inString = !inString; continue; }
    if (inString) continue;
    if (ch === "{") openBraces++;
    if (ch === "}") openBraces--;
    if (ch === "[") openBrackets++;
    if (ch === "]") openBrackets--;
  }
  // Close any trailing open string
  if (inString) fixed += '"';
  while (openBrackets > 0) { fixed += "]"; openBrackets--; }
  while (openBraces > 0) { fixed += "}"; openBraces--; }

  try { return JSON.parse(fixed) as T; } catch { return null; }
}

// ── Delimiters ─────────────────────────────────────────────

// Backend appends clean JSON after this delimiter (not LLM-generated)
const BACKEND_JSON_DELIMITER = "<<<ACTION_JSON>>>";

// Also match LLM-generated delimiters as fallback
const ACTION_PATTERNS = [BACKEND_JSON_DELIMITER, "<<<ACTION>>>", "<<<action>>>", "<<<Action>>>", "<<<>>>"];
const INTERNAL_PATTERNS = ["<<<INTERNAL>>>", "<<<internal>>>", "<<<Internal>>>"];

function findDelimiter(text: string, patterns: string[]): { index: number; length: number } | null {
  for (const pattern of patterns) {
    const idx = text.indexOf(pattern);
    if (idx >= 0) return { index: idx, length: pattern.length };
  }
  return null;
}

// ── Parser ─────────────────────────────────────────────────

/**
 * Consumes a streaming Response from /api/session/message
 * and yields parsed chunks as they arrive.
 *
 * Text before <<<ACTION>>> is yielded incrementally.
 * JSON after delimiters is buffered and yielded once complete.
 */
export async function* parseSessionStream(
  response: Response,
): AsyncGenerator<StreamChunk> {
  if (!response.body) {
    yield { type: "error", message: "No response body" };
    return;
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();

  let buffer = "";
  let mode: "text" | "action" | "internal" = "text";
  let actionBuffer = "";
  let internalBuffer = "";

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });

      // Process buffer looking for delimiters
      while (buffer.length > 0) {
        if (mode === "text") {
          const actionMatch = findDelimiter(buffer, ACTION_PATTERNS);
          const internalMatch = findDelimiter(buffer, INTERNAL_PATTERNS);

          // Find which delimiter comes first (if any)
          let nextMatch: { index: number; length: number } | null = null;
          let nextMode: "action" | "internal" = "action";

          if (actionMatch && (!internalMatch || actionMatch.index < internalMatch.index)) {
            nextMatch = actionMatch;
            nextMode = "action";
          } else if (internalMatch) {
            nextMatch = internalMatch;
            nextMode = "internal";
          }

          if (nextMatch) {
            // Yield text before the delimiter
            const textBefore = buffer.slice(0, nextMatch.index).trimEnd();
            if (textBefore) {
              yield { type: "text", content: textBefore };
            }
            buffer = buffer.slice(nextMatch.index + nextMatch.length);
            mode = nextMode;
          } else {
            // No delimiter found — but one might be partially at the end.
            // Keep last 20 chars as safety buffer for partial delimiter match.
            const safeLen = Math.max(0, buffer.length - 20);
            if (safeLen > 0) {
              yield { type: "text", content: buffer.slice(0, safeLen) };
              buffer = buffer.slice(safeLen);
            }
            break; // Wait for more data
          }
        } else if (mode === "action") {
          const internalMatch = findDelimiter(buffer, INTERNAL_PATTERNS);
          if (internalMatch) {
            actionBuffer += buffer.slice(0, internalMatch.index);
            buffer = buffer.slice(internalMatch.index + internalMatch.length);
            mode = "internal";
          } else {
            // Still accumulating action JSON
            actionBuffer += buffer;
            buffer = "";
            break;
          }
        } else {
          // mode === "internal" — accumulate until stream ends
          internalBuffer += buffer;
          buffer = "";
          break;
        }
      }
    }

    // Flush remaining buffer
    if (buffer.length > 0) {
      if (mode === "text") {
        yield { type: "text", content: buffer };
      } else if (mode === "action") {
        actionBuffer += buffer;
      } else {
        internalBuffer += buffer;
      }
    }

    // Parse action buffer — may be backend JSON (combined) or LLM-generated (separate)
    const actionJson = actionBuffer.trim();
    if (actionJson) {
      // Try as combined backend format: {"action": {...}, "internal": {...}}
      const combined = tryParseJson<{ action?: TutorAction; internal?: TutorInternal }>(actionJson);
      if (combined && (combined.action || combined.internal)) {
        if (combined.action) yield { type: "action", data: combined.action };
        if (combined.internal) yield { type: "internal", data: combined.internal };
      } else {
        // Try as standalone action
        const parsed = tryParseJson<TutorAction>(actionJson);
        if (parsed) {
          yield { type: "action", data: parsed };
        } else {
          yield { type: "error", message: `Failed to parse action: ${actionJson.slice(0, 100)}` };
        }
      }
    }

    // Parse and yield internal (from LLM-generated delimiter, if any)
    const internalJson = internalBuffer.trim();
    if (internalJson) {
      try {
        const data = JSON.parse(internalJson) as TutorInternal;
        yield { type: "internal", data };
      } catch {
        yield { type: "error", message: `Failed to parse internal: ${internalJson.slice(0, 100)}` };
      }
    }
  } finally {
    reader.releaseLock();
  }
}
