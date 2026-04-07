import { supabaseAdmin } from "@/lib/supabase-server";
import type { StudyPlanEntry, ExamCalendarEntry } from "@/lib/types";
import type { CreatePlanEntryInput } from "@/lib/validators/study-plan";

/**
 * Get study plan entries for a date range.
 */
export async function getPlanEntries(options: {
  from?: string;
  to?: string;
  status?: string;
  studentId: string;
}): Promise<StudyPlanEntry[]> {
  const { from, to, status, studentId } = options;

  let query = supabaseAdmin
    .from("study_plan_entries")
    .select("*")
    .eq("student_id", studentId)
    .order("plan_date", { ascending: true })
    .order("sort_order", { ascending: true });

  if (from) query = query.gte("plan_date", from);
  if (to) query = query.lte("plan_date", to);
  if (status) query = query.eq("status", status);

  const { data, error } = await query;
  if (error) throw error;
  return (data ?? []) as StudyPlanEntry[];
}

/**
 * Create one or more study plan entries.
 */
export async function createPlanEntries(
  entries: CreatePlanEntryInput[],
  studentId: string
): Promise<StudyPlanEntry[]> {
  const rows = entries.map((e, i) => ({
    student_id: studentId,
    plan_date: e.plan_date,
    subject_code: e.subject_code,
    title: e.title,
    planned_hours: e.planned_hours,
    study_type: e.study_type,
    start_time: e.start_time ?? null,
    end_time: e.end_time ?? null,
    notes: e.notes ?? null,
    sort_order: e.sort_order ?? i + 1,
    syllabus_topic_ids: e.syllabus_topic_ids ?? [],
    phase: "full_time" as const,
    status: "pending" as const,
  }));

  const { data, error } = await supabaseAdmin
    .from("study_plan_entries")
    .insert(rows)
    .select();

  if (error) throw error;
  return (data ?? []) as StudyPlanEntry[];
}

/**
 * Get today's blocks + any overdue pending blocks.
 */
/** Get today's date in student timezone (Europe/Lisbon) — format YYYY-MM-DD */
function getTodayDate(): string {
  return new Date().toLocaleDateString("en-CA", { timeZone: "Europe/Lisbon" });
}

/** Get a Date object adjusted to Lisbon timezone for week calculations */
function getNowInLisbon(): Date {
  const str = new Date().toLocaleString("en-US", { timeZone: "Europe/Lisbon" });
  return new Date(str);
}

export async function getTodayPlan(
  studentId: string
): Promise<{ today: StudyPlanEntry[]; overdue: StudyPlanEntry[] }> {
  const today = getTodayDate();

  const [todayRes, overdueRes] = await Promise.all([
    supabaseAdmin
      .from("study_plan_entries")
      .select("*")
      .eq("student_id", studentId)
      .eq("plan_date", today)
      .order("sort_order", { ascending: true }),
    supabaseAdmin
      .from("study_plan_entries")
      .select("*")
      .eq("student_id", studentId)
      .eq("status", "pending")
      .lt("plan_date", today)
      .order("plan_date", { ascending: true })
      .order("sort_order", { ascending: true }),
  ]);

  if (todayRes.error) throw todayRes.error;
  if (overdueRes.error) throw overdueRes.error;

  return {
    today: (todayRes.data ?? []) as StudyPlanEntry[],
    overdue: (overdueRes.data ?? []) as StudyPlanEntry[],
  };
}

/**
 * Get entries for a specific week.
 */
export async function getWeekPlan(
  weekOffset = 0,
  studentId: string
): Promise<StudyPlanEntry[]> {
  const now = getNowInLisbon();
  const dayOfWeek = now.getDay(); // 0=Sun
  const monday = new Date(now);
  monday.setDate(now.getDate() - (dayOfWeek === 0 ? 6 : dayOfWeek - 1) + weekOffset * 7);
  const sunday = new Date(monday);
  sunday.setDate(monday.getDate() + 6);

  const from = monday.toLocaleDateString("en-CA");
  const to = sunday.toLocaleDateString("en-CA");

  return getPlanEntries({ from, to, studentId });
}

/**
 * Update a plan entry (status, date, notes, etc).
 */
export async function updatePlanEntry(
  entryId: string,
  update: {
    status?: string;
    plan_date?: string;
    actual_date?: string;
    notes?: string;
    planned_hours?: number;
  }
): Promise<StudyPlanEntry> {
  const { data, error } = await supabaseAdmin
    .from("study_plan_entries")
    .update({ ...update, updated_at: new Date().toISOString() })
    .eq("id", entryId)
    .select()
    .single();

  if (error) throw error;
  return data as StudyPlanEntry;
}

/**
 * Reschedule a block: mark original as 'rescheduled', create new entry on new date.
 */
export async function rescheduleEntry(
  entryId: string,
  newDate: string,
  notes?: string
): Promise<StudyPlanEntry> {
  // Get original
  const { data: original, error: fetchErr } = await supabaseAdmin
    .from("study_plan_entries")
    .select("*")
    .eq("id", entryId)
    .single();

  if (fetchErr) throw fetchErr;
  if (!original) throw new Error("Entry not found");

  // Mark original as rescheduled
  await supabaseAdmin
    .from("study_plan_entries")
    .update({
      status: "rescheduled",
      actual_date: newDate,
      notes: notes ?? `Rescheduled from ${original.plan_date}`,
      updated_at: new Date().toISOString(),
    })
    .eq("id", entryId);

  // Create new entry on new date
  const { data: newEntry, error: insertErr } = await supabaseAdmin
    .from("study_plan_entries")
    .insert({
      student_id: original.student_id,
      plan_date: newDate,
      subject_code: original.subject_code,
      title: original.title,
      syllabus_topic_ids: original.syllabus_topic_ids,
      planned_hours: original.planned_hours,
      study_type: original.study_type,
      phase: original.phase,
      sort_order: original.sort_order,
      notes: notes ?? `Rescheduled from ${original.plan_date}`,
    })
    .select()
    .single();

  if (insertErr) throw insertErr;
  return newEntry as StudyPlanEntry;
}

/**
 * Get exam calendar with days remaining.
 */
export async function getExamCalendar(
  studentId: string
): Promise<ExamCalendarEntry[]> {
  const { data, error } = await supabaseAdmin
    .from("exam_calendar")
    .select("*")
    .eq("student_id", studentId)
    .order("exam_date", { ascending: true });

  if (error) throw error;

  const today = getNowInLisbon();
  today.setHours(0, 0, 0, 0);

  return (data ?? []).map((row) => {
    const examDate = new Date(row.exam_date as string);
    examDate.setHours(0, 0, 0, 0);
    const diffMs = examDate.getTime() - today.getTime();
    const daysRemaining = Math.ceil(diffMs / (1000 * 60 * 60 * 24));

    return {
      ...(row as ExamCalendarEntry),
      days_remaining: daysRemaining,
    };
  });
}

/**
 * Apply a rescheduled plan: mark old pending entries as rescheduled, insert new ones.
 */
export async function applyReschedule(
  entries: Array<{
    plan_date: string;
    subject_code: string;
    title: string;
    planned_hours: number;
    study_type: string;
    syllabus_topic_ids?: string[];
    sort_order?: number;
  }>,
  studentId: string
): Promise<number> {
  // Get dates covered by new entries
  const newDates = new Set(entries.map((e) => e.plan_date));

  // Mark existing pending entries on those dates as rescheduled
  for (const date of newDates) {
    await supabaseAdmin
      .from("study_plan_entries")
      .update({
        status: "rescheduled",
        updated_at: new Date().toISOString(),
      })
      .eq("student_id", studentId)
      .eq("plan_date", date)
      .eq("status", "pending");
  }

  // Insert new entries
  const rows = entries.map((e, i) => ({
    student_id: studentId,
    plan_date: e.plan_date,
    subject_code: e.subject_code,
    title: e.title,
    planned_hours: e.planned_hours,
    study_type: e.study_type,
    phase: "full_time" as const,
    syllabus_topic_ids: e.syllabus_topic_ids ?? [],
    sort_order: e.sort_order ?? i + 1,
    status: "pending",
  }));

  const { error } = await supabaseAdmin
    .from("study_plan_entries")
    .insert(rows);

  if (error) throw error;
  return rows.length;
}
