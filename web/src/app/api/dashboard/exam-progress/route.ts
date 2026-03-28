import { errorResponse } from "@/lib/errors";
import { getExamProgress } from "@/lib/services/dashboard";

export async function GET() {
  try {
    const progress = await getExamProgress();
    return Response.json(progress);
  } catch (error) {
    return errorResponse(error);
  }
}
