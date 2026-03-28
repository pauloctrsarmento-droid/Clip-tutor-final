import { errorResponse } from "@/lib/errors";
import { verifyPin } from "@/lib/auth";
import { updateSuggestion } from "@/lib/services/suggestions";

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await verifyPin(request);
    const { id } = await params;
    const body = await request.json();

    await updateSuggestion(id, {
      dismissed: body.dismissed,
      acted_on: body.acted_on,
    });

    return Response.json({ success: true });
  } catch (error) {
    return errorResponse(error);
  }
}
