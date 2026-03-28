import { errorResponse } from "@/lib/errors";
import { getPromptVersions } from "@/lib/services/prompts";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const versions = await getPromptVersions(id);
    return Response.json(versions);
  } catch (error) {
    return errorResponse(error);
  }
}
