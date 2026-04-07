import { errorResponse } from "@/lib/errors";
import { endFlashcardSession } from "@/lib/services/orchestrators/flashcards";
import { z } from "zod";
import { getStudentId } from "@/lib/auth-helpers";

const schema = z.object({
  session_id: z.string().uuid(),
});

export async function POST(request: Request) {
  try {
    const studentId = await getStudentId();
    const body = await request.json();
    const input = schema.parse(body);

    const result = await endFlashcardSession({ sessionId: input.session_id, studentId });

    return Response.json(result);
  } catch (error) {
    return errorResponse(error);
  }
}
