import { supabaseAdmin } from "@/lib/supabase-server";
import { STUDENT_ID } from "@/lib/constants";
import { errorResponse } from "@/lib/errors";

/**
 * GET /api/papers/exposure?subject_code=0620
 *
 * Returns per-paper exposure info: how many questions the student
 * has already seen (via quiz/flashcard) for each exam paper.
 */
export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const subjectCode = searchParams.get("subject_code");
    const studentId = STUDENT_ID;

    // Get all question IDs the student has seen in quiz mode
    const { data: exposures } = await supabaseAdmin
      .from("question_exposure")
      .select("question_id")
      .eq("student_id", studentId)
      .eq("mode", "quiz");

    const seenIds = new Set(
      (exposures ?? []).map((e) => e.question_id as string),
    );

    // Get question counts per paper
    let query = supabaseAdmin
      .from("exam_questions")
      .select("id, paper_id")
      .eq("is_stem", false);

    if (subjectCode) {
      query = query.eq("subject_code", subjectCode);
    }

    const { data: questions, error } = await query;
    if (error) throw error;

    // Aggregate: per paper, count total and seen
    const paperMap = new Map<
      string,
      { total: number; seen: number }
    >();

    for (const q of questions ?? []) {
      const paperId = q.paper_id as string;
      const qId = q.id as string;
      const entry = paperMap.get(paperId) ?? { total: 0, seen: 0 };
      entry.total += 1;
      if (seenIds.has(qId)) entry.seen += 1;
      paperMap.set(paperId, entry);
    }

    const result = Array.from(paperMap.entries()).map(
      ([paper_id, { total, seen }]) => ({
        paper_id,
        total_questions: total,
        seen_in_quiz: seen,
      }),
    );

    return Response.json(result);
  } catch (error) {
    return errorResponse(error);
  }
}
