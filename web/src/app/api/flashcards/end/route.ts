import { errorResponse } from "@/lib/errors";
import { endFlashcardSession } from "@/lib/services/orchestrators/flashcards";
import { z } from "zod";

const schema = z.object({
  session_id: z.string().uuid(),
});

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const input = schema.parse(body);

    const result = await endFlashcardSession({ sessionId: input.session_id });

    return Response.json(result);
  } catch (error) {
    return errorResponse(error);
  }
}
