import { errorResponse } from "@/lib/errors";
import { getExamHistory } from "@/lib/services/orchestrators/exam-practice";

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const subjectCode = searchParams.get("subject_code") ?? undefined;

    const result = await getExamHistory({ subjectCode });

    return Response.json({ sessions: result });
  } catch (error) {
    return errorResponse(error);
  }
}
