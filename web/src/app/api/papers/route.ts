import { supabaseAdmin } from "@/lib/supabase-server";
import { errorResponse } from "@/lib/errors";
import { verifyPin } from "@/lib/auth";

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    let query = supabaseAdmin
      .from("exam_papers")
      .select("*")
      .order("subject_code")
      .order("year", { ascending: false })
      .order("session");

    const subjectCode = url.searchParams.get("subject_code");
    if (subjectCode) {
      const value = subjectCode.startsWith("eq.") ? subjectCode.slice(3) : subjectCode;
      query = query.eq("subject_code", value);
    }

    const { data, error } = await query;
    if (error) throw error;
    return Response.json(data ?? []);
  } catch (error) {
    return errorResponse(error);
  }
}

export async function POST(request: Request) {
  try {
    await verifyPin(request);
    const body = await request.json();

    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const { data, error } = await supabaseAdmin
      .from("exam_papers")
      .insert({
        id: body.id,
        subject_code: body.subject_code,
        session: body.session,
        variant: body.variant,
        year: body.year,
        total_questions: body.total_questions ?? 0,
        total_marks: body.total_marks ?? 0,
        qp_url: `${supabaseUrl}/storage/v1/object/public/papers/${body.id}/qp.pdf`,
        ms_url: `${supabaseUrl}/storage/v1/object/public/papers/${body.id}/ms.pdf`,
      })
      .select()
      .single();

    if (error) throw error;
    return Response.json(data, { status: 201 });
  } catch (error) {
    return errorResponse(error);
  }
}
