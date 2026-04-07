import { supabaseAdmin } from "@/lib/supabase-server";
import { FLASHCARD_DEFAULT_LIMIT } from "@/lib/constants";
import { updateFactMastery, updateStreak } from "./mastery";
import { updateSessionCounts } from "./sessions";
import type { Flashcard, FactMastery } from "@/lib/types";

/**
 * Get a flashcard deck prioritized by:
 * 1. Never-seen facts (no mastery row)
 * 2. Lowest mastery score
 * 3. Stale facts (not seen in 7+ days)
 */
export async function getFlashcardDeck(options: {
  subjectCode?: string;
  topicId?: string;
  limit?: number;
  studentId: string;
}): Promise<Flashcard[]> {
  const {
    subjectCode,
    topicId,
    limit = FLASHCARD_DEFAULT_LIMIT,
    studentId, } = options;

  // Build query for active facts with optional filters
  let query = supabaseAdmin
    .from("atomic_facts")
    .select(`
      id,
      fact_text,
      flashcard_front,
      topic_name,
      subject_code,
      difficulty,
      has_formula,
      student_fact_mastery!left(mastery_score, last_seen)
    `)
    .eq("is_active", true);

  if (subjectCode) {
    query = query.eq("subject_code", subjectCode);
  }
  if (topicId) {
    query = query.eq("syllabus_topic_id", topicId);
  }

  const { data, error } = await query;
  if (error) throw error;
  if (!data) return [];

  // Get facts already seen in flashcard mode
  const { data: exposedFacts } = await supabaseAdmin
    .from("question_exposure")
    .select("question_id")
    .eq("student_id", studentId)
    .eq("mode", "flashcard");

  const exposedIds = new Set(
    (exposedFacts ?? []).map((r) => r.question_id as string)
  );

  // Transform and sort: never-seen first, then lowest mastery, then stalest
  const now = Date.now();
  const sevenDaysMs = 7 * 24 * 60 * 60 * 1000;

  const cards: (Flashcard & { _sortKey: number })[] = data.map((row) => {
    const masteryRows = row.student_fact_mastery as
      | { mastery_score: number; last_seen: string | null }[]
      | null;
    const mastery = masteryRows?.[0] ?? null;
    const masteryScore = mastery?.mastery_score ?? null;
    const lastSeen = mastery?.last_seen ?? null;

    // Sort priority: never seen = -2, stale = -1, then by score ascending
    let sortKey: number;
    if (masteryScore === null) {
      sortKey = -2;
    } else if (lastSeen && now - new Date(lastSeen).getTime() > sevenDaysMs) {
      sortKey = -1;
    } else {
      sortKey = masteryScore;
    }

    return {
      fact_id: row.id as string,
      fact_text: row.fact_text as string,
      flashcard_front: row.flashcard_front as string | null,
      topic_name: row.topic_name as string,
      subject_code: row.subject_code as string,
      difficulty: row.difficulty as number,
      has_formula: row.has_formula as boolean,
      mastery_score: masteryScore,
      last_seen: lastSeen,
      _sortKey: sortKey,
    };
  });

  // Filter out already-seen facts, then exclude mastered (>= 0.8)
  const unseen = cards.filter((c) => !exposedIds.has(c.fact_id));
  const unmastered = (unseen.length >= limit ? unseen : cards).filter((c) => c._sortKey < 0.8);
  const pool = unmastered.length >= limit ? unmastered : (unseen.length >= limit ? unseen : cards);

  pool.sort((a, b) => a._sortKey - b._sortKey);

  return pool.slice(0, limit).map(({ _sortKey, ...card }) => card);
}

/**
 * Record a flashcard answer: insert attempt, update mastery, update session counts.
 */
export async function recordFlashcardAnswer(options: {
  sessionId: string;
  factId: string;
  correct: boolean;
  studentId: string;
}): Promise<FactMastery> {
  const { sessionId, factId, correct, studentId } = options;

  // Insert attempt
  const { error: insertError } = await supabaseAdmin
    .from("flashcard_attempts")
    .insert({
      student_id: studentId,
      session_id: sessionId,
      fact_id: factId,
      correct,
    });

  if (insertError) throw insertError;

  // Update mastery score
  const result = await updateFactMastery(factId, correct, studentId);

  // Update session counts and streak
  await Promise.all([
    updateSessionCounts(sessionId, correct),
    updateStreak(studentId),
  ]);

  return result;
}
