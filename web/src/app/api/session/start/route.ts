import { errorResponse } from "@/lib/errors";
import { startSession } from "@/lib/services/orchestrators/chat-tutor";
import { z } from "zod";
import { getStudentId } from "@/lib/auth-helpers";

const schema = z.object({
  mood: z.enum(["unmotivated", "normal", "good", "motivated"]),
  subject_code: z.string().optional(),
  topic_id: z.string().uuid().optional(),
  mode: z.enum(["tutor", "review", "companion"]).optional(),
  parent_session_id: z.string().uuid().optional(),
});

export async function POST(request: Request) {
  try {
    const studentId = await getStudentId();
    const body = await request.json();
    const input = schema.parse(body);
    const result = await startSession(input.mood, studentId, {
      subjectCode: input.subject_code,
      topicId: input.topic_id,
      mode: input.mode,
      parentSessionId: input.parent_session_id,
    });
    return Response.json(result);
  } catch (error) {
    return errorResponse(error);
  }
}
