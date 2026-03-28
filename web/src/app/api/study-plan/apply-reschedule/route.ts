import { errorResponse } from "@/lib/errors";
import { verifyPin } from "@/lib/auth";
import { applyRescheduleSchema } from "@/lib/validators/study-plan";
import { applyReschedule } from "@/lib/services/study-plan";

export async function POST(request: Request) {
  try {
    await verifyPin(request);
    const body = await request.json();
    const input = applyRescheduleSchema.parse(body);

    const count = await applyReschedule(input.entries);
    return Response.json({ success: true, entries_created: count });
  } catch (error) {
    return errorResponse(error);
  }
}
