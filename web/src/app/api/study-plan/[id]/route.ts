import { errorResponse } from "@/lib/errors";
import { verifyPin } from "@/lib/auth";
import { updatePlanEntrySchema } from "@/lib/validators/study-plan";
import { updatePlanEntry } from "@/lib/services/study-plan";

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await verifyPin(request);
    const { id } = await params;
    const body = await request.json();
    const input = updatePlanEntrySchema.parse(body);
    const entry = await updatePlanEntry(id, input);
    return Response.json(entry);
  } catch (error) {
    return errorResponse(error);
  }
}
