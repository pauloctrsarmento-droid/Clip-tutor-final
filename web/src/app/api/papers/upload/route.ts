import { supabaseAdmin } from "@/lib/supabase-server";
import { errorResponse } from "@/lib/errors";
import { verifyPin } from "@/lib/auth";

export async function POST(request: Request) {
  try {
    await verifyPin(request);
    const formData = await request.formData();
    const paperId = formData.get("paper_id") as string;

    if (!paperId) {
      return Response.json({ error: "paper_id required" }, { status: 400 });
    }

    const qpFile = formData.get("qp") as File | null;
    const msFile = formData.get("ms") as File | null;

    const results: Record<string, boolean> = {};

    if (qpFile) {
      const buffer = Buffer.from(await qpFile.arrayBuffer());
      const { error } = await supabaseAdmin.storage
        .from("papers")
        .upload(`${paperId}/qp.pdf`, buffer, {
          contentType: "application/pdf",
          upsert: true,
        });
      results.qp = !error;
    }

    if (msFile) {
      const buffer = Buffer.from(await msFile.arrayBuffer());
      const { error } = await supabaseAdmin.storage
        .from("papers")
        .upload(`${paperId}/ms.pdf`, buffer, {
          contentType: "application/pdf",
          upsert: true,
        });
      results.ms = !error;
    }

    return Response.json({ uploaded: results });
  } catch (error) {
    return errorResponse(error);
  }
}
