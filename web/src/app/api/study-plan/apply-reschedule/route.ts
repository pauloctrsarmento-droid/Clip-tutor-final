import { errorResponse } from "@/lib/errors";
import { verifyPin } from "@/lib/auth";
import { applyRescheduleSchema } from "@/lib/validators/study-plan";
import { applyReschedule } from "@/lib/services/study-plan";
import { getStudentId } from "@/lib/auth-helpers";

export async function POST(request: Request) {
  try {
    const studentId = await getStudentId();
    await verifyPin(request);
    const body = await request.json();
    const input = applyRescheduleSchema.parse(body);

    const count = await applyReschedule(input.entries, studentId);
    return Response.json({ success: true, entries_created: count });
  } catch (error) {
    return errorResponse(error);
  }
}
