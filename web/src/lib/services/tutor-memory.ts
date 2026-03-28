import { supabaseAdmin } from "@/lib/supabase-server";
import { callOpenAI } from "@/lib/openai";
import type { TutorMemory, ChatMessage } from "@/lib/types";

// ── Load memories for a subject ────────────────────────────

export async function loadMemories(
  studentId: string,
  subjectCode: string,
  limit = 5,
): Promise<TutorMemory[]> {
  const { data, error } = await supabaseAdmin
    .from("tutor_memory")
    .select("*")
    .eq("student_id", studentId)
    .eq("subject_code", subjectCode)
    .order("created_at", { ascending: false })
    .limit(limit);

  if (error) throw error;
  return (data ?? []) as TutorMemory[];
}

// ── Save a memory after a block completes ──────────────────

export async function saveMemory(
  studentId: string,
  subjectCode: string,
  sessionId: string,
  summary: string,
  keyPoints: TutorMemory["key_points"],
): Promise<TutorMemory> {
  const { data, error } = await supabaseAdmin
    .from("tutor_memory")
    .insert({
      student_id: studentId,
      subject_code: subjectCode,
      session_id: sessionId,
      summary,
      key_points: keyPoints,
    })
    .select()
    .single();

  if (error) throw error;
  return data as TutorMemory;
}

// ── Progressive summarization ──────────────────────────────

/**
 * Merge new messages into the running summary.
 * Called when messages fall out of the sliding window (~every 10 messages).
 * Uses gpt-4o-mini to keep costs low (~$0.001 per call).
 */
export async function progressiveSummarize(
  existingSummary: string | null,
  messagesToSummarize: ChatMessage[],
): Promise<string> {
  const formatted = messagesToSummarize
    .map((m) => `${m.role}: ${m.content}`)
    .join("\n");

  const result = await callOpenAI({
    system:
      "Summarize this conversation chunk in 2-3 sentences. Focus on: what was explained, what the student struggled with, what she understood, any key moments. Be factual and concise.",
    user: existingSummary
      ? `Previous summary:\n${existingSummary}\n\nNew messages to incorporate:\n${formatted}`
      : `Messages to summarize:\n${formatted}`,
    maxTokens: 300,
    model: "gpt-4o-mini",
  });

  return result.trim();
}

// ── Generate block summary for tutor_memory ────────────────

/**
 * Generate a structured summary at the end of a study block.
 * Stored in tutor_memory for future session context.
 */
export async function generateBlockSummary(
  runningSummary: string | null,
  recentMessages: ChatMessage[],
): Promise<{ summary: string; key_points: TutorMemory["key_points"] }> {
  const formatted = recentMessages
    .map((m) => `${m.role}: ${m.content}`)
    .join("\n");

  const result = await callOpenAI({
    system: `Generate a memory summary of this tutoring block. Return JSON with this exact structure:
{
  "summary": "What was taught, what the student struggled with, what worked well, quiz results. Under 150 words.",
  "key_points": {
    "struggles": ["topic1", "topic2"],
    "wins": ["topic1", "topic2"],
    "effective_methods": ["diagrams", "real-world examples"],
    "mood_note": "Brief note about student engagement"
  }
}`,
    user: runningSummary
      ? `Running summary of full block:\n${runningSummary}\n\nRecent messages:\n${formatted}`
      : `Messages:\n${formatted}`,
    maxTokens: 500,
    jsonMode: true,
    model: "gpt-4o-mini",
  });

  try {
    const parsed = JSON.parse(result) as {
      summary: string;
      key_points: TutorMemory["key_points"];
    };
    return parsed;
  } catch {
    return {
      summary: runningSummary ?? "Block completed.",
      key_points: null,
    };
  }
}
