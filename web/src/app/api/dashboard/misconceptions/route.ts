import { errorResponse } from "@/lib/errors";
import { getMisconceptions } from "@/lib/services/dashboard";
import { getStudentId } from "@/lib/auth-helpers";

export async function GET(request: Request) {
  try {
    const studentId = await getStudentId();
    const url = new URL(request.url);
    const limit = Number(url.searchParams.get("limit") ?? "20");
    const misconceptions = await getMisconceptions(limit, studentId);
    return Response.json(misconceptions);
  } catch (error) {
    return errorResponse(error);
  }
}
