import { errorResponse } from "@/lib/errors";
import { startQuizSession } from "@/lib/services/orchestrators/quiz";
import { z } from "zod";

const schema = z.object({
  subject_code: z.string().min(1),
  topic_id: z.string().uuid().optional(),
  count: z.number().int().min(1).max(40).optional(),
  question_type: z.enum(["all", "mcq", "text", "numeric"]).optional(),
  difficulty: z.enum(["easy", "medium", "hard"]).optional(),
});

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const input = schema.parse(body);

    const result = await startQuizSession({
      subjectCode: input.subject_code,
      topicId: input.topic_id,
      count: input.count,
      questionType: input.question_type,
      difficulty: input.difficulty,
    });

    return Response.json(result);
  } catch (error) {
    return errorResponse(error);
  }
}
