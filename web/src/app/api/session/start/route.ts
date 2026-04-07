import { errorResponse } from "@/lib/errors";
import { startSession } from "@/lib/services/orchestrators/chat-tutor";
import { z } from "zod";
import { getStudentId } from "@/lib/auth-helpers";

const schema = z.object({
  mood: z.enum(["unmotivated", "normal", "good", "motivated"]),
});

export async function POST(request: Request) {
  try {
    const studentId = await getStudentId();
    const body = await request.json();
    const input = schema.parse(body);
    const result = await startSession(input.mood, studentId);
    return Response.json(result);
  } catch (error) {
    return errorResponse(error);
  }
}
