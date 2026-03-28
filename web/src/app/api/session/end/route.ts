import { errorResponse } from "@/lib/errors";
import { endSession } from "@/lib/services/orchestrators/chat-tutor";
import { z } from "zod";

const schema = z.object({
  session_id: z.string().uuid(),
  reason: z.enum(["completed", "interrupted"]),
});

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const input = schema.parse(body);
    const result = await endSession(input.session_id, input.reason);
    return Response.json(result);
  } catch (error) {
    return errorResponse(error);
  }
}
