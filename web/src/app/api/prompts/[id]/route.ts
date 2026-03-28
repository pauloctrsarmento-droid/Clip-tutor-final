import { errorResponse, NotFoundError } from "@/lib/errors";
import { verifyPin } from "@/lib/auth";
import { getPromptById, getPromptBySlug, updatePrompt } from "@/lib/services/prompts";
import { updatePromptSchema } from "@/lib/validators/prompts";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    // Try by UUID first, then by slug
    const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id);
    const prompt = isUuid
      ? await getPromptById(id)
      : await getPromptBySlug(id);

    if (!prompt) throw new NotFoundError("Prompt");
    return Response.json(prompt);
  } catch (error) {
    return errorResponse(error);
  }
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await verifyPin(request);
    const { id } = await params;
    const body = await request.json();
    const input = updatePromptSchema.parse(body);
    const prompt = await updatePrompt(id, input.content, input.change_note);
    return Response.json(prompt);
  } catch (error) {
    return errorResponse(error);
  }
}
