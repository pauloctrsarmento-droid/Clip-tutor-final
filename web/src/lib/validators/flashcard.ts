import { z } from "zod";

export const flashcardQuerySchema = z.object({
  subject: z.string().optional(),
  topic: z.string().uuid().optional(),
  limit: z.coerce.number().int().min(1).max(50).optional(),
});

export const flashcardAnswerSchema = z.object({
  session_id: z.string().uuid(),
  fact_id: z.string().min(1),
  correct: z.boolean(),
});

export type FlashcardQuery = z.infer<typeof flashcardQuerySchema>;
export type FlashcardAnswer = z.infer<typeof flashcardAnswerSchema>;
