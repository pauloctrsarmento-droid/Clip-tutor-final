/** Per-turn study context injected into companion chat messages. */
export interface CompanionContext {
  mode: "flashcard" | "quiz";
  topic: string | null;
  question: string;
  diagramUrls: string[];
  studentAttempt: string | null;
  expectedAnswer: string | null;
  markScheme: Array<{ description: string; awarded: boolean }> | null;
  overallFeedback: string | null;
}

/**
 * Serialize a CompanionContext into a [STUDY_CONTEXT]...[/STUDY_CONTEXT] block.
 * Null fields are omitted. Result is prepended to the user's message.
 */
export function serializeCompanionContext(ctx: CompanionContext): string {
  const lines: string[] = [];
  lines.push(`mode: ${ctx.mode}`);
  if (ctx.topic) lines.push(`topic: ${ctx.topic}`);
  lines.push(`question: ${ctx.question}`);
  if (ctx.diagramUrls.length > 0) {
    lines.push(`diagram_urls: ${ctx.diagramUrls.join(", ")}`);
  }
  if (ctx.studentAttempt !== null) {
    lines.push(`student_answer: ${ctx.studentAttempt}`);
  }
  if (ctx.expectedAnswer !== null) {
    lines.push(`expected_answer: ${ctx.expectedAnswer}`);
  }
  if (ctx.markScheme && ctx.markScheme.length > 0) {
    const points = ctx.markScheme
      .map((p) => `  - ${p.awarded ? "✓" : "✗"} ${p.description}`)
      .join("\n");
    lines.push(`mark_scheme:\n${points}`);
  }
  if (ctx.overallFeedback) {
    lines.push(`overall_feedback: ${ctx.overallFeedback}`);
  }
  return `[STUDY_CONTEXT]\n${lines.join("\n")}\n[/STUDY_CONTEXT]`;
}

/** Strip the [STUDY_CONTEXT] block(s) from a user message for display. */
export function stripCompanionContext(content: string): string {
  return content
    .replace(/\[STUDY_CONTEXT\][\s\S]*?\[\/STUDY_CONTEXT\]\s*/g, "")
    .trim();
}
