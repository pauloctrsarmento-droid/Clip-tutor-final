import { supabaseAdmin } from "@/lib/supabase-server";
import { errorResponse, NotFoundError, ValidationError } from "@/lib/errors";
import { verifyPin } from "@/lib/auth";

export async function PUT(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    verifyPin(request);
    const { id } = await params;
    const body = await request.json();

    const updates: Record<string, unknown> = {};
    if (typeof body.fact_text === "string") {
      if (!body.fact_text.trim()) throw new ValidationError("fact_text cannot be empty");
      updates.fact_text = body.fact_text.trim();
    }
    if (typeof body.is_active === "boolean") updates.is_active = body.is_active;

    const { data, error } = await supabaseAdmin
      .from("atomic_facts")
      .update(updates)
      .eq("id", id)
      .select()
      .single();

    if (error) throw error;
    if (!data) throw new NotFoundError("Fact");

    return Response.json(data);
  } catch (error) {
    return errorResponse(error);
  }
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    verifyPin(request);
    const { id } = await params;

    // Soft delete
    const { data, error } = await supabaseAdmin
      .from("atomic_facts")
      .update({ is_active: false })
      .eq("id", id)
      .select()
      .single();

    if (error) throw error;
    if (!data) throw new NotFoundError("Fact");

    return Response.json({ success: true });
  } catch (error) {
    return errorResponse(error);
  }
}
