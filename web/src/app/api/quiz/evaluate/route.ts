import { errorResponse } from "@/lib/errors";
import { evaluateAnswer } from "@/lib/services/orchestrators/quiz";
import { z } from "zod";

const schema = z.object({
  session_id: z.string().uuid(),
  question_id: z.string().min(1),
  student_answer: z.string().min(1),
});

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const input = schema.parse(body);

    const result = await evaluateAnswer({
      sessionId: input.session_id,
      questionId: input.question_id,
      studentAnswer: input.student_answer,
    });

    return Response.json(result);
  } catch (error) {
    return errorResponse(error);
  }
}
