import { errorResponse } from "@/lib/errors";
import { startFlashcardSession } from "@/lib/services/orchestrators/flashcards";
import { z } from "zod";
import { getStudentId } from "@/lib/auth-helpers";

const schema = z.object({
  subject_code: z.string().min(1),
  topic_id: z.string().uuid().optional(),
  limit: z.number().int().min(1).max(50).optional(),
});

export async function POST(request: Request) {
  try {
    const studentId = await getStudentId();
    const body = await request.json();
    const input = schema.parse(body);

    const result = await startFlashcardSession({
      subjectCode: input.subject_code,
      topicId: input.topic_id,
      limit: input.limit,
      studentId,
    });

    return Response.json(result);
  } catch (error) {
    return errorResponse(error);
  }
}
