import { supabaseAdmin } from "@/lib/supabase-server";
import { STUDENT_ID } from "@/lib/constants";
import type { FactMastery } from "@/lib/types";

/**
 * Update mastery for a single fact using the atomic PL/pgSQL function.
 * Returns the new mastery state.
 */
export async function updateFactMastery(
  factId: string,
  correct: boolean,
  studentId = STUDENT_ID
): Promise<FactMastery> {
  const { data, error } = await supabaseAdmin.rpc("update_fact_mastery", {
    p_student_id: studentId,
    p_fact_id: factId,
    p_correct: correct,
  });

  if (error) throw error;

  return data as FactMastery;
}

export interface TopicMasteryResult {
  mastery_score: number;
  mastered: boolean;
  total_marks_earned: number;
  total_marks_available: number;
  questions_attempted: number;
  questions_correct: number;
  delta: number;
}

/**
 * Update topic-level mastery after a quiz attempt.
 *
 * Uses the atomic PL/pgSQL function `update_topic_mastery` which:
 * - Boosts score on correct answers (+0.35 for full marks, proportional for partial)
 * - Penalizes on wrong answers (-0.20 for zero marks)
 * - Applies decay (-0.10) if topic not practiced for 14+ days
 * - Clamps score between 0.0 and 1.0
 * - Mastered threshold at 0.80
 */
export async function updateTopicMastery(
  syllabusTopicId: string,
  marksAwarded: number,
  marksAvailable: number,
  studentId = STUDENT_ID
): Promise<TopicMasteryResult> {
  const { data, error } = await supabaseAdmin.rpc("update_topic_mastery", {
    p_student_id: studentId,
    p_topic_id: syllabusTopicId,
    p_marks_awarded: marksAwarded,
    p_marks_available: marksAvailable,
  });

  if (error) throw error;

  return data as TopicMasteryResult;
}

/**
 * Update the student's streak based on today's activity.
 */
export async function updateStreak(studentId = STUDENT_ID): Promise<void> {
  const today = new Date().toISOString().split("T")[0];

  const { data: student } = await supabaseAdmin
    .from("students")
    .select("last_study_date, current_streak, longest_streak")
    .eq("id", studentId)
    .single();

  if (!student) return;

  const lastDate = student.last_study_date;

  if (lastDate === today) return; // Already counted today

  const yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);
  const yesterdayStr = yesterday.toISOString().split("T")[0];

  const newStreak = lastDate === yesterdayStr ? student.current_streak + 1 : 1;
  const longestStreak = Math.max(student.longest_streak, newStreak);

  await supabaseAdmin
    .from("students")
    .update({
      current_streak: newStreak,
      longest_streak: longestStreak,
      last_study_date: today,
    })
    .eq("id", studentId);
}
