import { errorResponse } from "@/lib/errors";
import { getTodayPlan } from "@/lib/services/study-plan";

export async function GET() {
  try {
    const result = await getTodayPlan();
    return Response.json(result);
  } catch (error) {
    return errorResponse(error);
  }
}
