import { errorResponse } from "@/lib/errors";
import { studyPlanQuerySchema, createPlanEntriesBatchSchema, createPlanEntrySchema } from "@/lib/validators/study-plan";
import { getPlanEntries, getWeekPlan, createPlanEntries } from "@/lib/services/study-plan";
import { getStudentId } from "@/lib/auth-helpers";
import { verifyPin } from "@/lib/auth";

export async function GET(request: Request) {
  try {
    const studentId = await getStudentId();
    const url = new URL(request.url);
    const query = studyPlanQuerySchema.parse({
      week: url.searchParams.get("week") ?? undefined,
      from: url.searchParams.get("from") ?? undefined,
      to: url.searchParams.get("to") ?? undefined,
      status: url.searchParams.get("status") ?? undefined,
    });

    if (query.week === "current") {
      const entries = await getWeekPlan(0, studentId);
      return Response.json(entries);
    }
    if (query.week === "next") {
      const entries = await getWeekPlan(1, studentId);
      return Response.json(entries);
    }

    const entries = await getPlanEntries({
      from: query.from,
      to: query.to,
      status: query.status,
      studentId,
    });
    return Response.json(entries);
  } catch (error) {
    return errorResponse(error);
  }
}

export async function POST(request: Request) {
  try {
    verifyPin(request);
    const studentId = await getStudentId();
    const body = await request.json();

    // Accept single entry or batch
    const entries = Array.isArray(body.entries)
      ? createPlanEntriesBatchSchema.parse(body).entries
      : [createPlanEntrySchema.parse(body)];

    const created = await createPlanEntries(entries, studentId);
    return Response.json(created, { status: 201 });
  } catch (error) {
    return errorResponse(error);
  }
}
