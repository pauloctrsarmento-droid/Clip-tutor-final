import { supabaseAdmin } from "@/lib/supabase-server";
import { errorResponse, NotFoundError } from "@/lib/errors";
import { verifyPin } from "@/lib/auth";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    const { data: topic } = await supabaseAdmin
      .from("syllabus_topics")
      .select("id, topic_code, topic_name, description, display_order, subject_id, created_at")
      .eq("id", id)
      .single();

    if (!topic) throw new NotFoundError("Topic");

    return Response.json(topic);
  } catch (error) {
    return errorResponse(error);
  }
}

export async function PUT(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    verifyPin(request);
    const { id } = await params;
    const body = await request.json();

    const updates: Record<string, unknown> = {};
    if (typeof body.topic_name === "string") updates.topic_name = body.topic_name;
    if (typeof body.description === "string" || body.description === null)
      updates.description = body.description;

    const { data, error } = await supabaseAdmin
      .from("syllabus_topics")
      .update(updates)
      .eq("id", id)
      .select()
      .single();

    if (error) throw error;
    if (!data) throw new NotFoundError("Topic");

    return Response.json(data);
  } catch (error) {
    return errorResponse(error);
  }
}
