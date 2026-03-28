import { errorResponse } from "@/lib/errors";
import { verifyPin } from "@/lib/auth";
import { revertPromptSchema } from "@/lib/validators/prompts";
import { revertPrompt } from "@/lib/services/prompts";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await verifyPin(request);
    const { id } = await params;
    const body = await request.json();
    const input = revertPromptSchema.parse(body);
    const prompt = await revertPrompt(id, input.version_id);
    return Response.json(prompt);
  } catch (error) {
    return errorResponse(error);
  }
}
