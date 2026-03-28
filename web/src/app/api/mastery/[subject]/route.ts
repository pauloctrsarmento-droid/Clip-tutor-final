import { errorResponse } from "@/lib/errors";
import { supabaseAdmin } from "@/lib/supabase-server";
import { STUDENT_ID, MASTERY } from "@/lib/constants";
import type { NextRequest } from "next/server";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ subject: string }> }
) {
  try {
    const { subject: subjectCode } = await params;

    // Get subject info
    const { data: subjectData } = await supabaseAdmin
      .from("subjects")
      .select("code, name")
      .eq("code", subjectCode)
      .single();

    if (!subjectData) {
      return Response.json({ error: "Subject not found" }, { status: 404 });
    }

    // Get topics for this subject with mastery
    const { data: topics } = await supabaseAdmin
      .from("syllabus_topics")
      .select("id, topic_code, topic_name")
      .eq("subject_id", (await supabaseAdmin
        .from("subjects")
        .select("id")
        .eq("code", subjectCode)
        .single()
      ).data?.id)
      .order("display_order");

    if (!topics) return Response.json({ subject: subjectData, topics: [] });

    // Get topic mastery
    const { data: topicMastery } = await supabaseAdmin
      .from("student_topic_mastery")
      .select("syllabus_topic_id, mastery_score, questions_attempted")
      .eq("student_id", STUDENT_ID);

    const masteryMap = new Map(
      (topicMastery ?? []).map((m) => [
        m.syllabus_topic_id as string,
        { score: m.mastery_score as number, attempts: m.questions_attempted as number },
      ])
    );

    // Get fact mastery for all facts in this subject's topics
    const topicIds = topics.map((t) => t.id as string);

    const { data: facts } = await supabaseAdmin
      .from("atomic_facts")
      .select("id, fact_text, syllabus_topic_id")
      .in("syllabus_topic_id", topicIds)
      .eq("is_active", true)
      .order("display_order");

    const factIds = (facts ?? []).map((f) => f.id as string);

    let factMasteryMap = new Map<string, number>();
    if (factIds.length > 0) {
      // Paginate fact mastery query
      let allFactMastery: Array<Record<string, unknown>> = [];
      let offset = 0;
      const pageSize = 1000;

      while (true) {
        const { data: batch } = await supabaseAdmin
          .from("student_fact_mastery")
          .select("fact_id, mastery_score")
          .eq("student_id", STUDENT_ID)
          .in("fact_id", factIds.slice(offset, offset + pageSize));

        if (!batch || batch.length === 0) break;
        allFactMastery = allFactMastery.concat(batch);
        offset += pageSize;
        if (offset >= factIds.length) break;
      }

      factMasteryMap = new Map(
        allFactMastery.map((m) => [m.fact_id as string, m.mastery_score as number])
      );
    }

    // Build response grouped by topic
    const result = topics.map((topic) => {
      const topicId = topic.id as string;
      const mastery = masteryMap.get(topicId);
      const topicFacts = (facts ?? []).filter(
        (f) => (f.syllabus_topic_id as string) === topicId
      );

      return {
        id: topicId,
        topic_code: topic.topic_code as string,
        topic_name: topic.topic_name as string,
        mastery_score: mastery?.score ?? 0,
        questions_attempted: mastery?.attempts ?? 0,
        facts: topicFacts.map((f) => {
          const fid = f.id as string;
          const fScore = factMasteryMap.get(fid) ?? 0;
          return {
            id: fid,
            text: f.fact_text as string,
            mastery_score: fScore,
            status: fScore >= MASTERY.MASTERED_THRESHOLD
              ? "mastered" as const
              : fScore > 0
                ? "in_progress" as const
                : "not_started" as const,
          };
        }),
      };
    });

    return Response.json({
      subject: { code: subjectData.code, name: subjectData.name },
      topics: result,
    });
  } catch (error) {
    return errorResponse(error);
  }
}
