/**
 * Client-side stream parser for Chat Tutor responses (v2).
 *
 * The server streams:
 *   1. Pure text (tutor's message, token by token)
 *   2. <<<ACTION_JSON>>> delimiter
 *   3. Server-generated JSON: {"action": {...}, "internal": {...}}
 *
 * The JSON is ALWAYS server-generated (never LLM-generated), so parsing is reliable.
 */

import type { TutorAction, TutorInternal } from "@/lib/types";

export type StreamChunk =
  | { type: "text"; content: string }
  | { type: "action"; data: TutorAction }
  | { type: "internal"; data: TutorInternal }
  | { type: "error"; message: string };

const ACTION_JSON_DELIMITER = "<<<ACTION_JSON>>>";

/**
 * Consumes a streaming Response and yields parsed chunks.
 * Text streams live. Action JSON arrives at the end.
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
  let inJson = false;
  let jsonBuffer = "";

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });

      if (inJson) {
        // Accumulating JSON after delimiter
        jsonBuffer += buffer;
        buffer = "";
        continue;
      }

      // Check for delimiter
      const delimIdx = buffer.indexOf(ACTION_JSON_DELIMITER);
      if (delimIdx >= 0) {
        // Yield text before delimiter
        const textBefore = buffer.slice(0, delimIdx);
        if (textBefore.trim()) {
          yield { type: "text", content: textBefore };
        }
        // Switch to JSON accumulation
        jsonBuffer = buffer.slice(delimIdx + ACTION_JSON_DELIMITER.length);
        buffer = "";
        inJson = true;
      } else {
        // Safety: keep last 20 chars in case delimiter spans chunks
        const safeLen = Math.max(0, buffer.length - 20);
        if (safeLen > 0) {
          yield { type: "text", content: buffer.slice(0, safeLen) };
          buffer = buffer.slice(safeLen);
        }
      }
    }

    // Flush remaining text buffer
    if (!inJson && buffer.trim()) {
      yield { type: "text", content: buffer };
    }

    // Parse JSON
    const json = jsonBuffer.trim();
    if (json) {
      try {
        const parsed = JSON.parse(json) as {
          action?: TutorAction;
          internal?: TutorInternal;
        };
        if (parsed.action) yield { type: "action", data: parsed.action };
        if (parsed.internal) yield { type: "internal", data: parsed.internal };
      } catch {
        yield { type: "error", message: `Failed to parse action JSON: ${json.slice(0, 100)}` };
      }
    }
  } finally {
    reader.releaseLock();
  }
}
