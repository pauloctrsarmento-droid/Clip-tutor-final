import { errorResponse } from "@/lib/errors";
import { getExamHistory } from "@/lib/services/orchestrators/exam-practice";
import { getStudentId } from "@/lib/auth-helpers";

export async function GET(request: Request) {
  try {
    const studentId = await getStudentId();
    const { searchParams } = new URL(request.url);
    const subjectCode = searchParams.get("subject_code") ?? undefined;

    const result = await getExamHistory({ subjectCode, studentId });

    return Response.json({ sessions: result });
  } catch (error) {
    return errorResponse(error);
  }
}
