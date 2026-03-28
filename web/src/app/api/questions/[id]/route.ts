import { errorResponse, NotFoundError } from "@/lib/errors";
import { getQuestionById } from "@/lib/services/quiz";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const question = await getQuestionById(id);

    if (!question) {
      throw new NotFoundError("Question");
    }

    return Response.json(question);
  } catch (error) {
    return errorResponse(error);
  }
}
