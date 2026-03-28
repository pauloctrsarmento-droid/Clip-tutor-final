import { errorResponse } from "@/lib/errors";
import { verifyPin } from "@/lib/auth";
import { rescheduleSchema } from "@/lib/validators/study-plan";
import { rescheduleEntry } from "@/lib/services/study-plan";

export async function POST(request: Request) {
  try {
    await verifyPin(request);
    const body = await request.json();
    const input = rescheduleSchema.parse(body);
    const entry = await rescheduleEntry(input.entry_id, input.new_date, input.notes);
    return Response.json(entry, { status: 201 });
  } catch (error) {
    return errorResponse(error);
  }
}
