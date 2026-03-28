import { z } from "zod";

export const createSessionSchema = z.object({
  session_type: z.enum(["flashcard", "quiz", "review"]),
  subject_code: z.string().optional(),
  syllabus_topic_id: z.string().uuid().optional(),
});

export const endSessionSchema = z.object({
  ended_at: z.string().datetime().optional(),
});

export type CreateSessionInput = z.infer<typeof createSessionSchema>;
export type EndSessionInput = z.infer<typeof endSessionSchema>;
