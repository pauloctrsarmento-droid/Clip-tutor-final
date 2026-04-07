import { errorResponse } from "@/lib/errors";
import { endSession } from "@/lib/services/orchestrators/chat-tutor";
import { z } from "zod";
import { getStudentId } from "@/lib/auth-helpers";

const schema = z.object({
  session_id: z.string().uuid(),
  reason: z.enum(["completed", "interrupted"]),
});

export async function POST(request: Request) {
  try {
    const studentId = await getStudentId();
    const body = await request.json();
    const input = schema.parse(body);
    const result = await endSession(input.session_id, input.reason, studentId);
    return Response.json(result);
  } catch (error) {
    return errorResponse(error);
  }
}
