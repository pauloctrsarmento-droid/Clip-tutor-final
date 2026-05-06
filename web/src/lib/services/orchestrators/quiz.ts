import { supabaseAdmin } from "@/lib/supabase-server";
import { SUBJECT_LANGUAGE, SUBJECT_LANG_CODE } from "@/lib/constants";
import { callOpenAI } from "@/lib/openai";
import { getPrompt } from "@/lib/services/prompts";
import { createSession, endSession } from "@/lib/services/sessions";
import { updateTopicMastery, updateFactMastery, updateStreak } from "@/lib/services/mastery";

// Quiz serves exclusively the V1 commercial bank (`assessment_items`,
// status='approved'). Subjects without V1 content (French, EngLit,
// Português) yield empty quizzes — by design, until V1 is generated.
// The legacy `exam_questions` table is retained only for Exam Practice
// and Past Papers; the quiz never reads from it.

/** Extract fact IDs from related_facts (handles both string[] and {fact_id, score}[] formats) */
function extractFactIds(relatedFacts: unknown): string[] {
  if (!Array.isArray(relatedFacts) || relatedFacts.length === 0) return [];
  return relatedFacts.map((entry) => {
    if (typeof entry === "string") return entry;
    if (typeof entry === "object" && entry !== null && "fact_id" in entry) {
      return (entry as { fact_id: string }).fact_id;
    }
    return null;
  }).filter((id): id is string => id !== null);
}

// ── Types ──────────────────────────────────────────────────────

export interface QuizQuestion {
  id: string;
  question_text: string;
  marks: number;
  response_type: string;
  question_type: string;
  correct_answer: string | null;
  mark_scheme: string | null;
  parent_context: string | null;
  diagram_urls: string[];
  options: Record<string, string> | null;
  paper_id: string;
  /** Structured figure specs from assessment_items.figures (jsonb). */
  figures: unknown;
}

export interface EvaluationResult {
  marks_awarded: number;
  marks_available: number;
  mark_points: Array<{
    id: string;
    description: string;
    awarded: boolean;
    feedback: string;
  }>;
  related_facts?: string[];
  overall_feedback: string;
  exam_tip: string;
  concept_check: string | null;
}

export interface QuizSummary {
  total_marks_earned: number;
  total_marks_available: number;
  questions_attempted: number;
  accuracy: number;
  duration_seconds: number;
}

// ── Start Session ──────────────────────────────────────────────

interface FetchParams {
  subjectCode: string;
  topicId?: string;
  count: number;
  questionType: string;
  difficulty?: string;
  exposedIds: Set<string>;
  recentIds: Set<string>;
}

async function fetchApprovedItems(params: FetchParams): Promise<QuizQuestion[]> {
  const { subjectCode, topicId, count, questionType, difficulty, exposedIds, recentIds } = params;

  let query = supabaseAdmin
    .from("assessment_items")
    .select(
      "id, prompt_text, parent_context, marks, response_type, correct_answer, mark_scheme, mcq_options, figures, syllabus_topic_id, subject_code, difficulty, command_word"
    )
    .eq("subject_code", subjectCode)
    .eq("status", "approved");

  if (topicId) {
    query = query.eq("syllabus_topic_id", topicId);
  }

  if (difficulty) {
    query = query.eq("difficulty", difficulty);
  }

  if (questionType === "mcq") {
    query = query.eq("response_type", "mcq");
  } else if (questionType === "text") {
    query = query.eq("response_type", "text");
  } else if (questionType === "numeric") {
    query = query.eq("response_type", "numeric");
  } else {
    query = query.in("response_type", ["mcq", "text", "numeric"]);
  }

  const { data, error } = await query.limit(count * 4);
  if (error) throw error;

  const rows = data ?? [];
  if (rows.length === 0) return [];

  const unseen = rows.filter(
    (r) => !exposedIds.has(r.id as string) && !recentIds.has(r.id as string)
  );
  const pool = unseen.length >= count ? unseen : rows;

  for (let i = pool.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [pool[i], pool[j]] = [pool[j], pool[i]];
  }

  const selected = pool.slice(0, count);

  return selected.map((q) => {
    // mcq_options: jsonb array of {letter, text, is_correct} → {A: text, B: text}
    let options: Record<string, string> | null = null;
    const rawOptions = q.mcq_options;
    if ((q.response_type as string) === "mcq" && Array.isArray(rawOptions)) {
      const parsed: Record<string, string> = {};
      for (const opt of rawOptions) {
        if (
          opt !== null &&
          typeof opt === "object" &&
          "letter" in opt &&
          "text" in opt &&
          typeof (opt as Record<string, unknown>).letter === "string" &&
          typeof (opt as Record<string, unknown>).text === "string"
        ) {
          const letter = (opt as { letter: string }).letter;
          const text = (opt as { text: string }).text;
          parsed[letter] = text;
        }
      }
      if (Object.keys(parsed).length >= 2) options = parsed;
    }

    return {
      id: q.id as string,
      question_text: q.prompt_text as string,
      marks: q.marks as number,
      response_type: q.response_type as string,
      // assessment_items has no question_type; reuse response_type as a sensible default
      question_type: q.response_type as string,
      correct_answer: null,
      mark_scheme: null,
      parent_context: (q.parent_context as string | null) ?? null,
      diagram_urls: [],
      options,
      paper_id: "",
      figures: q.figures ?? null,
    };
  });
}

export async function startQuizSession(options: {
  subjectCode: string;
  topicId?: string;
  count?: number;
  questionType?: string;
  difficulty?: string;
  studentId: string;
}): Promise<{ session_id: string; questions: QuizQuestion[] }> {
  const {
    subjectCode,
    topicId,
    count = 10,
    questionType = "all",
    difficulty,
    studentId, } = options;

  const session = await createSession(
    { session_type: "quiz", subject_code: subjectCode, syllabus_topic_id: topicId },
    studentId
  );

  // Get questions already seen in quiz mode (question_exposure)
  const { data: exposedQuiz } = await supabaseAdmin
    .from("question_exposure")
    .select("question_id")
    .eq("student_id", studentId)
    .eq("mode", "quiz");

  const exposedIds = new Set(
    (exposedQuiz ?? []).map((r) => r.question_id as string)
  );

  // Also exclude recently answered correctly (last 7 days) as extra safety
  const sevenDaysAgo = new Date();
  sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

  const { data: recentCorrect } = await supabaseAdmin
    .from("quiz_attempts")
    .select("question_id")
    .eq("student_id", studentId)
    .gte("created_at", sevenDaysAgo.toISOString())
    .gte("marks_awarded", 1);

  const recentIds = new Set(
    (recentCorrect ?? []).map((r) => r.question_id as string)
  );

  const questions = await fetchApprovedItems({
    subjectCode,
    topicId,
    count,
    questionType,
    difficulty,
    exposedIds,
    recentIds,
  });

  // Record exposure for selected questions
  if (questions.length > 0) {
    const exposureRows = questions.map((q) => ({
      student_id: studentId,
      question_id: q.id,
      mode: "quiz" as const,
      session_id: session.id,
    }));
    await supabaseAdmin
      .from("question_exposure")
      .upsert(exposureRows, { onConflict: "student_id,question_id,mode" });
  }

  return { session_id: session.id, questions };
}

// ── Evaluate Answer ────────────────────────────────────────────

export async function evaluateAnswer(options: {
  sessionId: string;
  questionId: string;
  studentAnswer: string;
  studentId: string;
  photoUrls?: string[];
}): Promise<EvaluationResult> {
  const { sessionId, questionId, studentAnswer, studentId, photoUrls } = options;

  const [itemRes, studentRes, promptTemplate] = await Promise.all([
    supabaseAdmin.from("assessment_items").select("*").eq("id", questionId).maybeSingle(),
    supabaseAdmin.from("students").select("tutor_prompt").eq("id", studentId).single(),
    getPrompt("quiz_evaluator"),
  ]);

  if (!itemRes.data) throw new Error(`Question ${questionId} not found`);

  // Alias prompt_text → question_text for downstream prompt placeholder reuse.
  const r = itemRes.data as Record<string, unknown>;
  const question: Record<string, unknown> = {
    ...r,
    question_text: r.prompt_text,
    related_facts: null,
  };

  const subjectCode = question.subject_code as string;
  const languageName = SUBJECT_LANGUAGE[subjectCode] ?? "English";
  const languageCode = SUBJECT_LANG_CODE[subjectCode] ?? "en";
  const marks = question.marks as number;

  // For MCQ: auto-check + LLM explanation
  const isMcq = (question.response_type as string) === "mcq";
  let mcqCorrect: boolean | null = null;

  if (isMcq) {
    mcqCorrect = studentAnswer.toUpperCase() === (question.correct_answer as string)?.toUpperCase();
  }

  // Generate fallback mark points for calculation questions with empty mark_points
  let markPointsJson = JSON.stringify(question.mark_points ?? []);
  const existingMarkPoints = question.mark_points as unknown[];
  if (
    (!existingMarkPoints || existingMarkPoints.length === 0) &&
    marks >= 2 &&
    (question.response_type as string) === "numeric"
  ) {
    const fallbackPoints = [
      { id: "C1", description: "Correct formula or method shown (e.g. substitution of values into the correct equation)" },
      { id: "A1", description: "Correct final answer with appropriate units" },
    ];
    if (marks >= 3) {
      fallbackPoints.splice(1, 0, {
        id: "C2",
        description: "Correct intermediate calculation or substitution of values",
      });
    }
    markPointsJson = JSON.stringify(fallbackPoints);
  }

  const system = promptTemplate
    .replace(/\{\{student_profile\}\}/g, (studentRes.data?.tutor_prompt as string) ?? "No profile available")
    .replace(/\{\{subject_name\}\}/g, subjectCode)
    .replace(/\{\{question_id\}\}/g, questionId)
    .replace(/\{\{question_text\}\}/g, question.question_text as string)
    .replace(/\{\{marks_available\}\}/g, String(marks))
    .replace(/\{\{mark_scheme\}\}/g, (question.mark_scheme as string) ?? "")
    .replace(/\{\{mark_points\}\}/g, markPointsJson)
    .replace(/\{\{student_answer\}\}/g, studentAnswer)
    .replace(/\{\{language_name\}\}/g, languageName)
    .replace(/\{\{language\}\}/g, languageCode);

  const userContent: string | import("@/lib/openai").VisionContentPart[] =
    photoUrls && photoUrls.length > 0
      ? [
          { type: "text" as const, text: "Evaluate the student's answer now. Return the JSON evaluation. The student has uploaded photo(s) of their handwritten work — examine them carefully." },
          ...photoUrls.map((url) => ({
            type: "image_url" as const,
            image_url: { url, detail: "high" as const },
          })),
        ]
      : "Evaluate the student's answer now. Return the JSON evaluation.";

  const llmResponse = await callOpenAI({
    system,
    user: userContent,
    jsonMode: true,
    maxTokens: 2048,
    temperature: 0,
  });

  let evaluation: EvaluationResult;

  try {
    evaluation = JSON.parse(llmResponse) as EvaluationResult;
  } catch {
    if (isMcq && mcqCorrect !== null) {
      evaluation = {
        marks_awarded: mcqCorrect ? 1 : 0,
        marks_available: 1,
        mark_points: [{ id: "M1", description: `Answer: ${question.correct_answer}`, awarded: mcqCorrect, feedback: mcqCorrect ? "Correct!" : `The correct answer is ${question.correct_answer}.` }],
        overall_feedback: llmResponse,
        exam_tip: "",
        concept_check: null,
      };
    } else {
      evaluation = {
        marks_awarded: 0,
        marks_available: marks,
        mark_points: [],
        overall_feedback: llmResponse,
        exam_tip: "",
        concept_check: null,
      };
    }
  }

  if (isMcq && mcqCorrect !== null) {
    evaluation.marks_awarded = mcqCorrect ? 1 : 0;
    if (evaluation.mark_points?.length > 0) {
      evaluation.mark_points[0].awarded = mcqCorrect;
    }
  }

  await supabaseAdmin.from("quiz_attempts").insert({
    student_id: studentId,
    session_id: sessionId,
    question_id: questionId,
    marks_awarded: evaluation.marks_awarded,
    marks_available: evaluation.marks_available ?? marks,
    self_graded: false,
  });

  const topicId = question.syllabus_topic_id as string | null;
  if (topicId) {
    await updateTopicMastery(
      topicId,
      evaluation.marks_awarded,
      evaluation.marks_available ?? marks,
      studentId
    );
  }

  const factIds = extractFactIds(question.related_facts);
  if (factIds.length > 0) {
    const correct = evaluation.marks_awarded > 0;
    await Promise.all(
      factIds.map((factId) => updateFactMastery(factId, correct, studentId).catch(() => {}))
    );
  }

  await updateStreak(studentId);

  return evaluation;
}

// ── End Session ────────────────────────────────────────────────

export async function endQuizSession(options: {
  sessionId: string;
}): Promise<QuizSummary> {
  const session = await endSession(options.sessionId);

  const { data: attempts } = await supabaseAdmin
    .from("quiz_attempts")
    .select("marks_awarded, marks_available")
    .eq("session_id", options.sessionId);

  const rows = attempts ?? [];
  const totalEarned = rows.reduce((s, r) => s + (r.marks_awarded as number), 0);
  const totalAvailable = rows.reduce((s, r) => s + (r.marks_available as number), 0);

  const startedAt = new Date(session.started_at).getTime();
  const endedAt = session.ended_at ? new Date(session.ended_at).getTime() : Date.now();

  return {
    total_marks_earned: totalEarned,
    total_marks_available: totalAvailable,
    questions_attempted: rows.length,
    accuracy: totalAvailable > 0 ? Math.round((totalEarned / totalAvailable) * 100) : 0,
    duration_seconds: Math.round((endedAt - startedAt) / 1000),
  };
}
