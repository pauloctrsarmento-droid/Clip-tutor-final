import { errorResponse } from "@/lib/errors";
import { getExamCalendar } from "@/lib/services/study-plan";
import { getStudentId } from "@/lib/auth-helpers";

export async function GET() {
  try {
    const studentId = await getStudentId();
    const calendar = await getExamCalendar(studentId);
    return Response.json(calendar);
  } catch (error) {
    return errorResponse(error);
  }
}
