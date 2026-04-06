import { supabaseAdmin } from "@/lib/supabase-server";
import { errorResponse } from "@/lib/errors";

/**
 * POST /api/exam-photos/upload
 * Receives a photo from the mobile upload page and stores it in Supabase Storage.
 * Body: FormData with "photo" (file) and "sessionId" (string)
 */
export async function POST(request: Request) {
  try {
    const formData = await request.formData();
    const photo = formData.get("photo") as File | null;
    const sessionId = formData.get("sessionId") as string | null;

    if (!photo || !sessionId) {
      return Response.json(
        { error: "Missing photo or sessionId" },
        { status: 400 }
      );
    }

    // Generate unique filename
    const ext = photo.name.split(".").pop() ?? "jpg";
    const filename = `${sessionId}/${Date.now()}.${ext}`;

    const arrayBuffer = await photo.arrayBuffer();
    const buffer = new Uint8Array(arrayBuffer);

    const { error } = await supabaseAdmin.storage
      .from("exam-photos")
      .upload(filename, buffer, {
        contentType: photo.type,
        upsert: false,
      });

    if (error) throw error;

    const { data: urlData } = supabaseAdmin.storage
      .from("exam-photos")
      .getPublicUrl(filename);

    return Response.json({ url: urlData.publicUrl, filename });
  } catch (err) {
    return errorResponse(err);
  }
}
