import { supabaseAdmin } from "@/lib/supabase-server";
import { errorResponse } from "@/lib/errors";
import { NextRequest } from "next/server";

/**
 * GET /api/exam-photos/list?sessionId=xxx
 * Lists all uploaded photos for a given exam session.
 */
export async function GET(request: NextRequest) {
  try {
    const sessionId = request.nextUrl.searchParams.get("sessionId");
    if (!sessionId) {
      return Response.json({ error: "Missing sessionId" }, { status: 400 });
    }

    const { data, error } = await supabaseAdmin.storage
      .from("exam-photos")
      .list(sessionId, { sortBy: { column: "created_at", order: "asc" } });

    if (error) throw error;

    const photos = (data ?? [])
      .filter((f) => !f.name.startsWith("."))
      .map((f) => {
        const { data: urlData } = supabaseAdmin.storage
          .from("exam-photos")
          .getPublicUrl(`${sessionId}/${f.name}`);
        return {
          name: f.name,
          url: urlData.publicUrl,
          created_at: f.created_at,
        };
      });

    return Response.json({ photos });
  } catch (err) {
    return errorResponse(err);
  }
}
