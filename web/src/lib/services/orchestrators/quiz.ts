import { supabaseAdmin } from "@/lib/supabase-server";
import { STUDENT_ID, SUBJECT_LANGUAGE, SUBJECT_LANG_CODE } from "@/lib/constants";
import { callOpenAI } from "@/lib/openai";
import { getPrompt } from "@/lib/services/prompts";
import { createSession, endSession } from "@/lib/services/sessions";
import { updateTopicMastery, updateStreak } from "@/lib/services/mastery";
import { getQuestionDiagramUrls } from "@/lib/diagrams";

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

export async function startQuizSession(options: {
  subjectCode: string;
  topicId?: string;
  count?: number;
  questionType?: string;
  studentId?: string;
}): Promise<{ session_id: string; questions: QuizQuestion[] }> {
  const {
    subjectCode,
    topicId,
    count = 10,
    questionType = "all",
    studentId = STUDENT_ID,
  } = options;

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

  // Build query
  let query = supabaseAdmin
    .from("exam_questions")
    .select("id, question_text, marks, response_type, question_type, correct_answer, mark_scheme, parent_context, has_diagram, fig_refs, table_refs, paper_id")
    .eq("subject_code", subjectCode)
    .eq("is_stem", false)
    .eq("evaluation_ready", true);

  if (topicId) {
    query = query.eq("syllabus_topic_id", topicId);
  }

  if (questionType === "mcq") {
    query = query.eq("response_type", "mcq");
  } else if (questionType === "text") {
    query = query.eq("response_type", "text");
  } else if (questionType === "numeric") {
    query = query.eq("response_type", "numeric");
  }

  // Fetch more than needed for filtering
  const { data: allQuestions, error } = await query.limit(count * 4);
  if (error) throw error;

  // Filter out unanswerable questions (need images we don't have)
  const available = (allQuestions ?? []).filter((q) => {
    if (exposedIds.has(q.id as string)) return false;
    if (recentIds.has(q.id as string)) return false;
    return isAnswerable(q);
  });
  // Fall back: if not enough unseen, allow seen questions but NEVER unanswerable ones
  const answerable = (allQuestions ?? []).filter((q) => isAnswerable(q));
  const pool = available.length >= count ? available : answerable;

  // Shuffle
  for (let i = pool.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [pool[i], pool[j]] = [pool[j], pool[i]];
  }

  const selected = pool.slice(0, count);

  // Build response with diagram URLs and MCQ options
  const questions: QuizQuestion[] = selected.map((q) => {
    const figRefs = (q.fig_refs as string[]) ?? [];
    const tableRefs = (q.table_refs as string[]) ?? [];
    const paperId = q.paper_id as string;

    // Extract fig refs from parent_context if not already in fig_refs
    const parentCtx = (q.parent_context as string) ?? "";
    const contextFigMatches = parentCtx.match(/Fig\.\s?(\d+\.\d+)/gi) ?? [];
    const contextFigRefs = contextFigMatches.map((m) => {
      const match = m.match(/(\d+\.\d+)/);
      return match ? match[1] : "";
    }).filter(Boolean);

    const allFigRefs = [...new Set([...figRefs, ...contextFigRefs])];

    const diagramUrls = (q.has_diagram || allFigRefs.length > 0)
      ? getQuestionDiagramUrls(paperId, allFigRefs, tableRefs)
      : [];

    // Parse MCQ options from mark_scheme
    let options: Record<string, string> | null = null;
    if ((q.response_type as string) === "mcq" && q.mark_scheme) {
      const ms = q.mark_scheme as string;
      const parsed: Record<string, string> = {};
      for (const line of ms.split("\n")) {
        const m = line.match(/^([ABCD]):\s*(.+)/);
        if (m) parsed[m[1]] = m[2].trim();
      }
      if (Object.keys(parsed).length >= 2) options = parsed;
    }

    return {
      id: q.id as string,
      question_text: q.question_text as string,
      marks: q.marks as number,
      response_type: q.response_type as string,
      question_type: q.question_type as string,
      correct_answer: null, // Don't send to frontend
      mark_scheme: null, // Don't send to frontend
      parent_context: q.parent_context as string | null,
      diagram_urls: diagramUrls,
      options,
      paper_id: paperId,
    };
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
  studentId?: string;
}): Promise<EvaluationResult> {
  const { sessionId, questionId, studentAnswer, studentId = STUDENT_ID } = options;

  // Fetch question + student profile in parallel
  const [questionRes, studentRes, promptTemplate] = await Promise.all([
    supabaseAdmin.from("exam_questions").select("*").eq("id", questionId).single(),
    supabaseAdmin.from("students").select("tutor_prompt").eq("id", studentId).single(),
    getPrompt("quiz_evaluator"),
  ]);

  const question = questionRes.data;
  if (!question) throw new Error(`Question ${questionId} not found`);

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
    // For 3+ marks, add intermediate steps
    if (marks >= 3) {
      fallbackPoints.splice(1, 0, {
        id: "C2",
        description: "Correct intermediate calculation or substitution of values",
      });
    }
    markPointsJson = JSON.stringify(fallbackPoints);
  }

  // Build prompt with placeholders
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

  // Call LLM
  const llmResponse = await callOpenAI({
    system,
    user: "Evaluate the student's answer now. Return the JSON evaluation.",
    jsonMode: true,
    maxTokens: 2048,
  });

  let evaluation: EvaluationResult;

  try {
    evaluation = JSON.parse(llmResponse) as EvaluationResult;
  } catch {
    // Fallback for MCQ if JSON parse fails
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

  // For MCQ: override marks with auto-check result
  if (isMcq && mcqCorrect !== null) {
    evaluation.marks_awarded = mcqCorrect ? 1 : 0;
  }

  // Save attempt
  await supabaseAdmin.from("quiz_attempts").insert({
    student_id: studentId,
    session_id: sessionId,
    question_id: questionId,
    marks_awarded: evaluation.marks_awarded,
    marks_available: evaluation.marks_available ?? marks,
    self_graded: false,
  });

  // Update topic mastery
  const topicId = question.syllabus_topic_id as string | null;
  if (topicId) {
    await updateTopicMastery(
      topicId,
      evaluation.marks_awarded,
      evaluation.marks_available ?? marks,
      studentId
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

// ── Question Answerability Filter ─────────────────────────────

// Question DEPENDS on seeing an image to answer
const NEEDS_IMAGE = /\b(regardez|panneaux|look at the|see the|shown in the|in the diagram|in the figure|the picture shows|the image shows|the graph shows|the table shows|from the graph|from the diagram|from the figure|les images|la photo|l['']image montre|cochez.*case|bonne lettre|tick.*box|correct letter)\b/i;

// Student must draw/sketch (instructions, not image dependencies)
const IS_INSTRUCTION = /\b(draw a|sketch a|complete the diagram|label the diagram|plot a graph|dessinez|tracez)\b/i;

// Bare letter options: text has 3+ standalone letters (A\nB\nC) without descriptions
// This means the options refer to images we don't have
const BARE_LETTERS = /(?:^|\n)\s*[A-H]\s*(?:\n|$)/gm;

/**
 * Check if a question can be answered without external images.
 * Returns false for questions that reference visual content we don't have.
 */
function isAnswerable(q: Record<string, unknown>): boolean {
  const hasImage = (q.has_diagram as boolean) || ((q.fig_refs as string[])?.length ?? 0) > 0;

  // Questions with available images are always answerable
  if (hasImage) return true;

  const questionText = (q.question_text as string) ?? "";
  const parentContext = (q.parent_context as string) ?? "";
  const fullText = `${questionText} ${parentContext}`;

  // Check for explicit image references
  if (NEEDS_IMAGE.test(fullText) && !IS_INSTRUCTION.test(fullText)) return false;

  // Check for bare letter options (A\nB\nC without descriptions) — image matching questions
  const bareMatches = questionText.match(BARE_LETTERS);
  if (bareMatches && bareMatches.length >= 3) return false;

  return true;
}
