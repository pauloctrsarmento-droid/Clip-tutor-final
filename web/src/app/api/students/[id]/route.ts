import { supabaseAdmin } from "@/lib/supabase-server";
import { errorResponse, NotFoundError } from "@/lib/errors";
import { verifyPin } from "@/lib/auth";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const { data, error } = await supabaseAdmin
      .from("students")
      .select("*")
      .eq("id", id)
      .single();

    if (error) throw error;
    if (!data) throw new NotFoundError("Student");
    return Response.json(data);
  } catch (error) {
    return errorResponse(error);
  }
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await verifyPin(request);
    const { id } = await params;
    const body = await request.json();

    const { data, error } = await supabaseAdmin
      .from("students")
      .update({ tutor_prompt: body.tutor_prompt })
      .eq("id", id)
      .select()
      .single();

    if (error) throw error;
    return Response.json(data);
  } catch (error) {
    return errorResponse(error);
  }
}
