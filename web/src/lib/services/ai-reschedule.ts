import { supabaseAdmin } from "@/lib/supabase-server";
import { STUDENT_ID } from "@/lib/constants";
import { callOpenAI } from "@/lib/openai";
import { getPrompt } from "@/lib/services/prompts";
import type { RescheduleProposal } from "@/lib/types";

/**
 * Generate an AI-powered reschedule proposal.
 * Calls OpenAI API with current plan state, mastery data, and exam dates.
 * Returns a proposal (NOT applied) for user review.
 */
export async function generateRescheduleProposal(options: {
  reason: string;
  availableHoursPerDay?: number;
  studentId?: string;
}): Promise<RescheduleProposal> {
  const {
    reason,
    availableHoursPerDay = 6,
    studentId = STUDENT_ID,
  } = options;

  // 1. Fetch pending/skipped plan entries
  const { data: pendingEntries } = await supabaseAdmin
    .from("study_plan_entries")
    .select("*")
    .eq("student_id", studentId)
    .in("status", ["pending", "skipped"])
    .order("plan_date", { ascending: true });

  // 2. Fetch exam calendar
  const { data: exams } = await supabaseAdmin
    .from("exam_calendar")
    .select("*")
    .eq("student_id", studentId)
    .order("exam_date", { ascending: true });

  // 3. Fetch topic mastery
  const { data: topicMastery } = await supabaseAdmin
    .from("student_topic_mastery")
    .select(`
      syllabus_topic_id,
      total_marks_earned,
      total_marks_available,
      questions_attempted,
      syllabus_topics!inner(topic_name, topic_code, subjects!inner(code))
    `)
    .eq("student_id", studentId);

  // 4. Fetch fact mastery summary per subject
  const { data: factMastery } = await supabaseAdmin
    .from("student_fact_mastery")
    .select("fact_id, mastery_score")
    .eq("student_id", studentId);

  // Build mastery summary
  const masteryByTopic = new Map<string, { earned: number; available: number; name: string }>();
  for (const row of topicMastery ?? []) {
    const topic = row.syllabus_topics as unknown as {
      topic_name: string;
      topic_code: string;
      subjects: { code: string };
    };
    masteryByTopic.set(topic.topic_code, {
      earned: row.total_marks_earned as number,
      available: row.total_marks_available as number,
      name: topic.topic_name,
    });
  }

  const today = new Date().toISOString().split("T")[0];

  // 5. Pull system prompt from DB
  const systemPrompt = await getPrompt("ai_rescheduler");

  // 6. Build user message with context
  const user = buildRescheduleUserMessage({
    reason,
    availableHoursPerDay,
    today,
    pendingEntries: pendingEntries ?? [],
    exams: exams ?? [],
    masteryByTopic,
  });

  // 7. Call OpenAI API
  const text = await callOpenAI({ system: systemPrompt, user, jsonMode: true });

  // 7. Parse JSON from response
  const jsonMatch = text.match(/\{[\s\S]*\}/);
  if (!jsonMatch) {
    return {
      entries: [],
      reasoning: text,
    };
  }

  try {
    const parsed = JSON.parse(jsonMatch[0]) as RescheduleProposal;
    return parsed;
  } catch {
    return {
      entries: [],
      reasoning: `Failed to parse AI response as JSON. Raw response:\n${text}`,
    };
  }
}

function buildRescheduleUserMessage(ctx: {
  reason: string;
  availableHoursPerDay: number;
  today: string;
  pendingEntries: Array<Record<string, unknown>>;
  exams: Array<Record<string, unknown>>;
  masteryByTopic: Map<string, { earned: number; available: number; name: string }>;
}): string {
  const examList = ctx.exams
    .map((e) => `  ${e.exam_date} ${e.subject_code} ${e.paper_name}`)
    .join("\n");

  const pendingByDate = new Map<string, Array<Record<string, unknown>>>();
  for (const entry of ctx.pendingEntries) {
    const date = entry.plan_date as string;
    const existing = pendingByDate.get(date) ?? [];
    existing.push(entry);
    pendingByDate.set(date, existing);
  }

  const pendingSummary = Array.from(pendingByDate.entries())
    .slice(0, 30)
    .map(([date, entries]) => {
      const blocks = entries
        .map((e) => `    ${e.subject_code} "${e.title}" (${e.planned_hours}h) [${e.study_type}]`)
        .join("\n");
      return `  ${date}:\n${blocks}`;
    })
    .join("\n");

  const masteryList = Array.from(ctx.masteryByTopic.entries())
    .map(([code, m]) => {
      const pct = m.available > 0 ? Math.round((m.earned / m.available) * 100) : 0;
      return `  ${code} ${m.name}: ${pct}%`;
    })
    .join("\n");

  return `TODAY: ${ctx.today}
REASON FOR RESCHEDULE: ${ctx.reason}
AVAILABLE HOURS PER DAY: ${ctx.availableHoursPerDay}

EXAM CALENDAR (FIXED — cannot be moved):
${examList}

PENDING STUDY BLOCKS (need to be rescheduled):
${pendingSummary || "  (no pending entries)"}

TOPIC MASTERY (from quizzes so far):
${masteryList || "  (no mastery data yet)"}`;
}
