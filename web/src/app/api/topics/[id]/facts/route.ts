import { supabaseAdmin } from "@/lib/supabase-server";
import { errorResponse, NotFoundError, ValidationError } from "@/lib/errors";
import { verifyPin } from "@/lib/auth";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    const { data: facts, error } = await supabaseAdmin
      .from("atomic_facts")
      .select("*")
      .eq("syllabus_topic_id", id)
      .order("id");

    if (error) throw error;

    return Response.json(facts ?? []);
  } catch (error) {
    return errorResponse(error);
  }
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    verifyPin(request);
    const { id: topicId } = await params;
    const body = await request.json();

    if (!body.fact_text || typeof body.fact_text !== "string") {
      throw new ValidationError("fact_text is required");
    }

    const { data: topic } = await supabaseAdmin
      .from("syllabus_topics")
      .select("id, topic_code, topic_name, subject_id")
      .eq("id", topicId)
      .single();

    if (!topic) throw new NotFoundError("Topic");

    const { data: subject } = await supabaseAdmin
      .from("subjects")
      .select("code")
      .eq("id", topic.subject_id)
      .single();

    const { data: existingFacts } = await supabaseAdmin
      .from("atomic_facts")
      .select("id")
      .eq("syllabus_topic_id", topicId)
      .order("id", { ascending: false })
      .limit(1);

    let nextNum = 1;
    if (existingFacts && existingFacts.length > 0) {
      const lastId = existingFacts[0].id;
      const match = lastId.match(/F(\d+)$/);
      if (match) nextNum = parseInt(match[1], 10) + 1;
    }

    const factId = `${topic.topic_code}_F${String(nextNum).padStart(2, "0")}`;

    const { data, error } = await supabaseAdmin
      .from("atomic_facts")
      .insert({
        id: factId,
        subject_code: subject?.code ?? "",
        topic_id: topic.topic_code,
        topic_name: topic.topic_name,
        fact_text: body.fact_text,
        syllabus_topic_id: topicId,
        is_active: true,
        difficulty: body.difficulty ?? 1,
        has_formula: false,
        prerequisites: [],
        command_words: [],
      })
      .select()
      .single();

    if (error) throw error;

    return Response.json(data, { status: 201 });
  } catch (error) {
    return errorResponse(error);
  }
}
