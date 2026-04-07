import { errorResponse } from "@/lib/errors";
import { getFlashcardExplanation } from "@/lib/services/orchestrators/flashcards";
import { z } from "zod";
import { getStudentId } from "@/lib/auth-helpers";

const schema = z.object({
  fact_id: z.string().min(1),
  question: z.string().optional(),
});

export async function POST(request: Request) {
  try {
    const studentId = await getStudentId();
    const body = await request.json();
    const input = schema.parse(body);

    const result = await getFlashcardExplanation({ factId: input.fact_id, question: input.question, studentId });

    return Response.json(result);
  } catch (error) {
    return errorResponse(error);
  }
}
