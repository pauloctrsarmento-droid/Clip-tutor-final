import { supabaseAdmin } from "@/lib/supabase-server";
import { STUDENT_ID, SUBJECT_LANGUAGE } from "@/lib/constants";
import { callOpenAI, type VisionContentPart } from "@/lib/openai";
import { getPrompt } from "@/lib/services/prompts";
import { updateTopicMastery, updateStreak } from "@/lib/services/mastery";
import { getPaperUrls } from "@/lib/papers";

// ── Types ──────────────────────────────────────────────────────

export interface ExamPaperInfo {
  id: string;
  subject_code: string;
  session: string;
  variant: string;
  component_type: string;
  total_marks: number;
  qp_url: string;
  ms_url: string;
}

export interface MarkBreakdownPoint {
  point: string;
  awarded: boolean;
}

export interface QuestionResult {
  question_number: string;
  max_marks: number;
  awarded_marks: number;
  confidence: "high" | "low";
  read_text: string;
  mark_breakdown: MarkBreakdownPoint[];
  student_answer_summary: string;
  feedback: string;
}

export interface ExamResults {
  session_id: string;
  paper_info: ExamPaperInfo;
  questions: QuestionResult[];
  total_marks: number;
  max_marks: number;
  percentage: number;
  grade: string | null;
  grade_boundaries: Record<string, number | null> | null;
  overall_feedback: string;
  needs_review: boolean;
  review_questions: Array<{ question_number: string; read_text: string }>;
}

interface MarkingStrategyQuestion {
  question_number: string;
  max_marks: number;
  mark_points: string[];
  acceptable_alternatives: string[];
}

interface MarkingStrategy {
  paper_info: { subject: string; component: string; session: string; max_marks: number };
  questions: MarkingStrategyQuestion[];
}

// ── Helpers ────────────────────────────────────────────────────

async function fetchPaperInfo(examPaperId: string): Promise<ExamPaperInfo> {
  const { data, error } = await supabaseAdmin
    .from("exam_papers")
    .select("id, subject_code, session, variant, component_type, total_marks")
    .eq("id", examPaperId)
    .single();

  if (error) throw new Error(`Paper ${examPaperId} not found`);

  const urls = getPaperUrls(examPaperId);

  return {
    id: data.id as string,
    subject_code: data.subject_code as string,
    session: data.session as string,
    variant: data.variant as string,
    component_type: (data.component_type as string) ?? "unknown",
    total_marks: data.total_marks as number,
    qp_url: urls.qp,
    ms_url: urls.ms,
  };
}

/** Build marking strategy from exam_questions in the DB (free, instant). */
async function buildMarkingStrategyFromDB(paperId: string, paperInfo: ExamPaperInfo): Promise<MarkingStrategy | null> {
  // Paginate to get all questions for this paper
  let allQuestions: Array<Record<string, unknown>> = [];
  let offset = 0;
  const pageSize = 1000;

  while (true) {
    const { data } = await supabaseAdmin
      .from("exam_questions")
      .select("question_number, part_label, marks, mark_scheme, mark_points")
      .eq("paper_id", paperId)
      .eq("is_stem", false)
      .order("part_order")
      .range(offset, offset + pageSize - 1);

    if (!data || data.length === 0) break;
    allQuestions = allQuestions.concat(data);
    if (data.length < pageSize) break;
    offset += pageSize;
  }

  if (allQuestions.length === 0) return null; // No questions found for this paper

  const questions: MarkingStrategyQuestion[] = allQuestions.map((q) => {
    const qn = q.question_number as string;
    const partLabel = q.part_label as string | null;
    const questionNumber = partLabel ? `${qn}${partLabel}` : qn;
    const rawMarkPoints = q.mark_points as unknown;
    const markScheme = (q.mark_scheme as string) ?? "";

    // mark_points can be string[] or {id, text}[] — normalize to descriptive strings
    let markPoints: string[] = [];
    if (Array.isArray(rawMarkPoints) && rawMarkPoints.length > 0) {
      markPoints = rawMarkPoints.map((mp: unknown) => {
        if (typeof mp === "string") return mp;
        if (mp && typeof mp === "object" && "text" in mp) {
          const obj = mp as { id?: string; text?: string };
          return obj.text ? `${obj.id ?? "M1"}: ${obj.text}` : (obj.id ?? "M1");
        }
        return String(mp);
      });
    }

    return {
      question_number: questionNumber,
      max_marks: q.marks as number,
      mark_points: markPoints.length > 0
        ? markPoints
        : markScheme ? [markScheme] : [],
      acceptable_alternatives: [],
    };
  });

  const totalMarks = questions.reduce((sum, q) => sum + q.max_marks, 0);

  return {
    paper_info: {
      subject: paperInfo.subject_code,
      component: paperInfo.variant,
      session: paperInfo.session,
      max_marks: totalMarks || paperInfo.total_marks,
    },
    questions,
  };
}

async function fetchGradeBoundaries(
  subjectCode: string,
  session: string,
  component: number
): Promise<Record<string, number | null> | null> {
  const id = `${subjectCode}_${session}_${component}`;

  const { data } = await supabaseAdmin
    .from("grade_boundaries")
    .select("a, b, c, d, e, f, g, max_marks")
    .eq("id", id)
    .single();

  if (!data) return null;

  return {
    A: data.a as number | null,
    B: data.b as number | null,
    C: data.c as number | null,
    D: data.d as number | null,
    E: data.e as number | null,
    F: data.f as number | null,
    G: data.g as number | null,
  };
}

function calculateGrade(
  totalMarks: number,
  boundaries: Record<string, number | null> | null
): string | null {
  if (!boundaries) return null;

  const grades = ["A", "B", "C", "D", "E", "F", "G"] as const;
  for (const grade of grades) {
    const threshold = boundaries[grade];
    if (threshold !== null && threshold !== undefined && totalMarks >= threshold) {
      return grade;
    }
  }
  return "U"; // Ungraded
}

// ── Main Functions ─────────────────────────────────────────────

export async function startExamSession(options: {
  studentId?: string;
  examPaperId: string;
}): Promise<{
  session_id: string;
  paper_info: ExamPaperInfo;
  time_limit_minutes: number | null;
}> {
  const { studentId = STUDENT_ID, examPaperId } = options;

  const paperInfo = await fetchPaperInfo(examPaperId);

  // Determine time limit based on component type
  const timeLimits: Record<string, number> = {
    theory_extended: 75,
    theory_core: 60,
    theory: 75,
    atp: 60,
    practical: 75,
    reading: 60,
    writing: 60,
    reading_writing: 120,
    programming: 75,
    poetry_prose: 90,
  };
  const timeLimit = timeLimits[paperInfo.component_type] ?? null;

  // Create session
  const { data: session, error } = await supabaseAdmin
    .from("exam_sessions")
    .insert({
      student_id: studentId,
      exam_paper_id: examPaperId,
      status: "in_progress",
      time_limit_minutes: timeLimit,
    })
    .select("id")
    .single();

  if (error) throw error;

  // Build marking strategy in background (non-blocking)
  buildMarkingStrategyFromDB(examPaperId, paperInfo).then(async (strategy) => {
    if (strategy) {
      await supabaseAdmin
        .from("exam_sessions")
        .update({ marking_strategy: strategy })
        .eq("id", session.id);
    }
  });

  return {
    session_id: session.id as string,
    paper_info: paperInfo,
    time_limit_minutes: timeLimit,
  };
}

export async function submitPhotos(options: {
  sessionId: string;
  photoUrls: string[];
  studentId?: string;
}): Promise<ExamResults> {
  const { sessionId, photoUrls, studentId = STUDENT_ID } = options;

  // Validate session
  const { data: session, error: sessionErr } = await supabaseAdmin
    .from("exam_sessions")
    .select("id, exam_paper_id, status, marking_strategy")
    .eq("id", sessionId)
    .single();

  if (sessionErr || !session) throw new Error("Session not found");
  if (session.status !== "in_progress") throw new Error(`Session status is ${session.status}, expected in_progress`);

  // Update session with photos
  await supabaseAdmin
    .from("exam_sessions")
    .update({
      photo_urls: photoUrls,
      submitted_at: new Date().toISOString(),
      status: "marking",
    })
    .eq("id", sessionId);

  const paperInfo = await fetchPaperInfo(session.exam_paper_id as string);

  // Get marking strategy (should be ready from background)
  let markingStrategy = session.marking_strategy as MarkingStrategy | null;
  if (!markingStrategy) {
    markingStrategy = await buildMarkingStrategyFromDB(session.exam_paper_id as string, paperInfo);
  }

  if (!markingStrategy) {
    throw new Error("Could not build marking strategy for this paper");
  }

  // Get prompt template
  const promptTemplate = await getPrompt("exam_paper_evaluator");

  const language = SUBJECT_LANGUAGE[paperInfo.subject_code] ?? "English";
  const languageInstruction = language === "English"
    ? "English"
    : `${language}. All feedback must be in ${language}.`;

  // Build system prompt
  const systemPrompt = promptTemplate
    .replace(/\{\{subject\}\}/g, paperInfo.subject_code)
    .replace(/\{\{component\}\}/g, paperInfo.component_type)
    .replace(/\{\{paper_code\}\}/g, paperInfo.id)
    .replace(/\{\{session\}\}/g, paperInfo.session)
    .replace(/\{\{max_marks\}\}/g, String(markingStrategy.paper_info.max_marks))
    .replace(/\{\{marking_strategy_json\}\}/g, JSON.stringify(markingStrategy.questions, null, 2))
    .replace(/\{\{language\}\}/g, language)
    .replace(/\{\{language_instruction\}\}/g, languageInstruction);

  // Build vision content with photos
  const userContent: VisionContentPart[] = [
    { type: "text", text: "Here are the student's handwritten exam answers. Mark each question strictly against the mark scheme:" },
    ...photoUrls.map((url) => ({
      type: "image_url" as const,
      image_url: { url, detail: "high" as const },
    })),
  ];

  // Call gpt-4o vision
  const llmResponse = await callOpenAI({
    system: systemPrompt,
    user: userContent,
    jsonMode: true,
    maxTokens: 8192,
    model: "gpt-4o",
  });

  // Parse response
  let parsed: {
    questions: QuestionResult[];
    total_marks: number;
    max_marks: number;
    percentage: number;
    overall_feedback: string;
  };

  try {
    parsed = JSON.parse(llmResponse);
  } catch {
    throw new Error("Failed to parse LLM response as JSON");
  }

  // Check for low confidence questions
  const lowConfidence = (parsed.questions ?? []).filter((q) => q.confidence === "low");
  const needsReview = lowConfidence.length > 0;

  // Fetch grade boundaries
  const component = parseInt(paperInfo.variant, 10);
  const boundaries = await fetchGradeBoundaries(paperInfo.subject_code, paperInfo.session, component);
  const grade = calculateGrade(parsed.total_marks, boundaries);

  // Update session
  const newStatus = needsReview ? "review" : "completed";
  await supabaseAdmin
    .from("exam_sessions")
    .update({
      status: newStatus,
      results: parsed,
      total_marks: parsed.total_marks,
      max_marks: parsed.max_marks,
      percentage: parsed.percentage,
      feedback: parsed.overall_feedback,
      completed_at: needsReview ? null : new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq("id", sessionId);

  // If no review needed, update mastery
  if (!needsReview) {
    await updateMasteryFromResults(session.exam_paper_id as string, parsed.questions, studentId);
    await updateStreak(studentId);
  }

  return {
    session_id: sessionId,
    paper_info: paperInfo,
    questions: parsed.questions ?? [],
    total_marks: parsed.total_marks,
    max_marks: parsed.max_marks,
    percentage: parsed.percentage,
    grade,
    grade_boundaries: boundaries,
    overall_feedback: parsed.overall_feedback ?? "",
    needs_review: needsReview,
    review_questions: lowConfidence.map((q) => ({
      question_number: q.question_number,
      read_text: q.read_text,
    })),
  };
}

export async function clarifyAnswers(options: {
  sessionId: string;
  clarifications: Array<{ question_number: string; typed_text: string }>;
  studentId?: string;
}): Promise<ExamResults> {
  const { sessionId, clarifications, studentId = STUDENT_ID } = options;

  const { data: session, error } = await supabaseAdmin
    .from("exam_sessions")
    .select("id, exam_paper_id, results, marking_strategy")
    .eq("id", sessionId)
    .single();

  if (error || !session) throw new Error("Session not found");

  const paperInfo = await fetchPaperInfo(session.exam_paper_id as string);
  const results = session.results as { questions: QuestionResult[]; overall_feedback: string };
  const strategy = session.marking_strategy as MarkingStrategy;

  // Re-evaluate clarified questions individually (text-only, cheap)
  for (const clarification of clarifications) {
    const questionIdx = results.questions.findIndex(
      (q) => q.question_number === clarification.question_number
    );
    if (questionIdx === -1) continue;

    const question = results.questions[questionIdx];
    const strategyQ = strategy.questions.find(
      (q) => q.question_number === clarification.question_number
    );

    if (!strategyQ) continue;

    const evalResponse = await callOpenAI({
      system: `You are a Cambridge IGCSE examiner. Evaluate this answer strictly against the mark scheme.
Mark scheme for ${clarification.question_number} (${question.max_marks} marks):
${strategyQ.mark_points.join("\n")}

Respond in JSON: { "awarded_marks": N, "mark_breakdown": [{"point": "...", "awarded": true/false}], "feedback": "..." }`,
      user: `Student's answer: ${clarification.typed_text}`,
      jsonMode: true,
      maxTokens: 1024,
    });

    try {
      const evalResult = JSON.parse(evalResponse);
      results.questions[questionIdx] = {
        ...question,
        confidence: "high",
        read_text: clarification.typed_text,
        awarded_marks: evalResult.awarded_marks ?? 0,
        mark_breakdown: evalResult.mark_breakdown ?? question.mark_breakdown,
        feedback: evalResult.feedback ?? question.feedback,
      };
    } catch {
      // If parse fails, keep original result but mark as high confidence
      results.questions[questionIdx].confidence = "high";
      results.questions[questionIdx].read_text = clarification.typed_text;
    }
  }

  // Recalculate totals
  const totalMarks = results.questions.reduce((sum, q) => sum + q.awarded_marks, 0);
  const maxMarks = results.questions.reduce((sum, q) => sum + q.max_marks, 0);
  const percentage = maxMarks > 0 ? Math.round((totalMarks / maxMarks) * 1000) / 10 : 0;

  const component = parseInt(paperInfo.variant, 10);
  const boundaries = await fetchGradeBoundaries(paperInfo.subject_code, paperInfo.session, component);
  const grade = calculateGrade(totalMarks, boundaries);

  // Update session to completed
  await supabaseAdmin
    .from("exam_sessions")
    .update({
      status: "completed",
      results,
      total_marks: totalMarks,
      max_marks: maxMarks,
      percentage,
      completed_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq("id", sessionId);

  // Update mastery
  await updateMasteryFromResults(session.exam_paper_id as string, results.questions, studentId);
  await updateStreak(studentId);

  return {
    session_id: sessionId,
    paper_info: paperInfo,
    questions: results.questions,
    total_marks: totalMarks,
    max_marks: maxMarks,
    percentage,
    grade,
    grade_boundaries: boundaries,
    overall_feedback: results.overall_feedback,
    needs_review: false,
    review_questions: [],
  };
}

export async function getExamResults(sessionId: string): Promise<ExamResults | null> {
  const { data: session } = await supabaseAdmin
    .from("exam_sessions")
    .select("*")
    .eq("id", sessionId)
    .single();

  if (!session) return null;

  const paperInfo = await fetchPaperInfo(session.exam_paper_id as string);
  const results = session.results as { questions: QuestionResult[]; overall_feedback: string } | null;

  const component = parseInt(paperInfo.variant, 10);
  const boundaries = await fetchGradeBoundaries(paperInfo.subject_code, paperInfo.session, component);
  const grade = calculateGrade((session.total_marks as number) ?? 0, boundaries);

  const lowConfidence = (results?.questions ?? []).filter((q) => q.confidence === "low");

  return {
    session_id: sessionId,
    paper_info: paperInfo,
    questions: results?.questions ?? [],
    total_marks: (session.total_marks as number) ?? 0,
    max_marks: (session.max_marks as number) ?? 0,
    percentage: Number(session.percentage ?? 0),
    grade,
    grade_boundaries: boundaries,
    overall_feedback: results?.overall_feedback ?? (session.feedback as string) ?? "",
    needs_review: session.status === "review",
    review_questions: lowConfidence.map((q) => ({
      question_number: q.question_number,
      read_text: q.read_text,
    })),
  };
}

export async function getExamHistory(options: {
  studentId?: string;
  subjectCode?: string;
}): Promise<Array<{
  session_id: string;
  exam_paper_id: string;
  status: string;
  total_marks: number | null;
  max_marks: number | null;
  percentage: number | null;
  started_at: string;
  completed_at: string | null;
}>> {
  const { studentId = STUDENT_ID, subjectCode } = options;

  let query = supabaseAdmin
    .from("exam_sessions")
    .select("id, exam_paper_id, status, total_marks, max_marks, percentage, started_at, completed_at")
    .eq("student_id", studentId)
    .order("started_at", { ascending: false });

  if (subjectCode) {
    // Filter by subject via exam_paper_id prefix
    query = query.like("exam_paper_id", `${subjectCode}%`);
  }

  const { data, error } = await query;
  if (error) throw error;

  return (data ?? []).map((row) => ({
    session_id: row.id as string,
    exam_paper_id: row.exam_paper_id as string,
    status: row.status as string,
    total_marks: row.total_marks as number | null,
    max_marks: row.max_marks as number | null,
    percentage: row.percentage ? Number(row.percentage) : null,
    started_at: row.started_at as string,
    completed_at: row.completed_at as string | null,
  }));
}

// ── Mastery Integration ────────────────────────────────────────

async function updateMasteryFromResults(
  paperId: string,
  questions: QuestionResult[],
  studentId: string
): Promise<void> {
  // Get topic mappings for this paper's questions
  const { data: examQuestions } = await supabaseAdmin
    .from("exam_questions")
    .select("question_number, part_label, syllabus_topic_id, marks")
    .eq("paper_id", paperId)
    .eq("is_stem", false);

  if (!examQuestions) return;

  // Build a map: question_number → topic_id
  const topicMap = new Map<string, string>();
  for (const eq of examQuestions) {
    const qn = eq.question_number as string;
    const part = eq.part_label as string | null;
    const key = part ? `${qn}${part}` : qn;
    const topicId = eq.syllabus_topic_id as string | null;
    if (topicId) topicMap.set(key, topicId);
  }

  // Update mastery for each answered question
  for (const q of questions) {
    const topicId = topicMap.get(q.question_number);
    if (!topicId) continue;

    await updateTopicMastery(topicId, q.awarded_marks, q.max_marks, studentId);
  }
}
