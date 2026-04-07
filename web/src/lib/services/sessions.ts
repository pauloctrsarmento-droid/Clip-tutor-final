import { supabaseAdmin } from "@/lib/supabase-server";
import type { CreateSessionInput } from "@/lib/validators/session";
import type { StudySession } from "@/lib/types";

export async function createSession(
  input: CreateSessionInput,
  studentId: string
): Promise<StudySession> {
  const { data, error } = await supabaseAdmin
    .from("study_sessions")
    .insert({
      student_id: studentId,
      session_type: input.session_type,
      subject_code: input.subject_code ?? null,
      syllabus_topic_id: input.syllabus_topic_id ?? null,
    })
    .select()
    .single();

  if (error) throw error;
  return data as StudySession;
}

export async function endSession(sessionId: string): Promise<StudySession> {
  const { data, error } = await supabaseAdmin
    .from("study_sessions")
    .update({ ended_at: new Date().toISOString() })
    .eq("id", sessionId)
    .select()
    .single();

  if (error) throw error;
  return data as StudySession;
}

export async function updateSessionCounts(
  sessionId: string,
  correct: boolean
): Promise<void> {
  // Increment total_cards, and correct_count if correct
  const { data: session } = await supabaseAdmin
    .from("study_sessions")
    .select("total_cards, correct_count")
    .eq("id", sessionId)
    .single();

  if (!session) return;

  await supabaseAdmin
    .from("study_sessions")
    .update({
      total_cards: session.total_cards + 1,
      correct_count: session.correct_count + (correct ? 1 : 0),
    })
    .eq("id", sessionId);
}
