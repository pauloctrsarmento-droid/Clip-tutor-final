import { errorResponse } from "@/lib/errors";
import { getSubjectMastery } from "@/lib/services/dashboard";

export async function GET() {
  try {
    const subjects = await getSubjectMastery();
    return Response.json(subjects);
  } catch (error) {
    return errorResponse(error);
  }
}
