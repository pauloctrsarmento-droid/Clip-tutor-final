import { errorResponse } from "@/lib/errors";
import { pauseSession } from "@/lib/services/orchestrators/chat-tutor";
import { z } from "zod";

const schema = z.object({
  session_id: z.string().uuid(),
});

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const input = schema.parse(body);
    await pauseSession(input.session_id);
    return Response.json({ ok: true });
  } catch (error) {
    return errorResponse(error);
  }
}
