import { z } from "zod";
import { errorResponse } from "@/lib/errors";
import { updatePlanEntry, rescheduleEntry } from "@/lib/services/study-plan";
import { supabaseAdmin } from "@/lib/supabase-server";
import { STUDENT_ID } from "@/lib/constants";

const studentUpdateSchema = z.object({
  action: z.enum(["done", "missed", "skipped", "reschedule"]),
  notes: z.string().optional(),
  reschedule_date: z.string().optional(),
});

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await request.json();
    const input = studentUpdateSchema.parse(body);

    // Verify entry belongs to the student
    const { data: entry, error: fetchErr } = await supabaseAdmin
      .from("study_plan_entries")
      .select("id, student_id")
      .eq("id", id)
      .single();

    if (fetchErr || !entry) {
      return Response.json({ error: "Entry not found", code: "NOT_FOUND" }, { status: 404 });
    }
    if (entry.student_id !== STUDENT_ID) {
      return Response.json({ error: "Forbidden", code: "FORBIDDEN" }, { status: 403 });
    }

    if (input.action === "reschedule") {
      const targetDate = input.reschedule_date ?? getTomorrow();
      const result = await rescheduleEntry(id, targetDate, input.notes ?? "Rescheduled by student");
      return Response.json(result);
    }

    const result = await updatePlanEntry(id, {
      status: input.action,
      notes: input.notes,
    });
    return Response.json(result);
  } catch (error) {
    return errorResponse(error);
  }
}

function getTomorrow(): string {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  return d.toLocaleDateString("en-CA", { timeZone: "Europe/Lisbon" });
}
