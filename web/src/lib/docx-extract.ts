import mammoth from "mammoth";

/**
 * Extracts plain text from a .docx buffer using mammoth.
 * Falls back to error message on failure rather than crashing the chat.
 */
export async function extractDocxText(buffer: Buffer): Promise<string> {
  try {
    const result = await mammoth.extractRawText({ buffer });
    return result.value.trim();
  } catch {
    return "[Could not extract text from this document]";
  }
}
