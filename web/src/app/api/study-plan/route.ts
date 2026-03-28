import { errorResponse } from "@/lib/errors";
import { studyPlanQuerySchema } from "@/lib/validators/study-plan";
import { getPlanEntries, getWeekPlan } from "@/lib/services/study-plan";

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const query = studyPlanQuerySchema.parse({
      week: url.searchParams.get("week") ?? undefined,
      from: url.searchParams.get("from") ?? undefined,
      to: url.searchParams.get("to") ?? undefined,
      status: url.searchParams.get("status") ?? undefined,
    });

    if (query.week === "current") {
      const entries = await getWeekPlan(0);
      return Response.json(entries);
    }
    if (query.week === "next") {
      const entries = await getWeekPlan(1);
      return Response.json(entries);
    }

    const entries = await getPlanEntries({
      from: query.from,
      to: query.to,
      status: query.status,
    });
    return Response.json(entries);
  } catch (error) {
    return errorResponse(error);
  }
}
