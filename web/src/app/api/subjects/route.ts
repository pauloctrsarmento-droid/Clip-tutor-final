import { supabaseAdmin } from "@/lib/supabase-server";
import { errorResponse } from "@/lib/errors";

export async function GET() {
  try {
    const { data: subjects, error } = await supabaseAdmin
      .from("subjects")
      .select("id, code, name, created_at")
      .order("code");

    if (error) throw error;

    const { data: topicCounts, error: tcError } = await supabaseAdmin
      .from("syllabus_topics")
      .select("subject_id");

    if (tcError) throw tcError;

    const { data: factCounts, error: fcError } = await supabaseAdmin
      .from("atomic_facts")
      .select("syllabus_topic_id");

    if (fcError) throw fcError;

    const topicCountMap = new Map<string, number>();
    for (const t of topicCounts ?? []) {
      topicCountMap.set(t.subject_id, (topicCountMap.get(t.subject_id) ?? 0) + 1);
    }

    const factsByTopic = new Map<string, number>();
    for (const f of factCounts ?? []) {
      if (f.syllabus_topic_id) {
        factsByTopic.set(
          f.syllabus_topic_id,
          (factsByTopic.get(f.syllabus_topic_id) ?? 0) + 1
        );
      }
    }

    const { data: topics } = await supabaseAdmin
      .from("syllabus_topics")
      .select("id, subject_id");

    const factCountBySubject = new Map<string, number>();
    for (const topic of topics ?? []) {
      const subjectId = topic.subject_id;
      const facts = factsByTopic.get(topic.id) ?? 0;
      factCountBySubject.set(
        subjectId,
        (factCountBySubject.get(subjectId) ?? 0) + facts
      );
    }

    const result = (subjects ?? []).map((s) => ({
      ...s,
      topic_count: topicCountMap.get(s.id) ?? 0,
      fact_count: factCountBySubject.get(s.id) ?? 0,
    }));

    return Response.json(result);
  } catch (error) {
    return errorResponse(error);
  }
}
