import { errorResponse } from "@/lib/errors";
import { clarifyAnswers } from "@/lib/services/orchestrators/exam-practice";
import { z } from "zod";

export const maxDuration = 60;

const schema = z.object({
  session_id: z.string().uuid(),
  clarifications: z.array(
    z.object({
      question_number: z.string().min(1),
      typed_text: z.string().min(1),
    })
  ).min(1),
});

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const input = schema.parse(body);

    const result = await clarifyAnswers({
      sessionId: input.session_id,
      clarifications: input.clarifications,
    });

    return Response.json(result);
  } catch (error) {
    return errorResponse(error);
  }
}
