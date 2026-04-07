import { errorResponse } from "@/lib/errors";
import { sendMessage } from "@/lib/services/orchestrators/chat-tutor";
import { z } from "zod";
import { getStudentId } from "@/lib/auth-helpers";

export const maxDuration = 60;

const attachmentSchema = z.object({
  url: z.string(),
  name: z.string(),
});

const schema = z.object({
  session_id: z.string().uuid(),
  message: z.string().min(1),
  // Support both legacy images (string[]) and new attachments
  images: z.array(z.string()).optional(),
  attachments: z.array(attachmentSchema).optional(),
});

export async function POST(request: Request) {
  try {
    const studentId = await getStudentId();
    const body = await request.json();
    const input = schema.parse(body);

    // Normalize: convert legacy images to attachments format
    const attachments = input.attachments ?? input.images?.map((url, i) => ({
      url,
      name: `Image ${i + 1}`,
    }));

    const stream = await sendMessage({
      sessionId: input.session_id,
      message: input.message,
      attachments,
      studentId,
    });

    return new Response(stream, {
      headers: {
        "Content-Type": "text/plain; charset=utf-8",
        "Transfer-Encoding": "chunked",
        "Cache-Control": "no-cache",
      },
    });
  } catch (error) {
    return errorResponse(error);
  }
}
