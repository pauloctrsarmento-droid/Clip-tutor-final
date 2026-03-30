import { errorResponse } from "@/lib/errors";
import { sendMessage } from "@/lib/services/orchestrators/chat-tutor";
import { z } from "zod";

const schema = z.object({
  session_id: z.string().uuid(),
  message: z.string().min(1),
  images: z.array(z.string().url()).optional(),
});

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const input = schema.parse(body);

    const { stream, afterStream } = await sendMessage({
      sessionId: input.session_id,
      message: input.message,
      images: input.images,
    });

    // Pipe the stream to the client
    const response = new Response(stream, {
      headers: {
        "Content-Type": "text/plain; charset=utf-8",
        "Transfer-Encoding": "chunked",
        "Cache-Control": "no-cache",
      },
    });

    // Run afterStream in the background (saves to DB, resolves diagrams)
    afterStream().catch((err) => {
      console.error("[session/message] afterStream error:", err);
    });

    return response;
  } catch (error) {
    return errorResponse(error);
  }
}
