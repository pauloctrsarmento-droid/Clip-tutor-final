import { errorResponse } from "@/lib/errors";
import { resumeSession } from "@/lib/services/orchestrators/chat-tutor";
import { z } from "zod";

const schema = z.object({
  session_id: z.string().uuid(),
});

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const input = schema.parse(body);
    const result = await resumeSession(input.session_id);
    return Response.json(result);
  } catch (error) {
    return errorResponse(error);
  }
}
