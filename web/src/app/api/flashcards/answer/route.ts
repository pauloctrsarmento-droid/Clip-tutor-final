import { errorResponse } from "@/lib/errors";
import { recordFlashcardResult } from "@/lib/services/orchestrators/flashcards";
import { z } from "zod";
import { getStudentId } from "@/lib/auth-helpers";

const schema = z.object({
  session_id: z.string().uuid(),
  fact_id: z.string().min(1),
  result: z.enum(["know", "partial", "dunno"]),
});

export async function POST(request: Request) {
  try {
    const studentId = await getStudentId();
    const body = await request.json();
    const input = schema.parse(body);

    const result = await recordFlashcardResult({
      sessionId: input.session_id,
      factId: input.fact_id,
      result: input.result,
      studentId,
    });

    return Response.json(result);
  } catch (error) {
    return errorResponse(error);
  }
}
