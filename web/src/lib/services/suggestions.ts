import { supabaseAdmin } from "@/lib/supabase-server";
import {
  STUDENT_ID,
  STALE_DAYS,
  WEAK_TOPIC_THRESHOLD,
  MAX_SUGGESTIONS,
  MASTERY,
} from "@/lib/constants";
import type { StudySuggestion, SuggestionReason } from "@/lib/types";

interface TopicCandidate {
  syllabus_topic_id: string;
  topic_name: string;
  topic_code: string;
  subject_code: string;
  avg_mastery: number;
  last_practiced: string | null;
  reason_code: SuggestionReason;
  reason: string;
  priority: number;
}

/**
 * Generate study suggestions based on weak/stale/unseen topics.
 * Clears old pending suggestions and creates new ones.
 */
export async function generateSuggestions(
  studentId = STUDENT_ID
): Promise<StudySuggestion[]> {
  // Clear old non-acted suggestions
  await supabaseAdmin
    .from("study_suggestions")
    .delete()
    .eq("student_id", studentId)
    .eq("dismissed", false)
    .eq("acted_on", false);

  // Get all topics with their subjects
  const { data: topics } = await supabaseAdmin
    .from("syllabus_topics")
    .select("id, topic_name, topic_code, subjects!inner(code)")
    .order("display_order");

  if (!topics) return [];

  // Get all fact mastery for this student
  const { data: masteryRows } = await supabaseAdmin
    .from("student_fact_mastery")
    .select("fact_id, mastery_score, last_seen")
    .eq("student_id", studentId);

  // Get all facts grouped by topic
  const { data: allFacts } = await supabaseAdmin
    .from("atomic_facts")
    .select("id, syllabus_topic_id")
    .eq("is_active", true);

  if (!allFacts) return [];

  // Build fact → mastery map
  const masteryMap = new Map(
    (masteryRows ?? []).map((r) => [
      r.fact_id as string,
      {
        score: r.mastery_score as number,
        lastSeen: r.last_seen as string | null,
      },
    ])
  );

  // Build topic → facts map
  const topicFacts = new Map<string, string[]>();
  for (const f of allFacts) {
    if (!f.syllabus_topic_id) continue;
    const tid = f.syllabus_topic_id as string;
    const existing = topicFacts.get(tid) ?? [];
    existing.push(f.id as string);
    topicFacts.set(tid, existing);
  }

  const now = Date.now();
  const staleDaysMs = STALE_DAYS * 24 * 60 * 60 * 1000;

  const candidates: TopicCandidate[] = [];

  for (const t of topics) {
    const tid = t.id as string;
    const factIds = topicFacts.get(tid);
    if (!factIds || factIds.length === 0) continue;

    const subject = t.subjects as unknown as { code: string };

    // Calculate avg mastery for this topic's facts
    let totalScore = 0;
    let seenCount = 0;
    let oldestSeen: number | null = null;

    for (const fid of factIds) {
      const m = masteryMap.get(fid);
      if (m) {
        totalScore += m.score;
        seenCount++;
        if (m.lastSeen) {
          const ts = new Date(m.lastSeen).getTime();
          if (oldestSeen === null || ts < oldestSeen) oldestSeen = ts;
        }
      }
    }

    const avgMastery = seenCount > 0 ? totalScore / factIds.length : 0;
    const daysSinceSeen =
      oldestSeen !== null
        ? Math.round((now - oldestSeen) / (24 * 60 * 60 * 1000))
        : null;

    // Determine reason
    let reasonCode: SuggestionReason;
    let reason: string;
    let priority: number;

    if (seenCount === 0) {
      reasonCode = "never_seen";
      reason = `${(t.topic_name as string)}: not started yet (${factIds.length} facts)`;
      priority = 100;
    } else if (daysSinceSeen !== null && daysSinceSeen > STALE_DAYS) {
      reasonCode = "stale";
      reason = `${(t.topic_name as string)}: ${Math.round(avgMastery * 100)}% mastery, not reviewed in ${daysSinceSeen} days`;
      priority = 80;
    } else if (avgMastery < WEAK_TOPIC_THRESHOLD) {
      reasonCode = "low_mastery";
      reason = `${(t.topic_name as string)}: ${Math.round(avgMastery * 100)}% mastery (${seenCount}/${factIds.length} facts seen)`;
      priority = 60;
    } else {
      continue; // Topic is fine, skip
    }

    candidates.push({
      syllabus_topic_id: tid,
      topic_name: t.topic_name as string,
      topic_code: t.topic_code as string,
      subject_code: subject.code,
      avg_mastery: avgMastery,
      last_practiced: oldestSeen ? new Date(oldestSeen).toISOString() : null,
      reason_code: reasonCode,
      reason,
      priority,
    });
  }

  // Sort: highest priority first, then lowest mastery
  candidates.sort((a, b) => {
    if (a.priority !== b.priority) return b.priority - a.priority;
    return a.avg_mastery - b.avg_mastery;
  });

  const top = candidates.slice(0, MAX_SUGGESTIONS);

  if (top.length === 0) return [];

  // Insert suggestions
  const { data: inserted, error } = await supabaseAdmin
    .from("study_suggestions")
    .insert(
      top.map((c) => ({
        student_id: studentId,
        syllabus_topic_id: c.syllabus_topic_id,
        reason: c.reason,
        reason_code: c.reason_code,
        priority: c.priority,
      }))
    )
    .select();

  if (error) throw error;

  return (inserted ?? []).map((row, i) => ({
    id: row.id as string,
    syllabus_topic_id: top[i].syllabus_topic_id,
    topic_name: top[i].topic_name,
    topic_code: top[i].topic_code,
    subject_code: top[i].subject_code,
    reason: top[i].reason,
    reason_code: top[i].reason_code,
    priority: top[i].priority,
    dismissed: false,
    acted_on: false,
  }));
}

/**
 * Get active (non-dismissed) suggestions.
 */
export async function getSuggestions(
  studentId = STUDENT_ID
): Promise<StudySuggestion[]> {
  const { data, error } = await supabaseAdmin
    .from("study_suggestions")
    .select(
      `
      id,
      syllabus_topic_id,
      reason,
      reason_code,
      priority,
      dismissed,
      acted_on,
      syllabus_topics!inner(topic_name, topic_code, subjects!inner(code))
    `
    )
    .eq("student_id", studentId)
    .eq("dismissed", false)
    .order("priority", { ascending: false });

  if (error) throw error;
  if (!data) return [];

  return data.map((row) => {
    const topic = row.syllabus_topics as unknown as {
      topic_name: string;
      topic_code: string;
      subjects: { code: string };
    };
    return {
      id: row.id as string,
      syllabus_topic_id: row.syllabus_topic_id as string,
      topic_name: topic.topic_name,
      topic_code: topic.topic_code,
      subject_code: topic.subjects.code,
      reason: row.reason as string,
      reason_code: row.reason_code as SuggestionReason,
      priority: row.priority as number,
      dismissed: row.dismissed as boolean,
      acted_on: row.acted_on as boolean,
    };
  });
}

/**
 * Dismiss or mark a suggestion as acted on.
 */
export async function updateSuggestion(
  suggestionId: string,
  update: { dismissed?: boolean; acted_on?: boolean }
): Promise<void> {
  const { error } = await supabaseAdmin
    .from("study_suggestions")
    .update(update)
    .eq("id", suggestionId);

  if (error) throw error;
}
