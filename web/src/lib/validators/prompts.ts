import { z } from "zod";

export const updatePromptSchema = z.object({
  content: z.string().min(1),
  change_note: z.string().optional(),
});

export const revertPromptSchema = z.object({
  version_id: z.string().uuid(),
});

export const aiRewriteSchema = z.object({
  description: z.string().min(1),
});

export type UpdatePromptInput = z.infer<typeof updatePromptSchema>;
export type RevertPromptInput = z.infer<typeof revertPromptSchema>;
export type AiRewriteInput = z.infer<typeof aiRewriteSchema>;
