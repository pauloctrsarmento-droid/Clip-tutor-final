import { supabaseAdmin } from "@/lib/supabase-server";
import { errorResponse, NotFoundError } from "@/lib/errors";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    const { data: subject } = await supabaseAdmin
      .from("subjects")
      .select("id, code, name")
      .eq("id", id)
      .single();

    if (!subject) throw new NotFoundError("Subject");

    const { data: topics, error } = await supabaseAdmin
      .from("syllabus_topics")
      .select("id, topic_code, topic_name, description, display_order, created_at")
      .eq("subject_id", id)
      .order("display_order");

    if (error) throw error;

    const { data: factCounts } = await supabaseAdmin
      .from("atomic_facts")
      .select("syllabus_topic_id")
      .in(
        "syllabus_topic_id",
        (topics ?? []).map((t) => t.id)
      );

    const factCountMap = new Map<string, number>();
    for (const f of factCounts ?? []) {
      if (f.syllabus_topic_id) {
        factCountMap.set(
          f.syllabus_topic_id,
          (factCountMap.get(f.syllabus_topic_id) ?? 0) + 1
        );
      }
    }

    const result = (topics ?? []).map((t) => ({
      ...t,
      fact_count: factCountMap.get(t.id) ?? 0,
    }));

    return Response.json({ subject, topics: result });
  } catch (error) {
    return errorResponse(error);
  }
}
