import { supabaseAdmin } from "@/lib/supabase-server";
import { MASTERY } from "@/lib/constants";
import type {
  DashboardOverview,
  SubjectMastery,
  Misconception,
  DayProgress,
  TopicProgress,
} from "@/lib/types";

/**
 * Overview stats: streak, mastery%, total attempts, accuracy.
 */
export async function getOverview(
  studentId: string
): Promise<DashboardOverview> {
  const [studentRes, masteryRes, flashcardRes, quizRes] = await Promise.all([
    supabaseAdmin
      .from("students")
      .select("current_streak, longest_streak")
      .eq("id", studentId)
      .single(),
    supabaseAdmin
      .from("student_topic_mastery")
      .select("mastery_score")
      .eq("student_id", studentId),
    supabaseAdmin
      .from("flashcard_attempts")
      .select("correct")
      .eq("student_id", studentId),
    supabaseAdmin
      .from("quiz_attempts")
      .select("marks_awarded, marks_available")
      .eq("student_id", studentId),
  ]);

  const student = studentRes.data;
  const masteryRows = masteryRes.data ?? [];
  const flashcardRows = flashcardRes.data ?? [];
  const quizRows = quizRes.data ?? [];

  // Mastery % = (mastered topics / total tracked topics)
  const totalTracked = masteryRows.length;
  const masteredCount = masteryRows.filter(
    (r) => (r.mastery_score as number) >= MASTERY.MASTERED_THRESHOLD
  ).length;
  const masteryPercent =
    totalTracked > 0 ? Math.round((masteredCount / totalTracked) * 100) : 0;

  // Total attempts = flashcard + quiz
  const totalAttempts = flashcardRows.length + quizRows.length;

  // Accuracy = (correct flashcards + full-mark quizzes) / total
  const correctFlashcards = flashcardRows.filter(
    (r) => r.correct === true
  ).length;
  const correctQuizzes = quizRows.filter(
    (r) => (r.marks_awarded as number) >= (r.marks_available as number)
  ).length;
  const totalCorrect = correctFlashcards + correctQuizzes;
  const accuracy =
    totalAttempts > 0 ? Math.round((totalCorrect / totalAttempts) * 100) : 0;

  return {
    streak: student?.current_streak ?? 0,
    longest_streak: student?.longest_streak ?? 0,
    mastery_percent: masteryPercent,
    total_attempts: totalAttempts,
    accuracy,
  };
}

/**
 * Per-subject mastery breakdown.
 */
export async function getSubjectMastery(
  studentId: string
): Promise<SubjectMastery[]> {
  // Get all subjects
  const { data: subjects } = await supabaseAdmin
    .from("subjects")
    .select("code, name")
    .order("code");

  if (!subjects) return [];

  const results: SubjectMastery[] = [];

  for (const s of subjects) {
    // Get topics for this subject
    const { data: subjectRow } = await supabaseAdmin
      .from("subjects")
      .select("id")
      .eq("code", s.code)
      .single();

    const { data: topics } = await supabaseAdmin
      .from("syllabus_topics")
      .select("id")
      .eq("subject_id", subjectRow?.id);

    const totalTopics = topics?.length ?? 0;
    const topicIds = (topics ?? []).map((t) => t.id as string);

    // Get topic mastery for this subject
    let masteredTopics = 0;
    let masteryPercent = 0;
    if (topicIds.length > 0) {
      const { data: topicMastery } = await supabaseAdmin
        .from("student_topic_mastery")
        .select("mastery_score")
        .eq("student_id", studentId)
        .in("syllabus_topic_id", topicIds);

      masteredTopics = (topicMastery ?? []).filter(
        (r) => (r.mastery_score as number) >= MASTERY.MASTERED_THRESHOLD
      ).length;
      // Average mastery score across all topics (consistent with drill-down view)
      const avgScore = (topicMastery ?? []).reduce(
        (sum, r) => sum + (r.mastery_score as number), 0
      ) / totalTopics;
      masteryPercent = totalTopics > 0 ? Math.round(avgScore * 100) : 0;
    }

    // Quiz stats for this subject
    const { data: quizzes } = await supabaseAdmin
      .from("quiz_attempts")
      .select("marks_awarded, marks_available, question_id")
      .eq("student_id", studentId);

    const subjectQuizzes = (quizzes ?? []).filter((q) =>
      (q.question_id as string).startsWith(s.code as string)
    );

    const quizAttempts = subjectQuizzes.length;
    const quizCorrect = subjectQuizzes.filter(
      (q) => (q.marks_awarded as number) >= (q.marks_available as number)
    ).length;

    results.push({
      subject_code: s.code as string,
      subject_name: s.name as string,
      total_facts: totalTopics,
      mastered_facts: masteredTopics,
      mastery_percent: masteryPercent,
      quiz_attempts: quizAttempts,
      quiz_accuracy:
        quizAttempts > 0 ? Math.round((quizCorrect / quizAttempts) * 100) : 0,
    });
  }

  return results;
}

/**
 * Weakest facts — lowest mastery with errors.
 */
export async function getMisconceptions(
  limit = 20,
  studentId: string
): Promise<Misconception[]> {
  const { data, error } = await supabaseAdmin
    .from("student_fact_mastery")
    .select(
      `
      fact_id,
      mastery_score,
      times_tested,
      times_correct,
      last_error,
      atomic_facts!inner(fact_text, topic_name)
    `
    )
    .eq("student_id", studentId)
    .gt("times_tested", 0)
    .order("mastery_score", { ascending: true })
    .limit(limit);

  if (error) throw error;
  if (!data) return [];

  return data.map((row) => {
    const fact = row.atomic_facts as unknown as {
      fact_text: string;
      topic_name: string;
    };
    return {
      fact_id: row.fact_id as string,
      fact_text: fact.fact_text,
      topic_name: fact.topic_name,
      mastery_score: row.mastery_score as number,
      times_wrong:
        (row.times_tested as number) - (row.times_correct as number),
      last_error: row.last_error as string | null,
    };
  });
}

/**
 * Daily progress timeline.
 */
export async function getProgressTimeline(
  days = 30,
  studentId: string
): Promise<DayProgress[]> {
  const since = new Date();
  since.setDate(since.getDate() - days);

  const { data: flashcards } = await supabaseAdmin
    .from("flashcard_attempts")
    .select("correct, created_at")
    .eq("student_id", studentId)
    .gte("created_at", since.toISOString());

  if (!flashcards || flashcards.length === 0) return [];

  // Group by date
  const byDay = new Map<
    string,
    { cards: number; correct: number }
  >();

  for (const row of flashcards) {
    const date = (row.created_at as string).split("T")[0];
    const entry = byDay.get(date) ?? { cards: 0, correct: 0 };
    entry.cards++;
    if (row.correct) entry.correct++;
    byDay.set(date, entry);
  }

  return Array.from(byDay.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, stats]) => ({
      date,
      cards_reviewed: stats.cards,
      correct: stats.correct,
      mastery_snapshot:
        stats.cards > 0
          ? Math.round((stats.correct / stats.cards) * 100)
          : 0,
    }));
}

/**
 * Per-topic exam progress.
 */
export async function getExamProgress(
  studentId: string
): Promise<TopicProgress[]> {
  const { data, error } = await supabaseAdmin
    .from("student_topic_mastery")
    .select(
      `
      syllabus_topic_id,
      mastery_score,
      total_marks_earned,
      total_marks_available,
      questions_attempted,
      last_practiced,
      syllabus_topics!inner(topic_name, topic_code, subjects!inner(code))
    `
    )
    .eq("student_id", studentId)
    .order("mastery_score", { ascending: false });

  if (error) throw error;
  if (!data) return [];

  return data.map((row) => {
    const topic = row.syllabus_topics as unknown as {
      topic_name: string;
      topic_code: string;
      subjects: { code: string };
    };
    const earned = row.total_marks_earned as number;
    const available = row.total_marks_available as number;
    const score = row.mastery_score as number;

    return {
      syllabus_topic_id: row.syllabus_topic_id as string,
      topic_name: topic.topic_name,
      topic_code: topic.topic_code,
      subject_code: topic.subjects.code,
      marks_earned: earned,
      marks_available: available,
      mastery_percent: Math.round(score * 100),
      questions_attempted: row.questions_attempted as number,
      last_practiced: row.last_practiced as string | null,
    };
  });
}
