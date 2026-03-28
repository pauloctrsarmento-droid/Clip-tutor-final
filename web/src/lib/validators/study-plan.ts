import { z } from "zod";

export const studyPlanQuerySchema = z.object({
  week: z.enum(["current", "next", "all"]).optional(),
  from: z.string().optional(),
  to: z.string().optional(),
  status: z.enum(["pending", "done", "skipped", "rescheduled"]).optional(),
});

export const updatePlanEntrySchema = z.object({
  status: z.enum(["pending", "done", "skipped", "rescheduled"]).optional(),
  plan_date: z.string().optional(),
  actual_date: z.string().optional(),
  notes: z.string().optional(),
  planned_hours: z.number().min(0).optional(),
});

export const rescheduleSchema = z.object({
  entry_id: z.string().uuid(),
  new_date: z.string(),
  notes: z.string().optional(),
});

export const aiRescheduleSchema = z.object({
  reason: z.string().min(1),
  available_hours_per_day: z.number().min(1).max(10).optional(),
});

export const applyRescheduleSchema = z.object({
  entries: z.array(
    z.object({
      plan_date: z.string(),
      subject_code: z.string(),
      title: z.string(),
      planned_hours: z.number().min(0),
      study_type: z.enum(["study", "practice", "exam", "final_prep", "mixed"]),
      syllabus_topic_ids: z.array(z.string().uuid()).optional(),
      sort_order: z.number().int().optional(),
    })
  ),
});

export type StudyPlanQuery = z.infer<typeof studyPlanQuerySchema>;
export type UpdatePlanEntry = z.infer<typeof updatePlanEntrySchema>;
export type RescheduleInput = z.infer<typeof rescheduleSchema>;
export type AiRescheduleInput = z.infer<typeof aiRescheduleSchema>;
export type ApplyRescheduleInput = z.infer<typeof applyRescheduleSchema>;
