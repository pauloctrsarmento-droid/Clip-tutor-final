import { errorResponse } from "@/lib/errors";
import { getSubjectMastery } from "@/lib/services/dashboard";
import { getStudentId } from "@/lib/auth-helpers";

export async function GET() {
  try {
    const studentId = await getStudentId();
    const subjects = await getSubjectMastery(studentId);
    return Response.json(subjects);
  } catch (error) {
    return errorResponse(error);
  }
}
