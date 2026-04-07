import { errorResponse } from "@/lib/errors";
import { getOverview } from "@/lib/services/dashboard";
import { getStudentId } from "@/lib/auth-helpers";

export async function GET() {
  try {
    const studentId = await getStudentId();
    const overview = await getOverview(studentId);
    return Response.json(overview);
  } catch (error) {
    return errorResponse(error);
  }
}
