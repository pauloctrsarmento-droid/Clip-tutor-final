import { z } from "zod";

export const quizQuerySchema = z.object({
  subject: z.string().optional(),
  topic: z.string().uuid().optional(),
  count: z.coerce.number().int().min(1).max(40).optional(),
  response_type: z.enum(["text", "numeric", "drawing", "table", "mcq", "labelling"]).optional(),
});

export const quizAttemptSchema = z.object({
  session_id: z.string().uuid(),
  question_id: z.string().min(1),
  marks_awarded: z.number().int().min(0),
  marks_available: z.number().int().min(1).optional(),
});

export type QuizQuery = z.infer<typeof quizQuerySchema>;
export type QuizAttempt = z.infer<typeof quizAttemptSchema>;
