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
