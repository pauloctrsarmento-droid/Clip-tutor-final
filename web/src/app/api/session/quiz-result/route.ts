import { errorResponse } from "@/lib/errors";
import { handleQuizResult } from "@/lib/services/orchestrators/chat-tutor";
import { z } from "zod";

const schema = z.object({
  session_id: z.string().uuid(),
  correct: z.number().int().min(0),
  total: z.number().int().min(0),
});

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const input = schema.parse(body);
    const result = await handleQuizResult({
      sessionId: input.session_id,
      correct: input.correct,
      total: input.total,
    });
    return Response.json(result);
  } catch (error) {
    return errorResponse(error);
  }
}
