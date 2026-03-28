import { errorResponse } from "@/lib/errors";
import { getAllPrompts } from "@/lib/services/prompts";

export async function GET() {
  try {
    const prompts = await getAllPrompts();
    return Response.json(prompts);
  } catch (error) {
    return errorResponse(error);
  }
}
