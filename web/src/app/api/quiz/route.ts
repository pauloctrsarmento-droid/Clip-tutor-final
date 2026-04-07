import { errorResponse } from "@/lib/errors";
import { quizQuerySchema } from "@/lib/validators/quiz";
import { getQuizQuestions } from "@/lib/services/quiz";
import { getStudentId } from "@/lib/auth-helpers";

export async function GET(request: Request) {
  try {
    const studentId = await getStudentId();
    const url = new URL(request.url);
    const query = quizQuerySchema.parse({
      subject: url.searchParams.get("subject") ?? undefined,
      topic: url.searchParams.get("topic") ?? undefined,
      count: url.searchParams.get("count") ?? undefined,
      response_type: url.searchParams.get("response_type") ?? undefined,
    });

    const questions = await getQuizQuestions({
      subjectCode: query.subject,
      topicId: query.topic,
      count: query.count,
      responseType: query.response_type,
      studentId,
    });

    return Response.json(questions);
  } catch (error) {
    return errorResponse(error);
  }
}
