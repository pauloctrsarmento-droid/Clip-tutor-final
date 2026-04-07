import { errorResponse } from "@/lib/errors";
import { getExamProgress } from "@/lib/services/dashboard";
import { getStudentId } from "@/lib/auth-helpers";

export async function GET() {
  try {
    const studentId = await getStudentId();
    const progress = await getExamProgress(studentId);
    return Response.json(progress);
  } catch (error) {
    return errorResponse(error);
  }
}
