import { supabaseAdmin } from "@/lib/supabase-server";
import { errorResponse } from "@/lib/errors";
import { verifyPin } from "@/lib/auth";

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await verifyPin(request);
    const { id } = await params;

    // Delete from storage
    await supabaseAdmin.storage.from("papers").remove([
      `${id}/qp.pdf`,
      `${id}/ms.pdf`,
    ]);

    // Delete from DB (cascades to exam_questions)
    const { error } = await supabaseAdmin
      .from("exam_papers")
      .delete()
      .eq("id", id);

    if (error) throw error;
    return Response.json({ success: true });
  } catch (error) {
    return errorResponse(error);
  }
}
