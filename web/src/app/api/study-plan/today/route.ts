import { errorResponse } from "@/lib/errors";
import { getTodayPlan } from "@/lib/services/study-plan";
import { getStudentId } from "@/lib/auth-helpers";

export async function GET() {
  try {
    const studentId = await getStudentId();
    const result = await getTodayPlan(studentId);
    return Response.json(result);
  } catch (error) {
    return errorResponse(error);
  }
}
