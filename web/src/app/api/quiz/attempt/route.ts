import { errorResponse } from "@/lib/errors";
import { verifyPin } from "@/lib/auth";
import { quizAttemptSchema } from "@/lib/validators/quiz";
import { recordQuizAttempt } from "@/lib/services/quiz";
import { getStudentId } from "@/lib/auth-helpers";

export async function POST(request: Request) {
  try {
    await verifyPin(request);
    const studentId = await getStudentId();
    const body = await request.json();
    const input = quizAttemptSchema.parse(body);

    await recordQuizAttempt({
      sessionId: input.session_id,
      questionId: input.question_id,
      marksAwarded: input.marks_awarded,
      marksAvailable: input.marks_available,
      studentId,
    });

    return Response.json({ success: true });
  } catch (error) {
    return errorResponse(error);
  }
}
