import { supabaseAdmin } from "@/lib/supabase-server";
import { QUIZ_DEFAULT_COUNT } from "@/lib/constants";
import { updateTopicMastery, updateStreak } from "./mastery";
import { updateSessionCounts } from "./sessions";
import type { ExamQuestion } from "@/lib/types";

/**
 * Get quiz questions filtered by subject/topic.
 * Excludes stems, prefers evaluation_ready, avoids recently attempted.
 */
export async function getQuizQuestions(options: {
  subjectCode?: string;
  topicId?: string;
  count?: number;
  responseType?: string;
  studentId: string;
}): Promise<ExamQuestion[]> {
  const {
    subjectCode,
    topicId,
    count = QUIZ_DEFAULT_COUNT,
    responseType,
    studentId, } = options;

  // Get recently attempted question IDs (last 7 days)
  const sevenDaysAgo = new Date();
  sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

  const { data: recentAttempts } = await supabaseAdmin
    .from("quiz_attempts")
    .select("question_id")
    .eq("student_id", studentId)
    .gte("created_at", sevenDaysAgo.toISOString());

  const recentIds = new Set(
    (recentAttempts ?? []).map((a) => a.question_id as string)
  );

  // Query questions
  let query = supabaseAdmin
    .from("exam_questions")
    .select("*")
    .eq("is_stem", false)
    .eq("evaluation_ready", true);

  if (subjectCode) query = query.eq("subject_code", subjectCode);
  if (topicId) query = query.eq("syllabus_topic_id", topicId);
  if (responseType) query = query.eq("response_type", responseType);

  // Fetch more than needed to filter out recent attempts
  const fetchCount = Math.min(count * 3, 200);
  const { data, error } = await query.limit(fetchCount);
  if (error) throw error;
  if (!data) return [];

  // Filter out recently attempted, then shuffle and take count
  const available = data.filter((q) => !recentIds.has(q.id as string));
  const pool = available.length >= count ? available : data;

  // Fisher-Yates shuffle
  for (let i = pool.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [pool[i], pool[j]] = [pool[j], pool[i]];
  }

  return pool.slice(0, count) as ExamQuestion[];
}

/**
 * Get a single question by ID with full mark scheme.
 */
export async function getQuestionById(
  questionId: string
): Promise<ExamQuestion | null> {
  const { data, error } = await supabaseAdmin
    .from("exam_questions")
    .select("*")
    .eq("id", questionId)
    .single();

  if (error) {
    if (error.code === "PGRST116") return null;
    throw error;
  }

  return data as ExamQuestion;
}

/**
 * Record a quiz attempt: insert attempt, update topic mastery, update session.
 */
export async function recordQuizAttempt(options: {
  sessionId: string;
  questionId: string;
  marksAwarded: number;
  marksAvailable?: number;
  studentId: string;
}): Promise<void> {
  const { sessionId, questionId, marksAwarded, studentId } =
    options;

  // Get question to find marks and topic
  const question = await getQuestionById(questionId);
  if (!question) throw new Error(`Question ${questionId} not found`);

  const marks = options.marksAvailable ?? question.marks;
  const isCorrect = marksAwarded >= marks;

  // Insert attempt
  const { error: insertError } = await supabaseAdmin
    .from("quiz_attempts")
    .insert({
      student_id: studentId,
      session_id: sessionId,
      question_id: questionId,
      marks_awarded: marksAwarded,
      marks_available: marks,
      self_graded: true,
    });

  if (insertError) throw insertError;

  // Update topic mastery if question has a topic
  if (question.syllabus_topic_id) {
    await updateTopicMastery(
      question.syllabus_topic_id,
      marksAwarded,
      marks,
      studentId
    );
  }

  // Update session counts and streak
  await Promise.all([
    updateSessionCounts(sessionId, isCorrect),
    updateStreak(studentId),
  ]);
}
