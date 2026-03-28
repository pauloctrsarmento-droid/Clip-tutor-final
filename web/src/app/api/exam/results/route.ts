import { errorResponse, ValidationError } from "@/lib/errors";
import { getExamResults } from "@/lib/services/orchestrators/exam-practice";

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const sessionId = searchParams.get("session_id");

    if (!sessionId) {
      throw new ValidationError("session_id query parameter is required");
    }

    const result = await getExamResults(sessionId);

    if (!result) {
      return Response.json({ error: "Session not found", code: "NOT_FOUND" }, { status: 404 });
    }

    return Response.json(result);
  } catch (error) {
    return errorResponse(error);
  }
}
