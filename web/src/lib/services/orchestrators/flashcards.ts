import { supabaseAdmin } from "@/lib/supabase-server";
import { STUDENT_ID, SUBJECT_LANGUAGE, SUBJECT_LANG_CODE } from "@/lib/constants";
import { callOpenAI } from "@/lib/openai";
import { getPrompt } from "@/lib/services/prompts";
import { createSession, endSession, updateSessionCounts } from "@/lib/services/sessions";
import { getFlashcardDeck } from "@/lib/services/flashcards";
import { updateFactMastery, updateStreak } from "@/lib/services/mastery";
import type { Flashcard, FactMastery } from "@/lib/types";

export type FlashcardResult = "know" | "partial" | "dunno";

interface StartOptions {
  subjectCode: string;
  topicId?: string;
  limit?: number;
  studentId?: string;
}

interface FlashcardWithQuestion extends Flashcard {
  question: string;
  question_id: string | null;
}

interface StartResult {
  session_id: string;
  cards: FlashcardWithQuestion[];
}

export async function startFlashcardSession(options: StartOptions): Promise<StartResult> {
  const { subjectCode, topicId, limit, studentId = STUDENT_ID } = options;

  const session = await createSession(
    { session_type: "flashcard", subject_code: subjectCode, syllabus_topic_id: topicId },
    studentId
  );

  const cards = await getFlashcardDeck({
    subjectCode,
    topicId,
    limit,
    studentId,
  });

  // Fetch a random question for each card from flashcard_questions
  const factIds = cards.map((c) => c.fact_id);

  const { data: allQuestions } = await supabaseAdmin
    .from("flashcard_questions")
    .select("id, fact_id, question")
    .in("fact_id", factIds);

  // Group questions by fact_id
  const questionsByFact = new Map<string, Array<{ id: string; question: string }>>();
  for (const q of allQuestions ?? []) {
    const fid = q.fact_id as string;
    const existing = questionsByFact.get(fid) ?? [];
    existing.push({ id: q.id as string, question: q.question as string });
    questionsByFact.set(fid, existing);
  }

  // Pick a random question for each card
  const cardsWithQuestions: FlashcardWithQuestion[] = cards.map((card) => {
    const questions = questionsByFact.get(card.fact_id);
    if (questions && questions.length > 0) {
      const picked = questions[Math.floor(Math.random() * questions.length)];
      return { ...card, question: picked.question, question_id: picked.id };
    }
    // Fallback: use fact_text as question
    return { ...card, question: card.fact_text, question_id: null };
  });

  // Record exposure for served facts
  if (cardsWithQuestions.length > 0) {
    const exposureRows = cardsWithQuestions.map((c) => ({
      student_id: studentId,
      question_id: c.fact_id,
      mode: "flashcard" as const,
      session_id: session.id,
    }));
    await supabaseAdmin
      .from("question_exposure")
      .upsert(exposureRows, { onConflict: "student_id,question_id,mode" });
  }

  return { session_id: session.id, cards: cardsWithQuestions };
}

export async function getFlashcardExplanation(options: {
  factId: string;
  question?: string;
  studentId?: string;
}): Promise<{ explanation: string }> {
  const { factId, question, studentId = STUDENT_ID } = options;

  // Fetch in parallel: prompt, student profile, fact
  const [promptTemplate, studentData, factData] = await Promise.all([
    getPrompt("flashcard_explainer"),
    supabaseAdmin.from("students").select("tutor_prompt").eq("id", studentId).single(),
    supabaseAdmin.from("atomic_facts").select("*").eq("id", factId).single(),
  ]);

  const student = studentData.data;
  const fact = factData.data;

  if (!fact) throw new Error(`Fact ${factId} not found`);

  const subjectCode = fact.subject_code as string;
  const languageName = SUBJECT_LANGUAGE[subjectCode] ?? "English";
  const languageCode = SUBJECT_LANG_CODE[subjectCode] ?? "en";

  // Replace placeholders
  const system = promptTemplate
    .replace(/\{\{student_profile\}\}/g, student?.tutor_prompt ?? "No profile available")
    .replace(/\{\{subject_name\}\}/g, subjectCode)
    .replace(/\{\{fact_topic\}\}/g, (fact.topic_name as string) ?? "")
    .replace(/\{\{fact_text\}\}/g, (fact.fact_text as string) ?? "")
    .replace(/\{\{flashcard_front\}\}/g, question ?? (fact.flashcard_front as string) ?? (fact.fact_text as string) ?? "")
    .replace(/\{\{difficulty\}\}/g, String(fact.difficulty ?? 1))
    .replace(/\{\{has_formula\}\}/g, String(fact.has_formula ?? false))
    .replace(/\{\{language_name\}\}/g, languageName)
    .replace(/\{\{language\}\}/g, languageCode);

  const explanation = await callOpenAI({
    system,
    user: "Generate the flashcard explanation now.",
    maxTokens: 300,
  });

  return { explanation };
}

export async function recordFlashcardResult(options: {
  sessionId: string;
  factId: string;
  result: FlashcardResult;
  studentId?: string;
}): Promise<{ updated_mastery: number; consecutive_correct: number }> {
  const { sessionId, factId, result, studentId = STUDENT_ID } = options;

  const correct = result === "know";

  // Insert attempt
  await supabaseAdmin.from("flashcard_attempts").insert({
    student_id: studentId,
    session_id: sessionId,
    fact_id: factId,
    correct,
  });

  // Update mastery + session + streak
  const [mastery] = await Promise.all([
    updateFactMastery(factId, correct, studentId),
    updateSessionCounts(sessionId, correct),
    updateStreak(studentId),
  ]) as [FactMastery, unknown, unknown];

  return {
    updated_mastery: mastery.mastery_score,
    consecutive_correct: mastery.consecutive_correct,
  };
}

export async function endFlashcardSession(options: {
  sessionId: string;
  studentId?: string;
}): Promise<{
  total_cards: number;
  correct: number;
  incorrect: number;
  duration_seconds: number;
}> {
  const { sessionId } = options;

  const session = await endSession(sessionId);

  // Get attempt stats
  const { data: attempts } = await supabaseAdmin
    .from("flashcard_attempts")
    .select("correct")
    .eq("session_id", sessionId);

  const total = attempts?.length ?? 0;
  const correctCount = attempts?.filter((a) => a.correct === true).length ?? 0;

  const startedAt = new Date(session.started_at).getTime();
  const endedAt = session.ended_at ? new Date(session.ended_at).getTime() : Date.now();
  const durationSeconds = Math.round((endedAt - startedAt) / 1000);

  return {
    total_cards: total,
    correct: correctCount,
    incorrect: total - correctCount,
    duration_seconds: durationSeconds,
  };
}
