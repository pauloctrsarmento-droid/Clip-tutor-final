import { errorResponse } from "@/lib/errors";
import { verifyPin } from "@/lib/auth";
import { endSession } from "@/lib/services/sessions";

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await verifyPin(request);
    const { id } = await params;
    const session = await endSession(id);
    return Response.json(session);
  } catch (error) {
    return errorResponse(error);
  }
}
