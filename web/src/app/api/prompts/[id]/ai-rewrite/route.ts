import { errorResponse } from "@/lib/errors";
import { verifyPin } from "@/lib/auth";
import { aiRewriteSchema } from "@/lib/validators/prompts";
import { aiRewritePrompt } from "@/lib/services/prompts";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await verifyPin(request);
    const { id } = await params;
    const body = await request.json();
    const input = aiRewriteSchema.parse(body);
    const rewritten = await aiRewritePrompt(id, input.description);
    return Response.json({ content: rewritten });
  } catch (error) {
    return errorResponse(error);
  }
}
