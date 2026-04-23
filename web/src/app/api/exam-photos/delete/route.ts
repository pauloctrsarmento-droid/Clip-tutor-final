import { supabaseAdmin } from "@/lib/supabase-server";
import { errorResponse, ValidationError } from "@/lib/errors";

/**
 * DELETE /api/exam-photos/delete
 * Removes a single photo from the exam-photos bucket.
 * Body: { sessionId: string, filename: string }
 *
 * Intentionally unauthenticated: sessionId UUID acts as capability token,
 * matching the mobile upload flow (the QR code encodes the same secret).
 * filename is scoped to the sessionId folder to prevent path traversal.
 */
export async function DELETE(request: Request) {
  try {
    const body = (await request.json()) as {
      sessionId?: string;
      filename?: string;
    };
    const { sessionId, filename } = body;

    if (!sessionId || !filename) {
      throw new ValidationError("sessionId and filename are required");
    }

    // Prevent path traversal: filename must be a leaf, not a path
    if (filename.includes("/") || filename.includes("..") || filename.includes("\\")) {
      throw new ValidationError("Invalid filename");
    }

    const path = `${sessionId}/${filename}`;
    const { error } = await supabaseAdmin.storage
      .from("exam-photos")
      .remove([path]);

    if (error) throw error;

    return Response.json({ ok: true });
  } catch (err) {
    return errorResponse(err);
  }
}
