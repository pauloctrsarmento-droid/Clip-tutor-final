import { OPENAI_MODEL } from "@/lib/constants";

/** A single part of a vision content array. */
export type VisionContentPart =
  | { type: "text"; text: string }
  | { type: "image_url"; image_url: { url: string; detail?: "low" | "high" | "auto" } };

interface CallOpenAIOptions {
  system: string;
  /** Plain text string OR a vision content array with text + image parts. */
  user: string | VisionContentPart[];
  maxTokens?: number;
  jsonMode?: boolean;
  model?: string;
}

interface OpenAIResponse {
  choices: Array<{
    message: {
      content: string | null;
    };
  }>;
}

/**
 * Reusable helper for calling the OpenAI Chat Completions API.
 * Supports both text-only and vision (image) calls.
 *
 * Text-only:  callOpenAI({ system, user: "evaluate this" })
 * Vision:     callOpenAI({ system, user: [{ type: "text", text: "..." }, { type: "image_url", image_url: { url, detail: "high" } }] })
 */
// ── Chat message type for multi-turn conversations ────────────

export interface ChatTurnMessage {
  role: "user" | "assistant";
  content: string | VisionContentPart[];
}

// ── Streaming call (for Chat Tutor) ──────────────────────────

interface CallOpenAIStreamOptions {
  system: string;
  /** Current user message — plain text or vision array. */
  user: string | VisionContentPart[];
  /** Prior conversation turns (sliding window). */
  messages?: ChatTurnMessage[];
  maxTokens?: number;
  model?: string;
}

/**
 * Streaming variant of callOpenAI.
 * Returns a ReadableStream of UTF-8 text chunks (SSE delta content).
 * The caller is responsible for piping this to the client.
 */
export async function callOpenAIStream(
  options: CallOpenAIStreamOptions,
): Promise<ReadableStream<Uint8Array>> {
  const {
    system,
    user,
    messages = [],
    maxTokens = 4096,
    model = OPENAI_MODEL,
  } = options;

  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    throw new Error("OPENAI_API_KEY not set");
  }

  // Build messages array: system + history + current user message
  const openaiMessages: Array<{ role: string; content: string | VisionContentPart[] }> = [
    { role: "system", content: system },
    ...messages,
    { role: "user", content: user },
  ];

  const response = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model,
      max_tokens: maxTokens,
      stream: true,
      messages: openaiMessages,
    }),
  });

  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`OpenAI API error ${response.status}: ${errText.slice(0, 300)}`);
  }

  if (!response.body) {
    throw new Error("OpenAI returned no response body");
  }

  const encoder = new TextEncoder();
  const decoder = new TextDecoder();

  // Transform the SSE stream into plain text chunks
  const transformStream = new TransformStream<Uint8Array, Uint8Array>({
    transform(chunk, controller) {
      const text = decoder.decode(chunk, { stream: true });
      const lines = text.split("\n");

      for (const line of lines) {
        if (!line.startsWith("data: ")) continue;
        const data = line.slice(6).trim();
        if (data === "[DONE]") return;

        try {
          const parsed = JSON.parse(data) as {
            choices: Array<{ delta: { content?: string } }>;
          };
          const content = parsed.choices[0]?.delta?.content;
          if (content) {
            controller.enqueue(encoder.encode(content));
          }
        } catch {
          // Skip malformed SSE lines
        }
      }
    },
  });

  return response.body.pipeThrough(transformStream);
}

// ── Non-streaming call (existing) ────────────────────────────

export async function callOpenAI(options: CallOpenAIOptions): Promise<string> {
  const {
    system,
    user,
    maxTokens = 4096,
    jsonMode = false,
    model = OPENAI_MODEL,
  } = options;

  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    throw new Error("OPENAI_API_KEY not set");
  }

  // user can be a plain string or a vision content array — both are valid OpenAI API formats
  const userContent: string | VisionContentPart[] = user;

  const body: Record<string, unknown> = {
    model,
    max_tokens: maxTokens,
    messages: [
      { role: "system", content: system },
      { role: "user", content: userContent },
    ],
  };

  if (jsonMode) {
    body.response_format = { type: "json_object" };
  }

  const response = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`OpenAI API error ${response.status}: ${errText.slice(0, 300)}`);
  }

  const result = (await response.json()) as OpenAIResponse;
  return result.choices[0]?.message?.content ?? "";
}
