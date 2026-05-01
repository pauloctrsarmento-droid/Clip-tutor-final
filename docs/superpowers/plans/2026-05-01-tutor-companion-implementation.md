# Tutor Companion (during Flashcards & Quizzes) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add a persistent Socratic chat companion alongside flashcard and quiz sessions, reusing the existing chat-tutor orchestrator with a new `mode='companion'`.

**Architecture:** Reuse `chat-tutor.ts` orchestrator with a new `session_type='study_companion'` branch (different prompt, no actions, no plan/memory side-effects). Frontend wraps existing pages in a 60/40 flex split, lazy-creates the chat session on first send, prepends a `[STUDY_CONTEXT]` block per turn, strips it at render. Desktop only.

**Tech Stack:** Next.js (App Router), React 19, TypeScript strict, Supabase, OpenAI streaming, Tailwind. Existing `useChatStream`, `ChatPanel`, `ChatInput`, `ChatMessage` reused.

**Spec:** `docs/superpowers/specs/2026-05-01-tutor-during-flashcards-quiz-design.md`

**Verification strategy:** This project has no vitest setup (none in `package.json`, no config files). Per project rule "NEVER add dependencies without asking first", do **not** install vitest. Verification per task:
1. `pnpm tsc --noEmit` (run from `web/`) — typecheck after every code change. Project rule: must pass before considering done.
2. Manual integration verification at end (Task 15) — start dev server, exercise the flow.

**Commit cadence:** Commit at the end of each backend/frontend phase, plus after integration.

---

## File Structure

### New files
- `scripts/migrate-companion.sql` — DB migration (parent_session_id column + index)
- `scripts/seed-companion-prompt.sql` — seed `chat_tutor_companion` prompt row
- `web/src/lib/companion-context.ts` — `CompanionContext` type + `serializeCompanionContext()` helper
- `web/src/hooks/use-companion-chat.ts` — wraps `useChatStream`, lazy session, context injection, mutex
- `web/src/components/companion/companion-panel.tsx` — UI wrapper around `ChatPanel`

### Modified files
- `web/src/lib/types.ts` — extend `SessionType` union with `'study_companion'`
- `web/src/lib/services/orchestrators/chat-tutor.ts` — companion branches in startSession, buildSystemPrompt, sendMessage, endSession
- `web/src/app/api/session/start/route.ts` — accept `mode='companion'` + `parent_session_id`
- `web/src/lib/api.ts` — extend `startChatSession` client signature
- `web/src/components/session/ChatMessage.tsx` — strip `[STUDY_CONTEXT]` block from user content
- `web/src/app/study/flashcards/session/page.tsx` — 60/40 split + CompanionPanel
- `web/src/app/study/quiz/session/page.tsx` — 60/40 split + CompanionPanel

---

## Task 1: Database migration

**Files:**
- Create: `scripts/migrate-companion.sql`

- [ ] **Step 1: Write migration**

```sql
-- Companion sessions link to their parent flashcard/quiz study_sessions row.
-- ON DELETE SET NULL keeps companion conversations even if the parent is purged.
ALTER TABLE study_sessions
  ADD COLUMN IF NOT EXISTS parent_session_id UUID
  REFERENCES study_sessions(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_sessions_parent
  ON study_sessions(parent_session_id);
```

- [ ] **Step 2: Apply migration via Supabase MCP**

Run via the Supabase MCP `apply_migration` tool with name `add_parent_session_id`. The user has `mcp__plugin_supabase_supabase__apply_migration` available — use it instead of psql.

- [ ] **Step 3: Verify column exists**

Run via Supabase MCP `execute_sql`:
```sql
SELECT column_name, data_type
FROM information_schema.columns
WHERE table_name = 'study_sessions' AND column_name = 'parent_session_id';
```
Expected: one row, `parent_session_id | uuid`.

---

## Task 2: Seed the companion prompt

**Files:**
- Create: `scripts/seed-companion-prompt.sql`

- [ ] **Step 1: Write seed SQL**

```sql
-- Idempotent seed for the companion prompt. Slug-based upsert.
INSERT INTO prompts (slug, name, content, is_active, version, description)
VALUES (
  'chat_tutor_companion',
  'Study Companion (Socratic)',
  $PROMPT$You are a study companion guiding {{student_name}} through {{subject_name}} ({{language_name}}). She is currently practicing flashcards or quiz questions and asking you for help with the question in front of her.

═══════════════════════════════════════════════════════════════
GOLDEN RULE: NEVER GIVE THE FINAL ANSWER.
═══════════════════════════════════════════════════════════════
Your role is to guide her TO the answer, not deliver it. If she walks away having only copied your output, you have failed. She must construct the understanding herself.

Non-negotiable, even if:
- She begs ("just tell me", "I don't have time")
- The answer seems trivially obvious
- She says she'll learn it later
- The mark scheme is in your context

═══════════════════════════════════════════════════════════════
INPUT FORMAT
═══════════════════════════════════════════════════════════════
Each user message may begin with [STUDY_CONTEXT]...[/STUDY_CONTEXT]. Parse silently. Never quote it back. Fields:
  • mode: "flashcard" or "quiz"
  • topic: syllabus topic
  • question: what she is looking at
  • student_answer: her attempt (may be absent)
  • mark_scheme: the marker's expected points (NEVER quote verbatim)
  • overall_feedback: the auto-grader's comment (you may paraphrase)

If [STUDY_CONTEXT] is absent, treat as a follow-up about the last context.

═══════════════════════════════════════════════════════════════
HINT LADDER — escalate slowly
═══════════════════════════════════════════════════════════════
  L1 (default opener):
    "What's the first concept this question is testing?"
    "What do you already know about [topic]?"

  L2 (after she names the area):
    "Good — now what principle/formula applies here?"
    "Try thinking about [related concept]."

  L3 (after she identifies the principle):
    "Apply it to the numbers/terms in the question. What do you get for [intermediate step]?"

  L4 (only if she's stuck after L3):
    "Walk me through the steps you'd take. I'll spot where to look closer."

  NEVER L5 — there is no level that reveals the answer. If she truly cannot progress, give a worked example with DIFFERENT numbers.

═══════════════════════════════════════════════════════════════
WHEN SHE GIVES A PARTIAL ANSWER
═══════════════════════════════════════════════════════════════
1. Confirm what's right SPECIFICALLY: "Yes — you correctly identified that propane needs 5 O₂ per molecule."
2. Point at the gap WITHOUT filling it: "But check the ratio of CO₂ to propane. What does the balanced equation say?"
3. Never say "the answer is..." or "you should write...".

═══════════════════════════════════════════════════════════════
WHEN SHE BEGS / GIVES UP
═══════════════════════════════════════════════════════════════
"Just tell me" / "I give up" / "no idea":
  Reply: "I won't — that's the deal. Let's break it down. Read the question again and tell me one thing — even one word — that you DO recognize."

If emotionally frustrated, acknowledge briefly then redirect:
  "I know it's hard. Take a breath. What's the actual word/number/symbol that's confusing you?"

═══════════════════════════════════════════════════════════════
QUIZ FEEDBACK PHASE (mode=quiz, mark_scheme present)
═══════════════════════════════════════════════════════════════
She has already submitted and seen feedback. Now she's asking why.

DO:
- Explain WHICH mark point she missed and the underlying concept
- Ask "what step do you think went wrong?"
- Reference the topic facts you have access to

DON'T:
- Read the mark scheme aloud
- Re-grade her work — the auto-grader did that
- Say "the correct answer is X"

═══════════════════════════════════════════════════════════════
FORMATTING
═══════════════════════════════════════════════════════════════
- Replies under 80 words unless she explicitly asks for detail
- Use **bold** for key terms only
- Math: $E=mc^2$ or block $$ for multi-line
- No bullet lists for replies under 3 points — use prose

═══════════════════════════════════════════════════════════════
DO NOT
═══════════════════════════════════════════════════════════════
- Suggest launching quizzes/flashcards — she's already in one
- Use [STUDY_CONTEXT] tags in your output
- Reference "the mark scheme" by name — paraphrase
- Switch language unless she does

Relevant facts for this topic:
{{relevant_facts}}
$PROMPT$,
  true,
  1,
  'Socratic study companion shown alongside flashcards and quizzes. Never gives the final answer.'
)
ON CONFLICT (slug) DO NOTHING;
```

- [ ] **Step 2: Apply via Supabase MCP**

Use `mcp__plugin_supabase_supabase__execute_sql` to run the INSERT. (Not `apply_migration` — this is data, not schema.)

- [ ] **Step 3: Verify**

Run via Supabase MCP `execute_sql`:
```sql
SELECT slug, version, is_active, length(content) AS content_len
FROM prompts WHERE slug = 'chat_tutor_companion';
```
Expected: one row, `is_active=true`, `content_len > 2000`.

- [ ] **Step 4: Commit (DB scripts)**

```bash
git add scripts/migrate-companion.sql scripts/seed-companion-prompt.sql
git commit -m "feat(db): companion session migration + chat_tutor_companion prompt seed"
```

---

## Task 3: Extend SessionType union

**Files:**
- Modify: `web/src/lib/types.ts:59`

- [ ] **Step 1: Add `study_companion` to the union**

Replace line 59:
```ts
export type SessionType = "flashcard" | "quiz" | "review" | "chat_tutor";
```
with:
```ts
export type SessionType = "flashcard" | "quiz" | "review" | "chat_tutor" | "study_companion";
```

- [ ] **Step 2: Add `parent_session_id` to `StudySession` (optional)**

After line 80 (the `status` field), inside the `StudySession` interface, append:
```ts
  parent_session_id?: string | null;
```

The field is optional (`?:`) to avoid breaking any existing code that constructs `StudySession` literals without this field.

- [ ] **Step 3: Typecheck**

Run from `web/`:
```bash
pnpm tsc --noEmit
```
Expected: passes (no new errors). If existing unrelated errors are present, note them but do not address.

---

## Task 4: chat-tutor.ts — startSession companion branch

**Files:**
- Modify: `web/src/lib/services/orchestrators/chat-tutor.ts`

- [ ] **Step 1: Extend `FreeStudyOptions` interface (around line 45)**

Replace:
```ts
export interface FreeStudyOptions {
  subjectCode?: string;
  topicId?: string;
  mode?: "tutor" | "review";
}
```
with:
```ts
export interface FreeStudyOptions {
  subjectCode?: string;
  topicId?: string;
  mode?: "tutor" | "review" | "companion";
  parentSessionId?: string;
}
```

- [ ] **Step 2: Add companion branch BEFORE the existing `Promise.all`**

Inside `startSession` function, the **first** statement of the body must be the companion branch. The existing function starts (line 56) with `const isFreeStudy = !!options?.subjectCode;` followed by `Promise.all([...])`. We insert the branch before both, so companion mode skips plan loading AND the unnecessary `getPrompt("chat_tutor")` fetch entirely.

Replace the existing function header + first statements:

```ts
export async function startSession(
  mood: Mood,
  studentId: string,
  options?: FreeStudyOptions,
): Promise<SessionStartResult> {
  const isFreeStudy = !!options?.subjectCode;

  // Fetch student profile + prompt in parallel; skip plan if free study
  const [planData, studentRes, promptTemplate] = await Promise.all([
```

with:

```ts
export async function startSession(
  mood: Mood,
  studentId: string,
  options?: FreeStudyOptions,
): Promise<SessionStartResult> {
  // ── Companion mode: dedicated path. Skip plan + chat_tutor prompt fetch. ──
  if (options?.mode === "companion") {
    const studentRes = await supabaseAdmin
      .from("students")
      .select("name")
      .eq("id", studentId)
      .single();
    const studentName =
      ((studentRes.data?.name as string) ?? "").split(" ")[0] || "there";
    const greeting = `Hi ${studentName}! I'm here. Show me what you're stuck on — I'll guide you, never give the answer.`;

    const { data: companionSession, error: companionError } = await supabaseAdmin
      .from("study_sessions")
      .insert({
        student_id: studentId,
        session_type: "study_companion",
        mood,
        status: "active",
        current_block_index: 0,
        block_phase: "explanation",
        subject_code: options.subjectCode ?? null,
        syllabus_topic_id: options.topicId ?? null,
        parent_session_id: options.parentSessionId ?? null,
      })
      .select()
      .single();

    if (companionError) throw companionError;

    await supabaseAdmin.from("chat_messages").insert({
      session_id: companionSession.id as string,
      role: "assistant",
      content: greeting,
    });

    return {
      session_id: companionSession.id as string,
      blocks: [],
      tutor_greeting: greeting,
    };
  }
  // ── End companion mode ──

  const isFreeStudy = !!options?.subjectCode;

  // Fetch student profile + prompt in parallel; skip plan if free study
  const [planData, studentRes, promptTemplate] = await Promise.all([
```

This ensures the `Promise.all` (which fetches `getPrompt("chat_tutor")`) is never reached for companion mode.

- [ ] **Step 3: Typecheck**

```bash
pnpm tsc --noEmit
```
Expected: passes.

---

## Task 5: chat-tutor.ts — buildSystemPrompt companion branch

**Files:**
- Modify: `web/src/lib/services/orchestrators/chat-tutor.ts`

- [ ] **Step 1: Add early-return branch at the top of `buildSystemPrompt`**

Locate the function `async function buildSystemPrompt(session, allMessages, studentId)` (around line 725). Replace its body's prelude (the lines extracting `subjectCode`, `mood`, `runningSummary`, `blockPhase`, `currentBlockIndex`, `sessionTopicId`) with:

```ts
async function buildSystemPrompt(
  session: Record<string, unknown>,
  allMessages: ChatMessage[],
  studentId: string,
): Promise<string> {
  const subjectCode = (session.subject_code as string) ?? "0620";
  const sessionType = (session.session_type as string) ?? "chat_tutor";
  const sessionTopicId = (session.syllabus_topic_id as string) ?? null;

  // ── Companion path: minimal prompt, no plan, no memories, no nudges ──
  if (sessionType === "study_companion") {
    return await buildCompanionSystemPrompt({ subjectCode, sessionTopicId, studentId });
  }
  // ── End companion path ──

  // (existing chat_tutor logic continues unchanged below)
  const mood = (session.mood as string) ?? "normal";
  const runningSummary = (session.running_summary as string) ?? "";
  const blockPhase = (session.block_phase as string) ?? "intro";
  const currentBlockIndex = (session.current_block_index as number) ?? 0;
```

(Continue with existing function body.)

- [ ] **Step 2: Add the companion-specific builder helper AFTER `SUBJECT_DISPLAY_NAMES`**

Critical: `SUBJECT_DISPLAY_NAMES` is a `const` declared at line ~1328, which means it lives in the temporal dead zone before that line. Functions referencing it from earlier positions in the file would crash at runtime even though tsc accepts them. Place `buildCompanionSystemPrompt` AFTER the `SUBJECT_DISPLAY_NAMES` declaration.

Locate `const SUBJECT_DISPLAY_NAMES` (around line 1328). Insert the new function **immediately after that const block** (between `SUBJECT_DISPLAY_NAMES` and `function buildFreeStudyContextGreeting` at line ~1334):

```ts
// ── Companion System Prompt Builder ─────────────────────────
async function buildCompanionSystemPrompt(params: {
  subjectCode: string;
  sessionTopicId: string | null;
  studentId: string;
}): Promise<string> {
  const { subjectCode, sessionTopicId, studentId } = params;

  const factsQuery = sessionTopicId
    ? supabaseAdmin
        .from("atomic_facts")
        .select("fact_text")
        .eq("syllabus_topic_id", sessionTopicId)
        .limit(30)
    : supabaseAdmin
        .from("atomic_facts")
        .select("fact_text")
        .eq("subject_code", subjectCode)
        .limit(20);

  const [promptTemplate, studentRes, factsRes] = await Promise.all([
    getPrompt("chat_tutor_companion"),
    supabaseAdmin.from("students").select("name").eq("id", studentId).single(),
    factsQuery,
  ]);

  const studentName =
    ((studentRes.data?.name as string) ?? "").split(" ")[0] || "there";
  const languageName = SUBJECT_LANGUAGE[subjectCode] ?? "English";
  const subjectName = SUBJECT_DISPLAY_NAMES[subjectCode] ?? subjectCode;
  const factsText = (factsRes.data ?? [])
    .map((f) => `- ${f.fact_text as string}`)
    .join("\n");

  return promptTemplate
    .replace(/\{\{student_name\}\}/g, studentName)
    .replace(/\{\{subject_name\}\}/g, subjectName)
    .replace(/\{\{language_name\}\}/g, languageName)
    .replace(/\{\{relevant_facts\}\}/g, factsText || "No specific facts loaded.");
}
// ── End companion builder ──
```

- [ ] **Step 3: Typecheck**

```bash
pnpm tsc --noEmit
```
Expected: passes.

---

## Task 6: chat-tutor.ts — sendMessage companion bypass

**Files:**
- Modify: `web/src/lib/services/orchestrators/chat-tutor.ts`

- [ ] **Step 1: Add session_type detection in sendMessage**

Inside `sendMessage` (line 158), after the line that loads `session` from the DB (around line 184, just after the `session` const is set), append:

```ts
const sessionType = (session.session_type as string) ?? "chat_tutor";
```

- [ ] **Step 2: Bypass intent detection / save / summarize for companion**

Locate the `// Phase 2: Detect intent + generate diagrams` block inside the ReadableStream `start(controller)` callback (around line 278). Wrap its entire body in a guard:

Replace:
```ts
      // Phase 2: Detect intent + generate diagrams (server-side, reliable)
      try {
        const currentBlockIndex = (session.current_block_index as number) ?? 0;
        const planData = await getTodayPlan(studentId);
```

with:

```ts
      // Phase 2: Detect intent + generate diagrams (server-side, reliable)
      // Companion sessions skip the entire post-stream pipeline:
      // no detectAction (no plan fetch), no actions, no progressiveSummarize,
      // no saveMemory — prevents leaking mark scheme into tutor_memory.
      if (sessionType === "study_companion") {
        try {
          await supabaseAdmin.from("chat_messages").insert({
            session_id: sessionId,
            role: "assistant",
            content: fullResponse,
          });
        } catch (err) {
          console.error("[sendMessage:companion] save error:", err);
        }
        controller.close();
        return;
      }

      try {
        const currentBlockIndex = (session.current_block_index as number) ?? 0;
        const planData = await getTodayPlan(studentId);
```

- [ ] **Step 3: Typecheck**

```bash
pnpm tsc --noEmit
```
Expected: passes.

---

## Task 7: chat-tutor.ts — endSession companion bypass

**Files:**
- Modify: `web/src/lib/services/orchestrators/chat-tutor.ts`

- [ ] **Step 1: Add bypass at top of `endSession`**

Inside `endSession` (line 626), after the `if (!session) throw new Error(...)` line (around line 636), insert:

```ts
  // Companion sessions never persist to tutor_memory — would leak mark scheme.
  if ((session.session_type as string) === "study_companion") {
    await supabaseAdmin
      .from("study_sessions")
      .update({ status: reason, ended_at: new Date().toISOString() })
      .eq("id", sessionId);
    return { blocks_completed: 0, blocks_total: 0 };
  }
```

- [ ] **Step 2: Typecheck**

```bash
pnpm tsc --noEmit
```
Expected: passes.

- [ ] **Step 3: Commit (backend orchestrator)**

```bash
git add web/src/lib/types.ts web/src/lib/services/orchestrators/chat-tutor.ts
git commit -m "feat(chat-tutor): add study_companion session_type with full bypass

- New mode='companion' branch in startSession (minimal session, custom greeting)
- buildSystemPrompt branches by session_type to use chat_tutor_companion prompt
- sendMessage skips intent detection / progressiveSummarize for companion
- endSession skips generateBlockSummary / saveMemory for companion
- Prevents mark scheme leakage into tutor_memory"
```

---

## Task 8: API route — /api/session/start

**Files:**
- Modify: `web/src/app/api/session/start/route.ts`

- [ ] **Step 1: Update zod schema and pass through**

Replace the file contents with:

```ts
import { errorResponse } from "@/lib/errors";
import { startSession } from "@/lib/services/orchestrators/chat-tutor";
import { z } from "zod";
import { getStudentId } from "@/lib/auth-helpers";

const schema = z.object({
  mood: z.enum(["unmotivated", "normal", "good", "motivated"]),
  subject_code: z.string().optional(),
  topic_id: z.string().uuid().optional(),
  mode: z.enum(["tutor", "review", "companion"]).optional(),
  parent_session_id: z.string().uuid().optional(),
});

export async function POST(request: Request) {
  try {
    const studentId = await getStudentId();
    const body = await request.json();
    const input = schema.parse(body);
    const result = await startSession(input.mood, studentId, {
      subjectCode: input.subject_code,
      topicId: input.topic_id,
      mode: input.mode,
      parentSessionId: input.parent_session_id,
    });
    return Response.json(result);
  } catch (error) {
    return errorResponse(error);
  }
}
```

- [ ] **Step 2: Typecheck**

```bash
pnpm tsc --noEmit
```
Expected: passes.

---

## Task 9: API client — extend startChatSession

**Files:**
- Modify: `web/src/lib/api.ts:651-666`

- [ ] **Step 1: Replace startChatSession with extended signature**

Replace lines 651–666:
```ts
export async function startChatSession(
  mood: string,
  options?: { subject_code?: string; topic_id?: string; mode?: "tutor" | "review" },
) {
```
with:
```ts
export async function startChatSession(
  mood: string,
  options?: {
    subject_code?: string;
    topic_id?: string;
    mode?: "tutor" | "review" | "companion";
    parent_session_id?: string;
  },
) {
```

(The body is unchanged — `JSON.stringify({ mood, ...options })` already forwards `parent_session_id` if present.)

- [ ] **Step 2: Typecheck**

```bash
pnpm tsc --noEmit
```
Expected: passes.

- [ ] **Step 3: Commit (API surface)**

```bash
git add web/src/app/api/session/start/route.ts web/src/lib/api.ts
git commit -m "feat(api): accept mode='companion' and parent_session_id on session start"
```

---

## Task 10: Frontend types — companion-context.ts

**Files:**
- Create: `web/src/lib/companion-context.ts`

- [ ] **Step 1: Write the type + serializer**

```ts
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
```

- [ ] **Step 2: Typecheck**

```bash
pnpm tsc --noEmit
```
Expected: passes.

---

## Task 11: ChatMessage strip on render

**Files:**
- Modify: `web/src/components/session/ChatMessage.tsx`

- [ ] **Step 1: Import the strip helper**

Add to the imports at the top:
```ts
import { stripCompanionContext } from "@/lib/companion-context";
```

- [ ] **Step 2: Strip user content before rendering**

Inside the component, before the JSX return, add:
```ts
const displayContent = role === "user" ? stripCompanionContext(content) : content;
```

Then in the JSX, replace the two occurrences of `{content}` (one inside the `isAssistant` branch around line 97, one in the `else` branch around line 104) with `{displayContent}`.

Important: `<ChatRichText content={content} />` for the assistant branch should also use `displayContent` for consistency, even though assistant messages should never contain the tag — defense in depth.

- [ ] **Step 3: Typecheck**

```bash
pnpm tsc --noEmit
```
Expected: passes.

---

## Task 11b: Extend useChatStream with sessionIdOverride

**Why:** Without this, `useCompanionChat` cannot reliably send the first message after lazy session creation. `useChatStream`'s `sendMessage` captures `sessionId` in a closure at the render in which `chat` was created — when the companion lazily creates a session, the `chat` object in scope was rendered with `sessionId = null`. Calling `chat.sendMessage` immediately after session creation would silently return early because the state update has not yet committed.

The fix is additive and non-breaking: add an optional 3rd parameter to `chat.sendMessage` that overrides the closure-captured `sessionId`.

**Files:**
- Modify: `web/src/hooks/use-chat-stream.ts:45-130`

- [ ] **Step 1: Modify `sendMessage` to accept a sessionIdOverride**

Replace the `sendMessage` callback (lines 45–131) so its signature accepts an optional `sessionIdOverride`:

```ts
  const sendMessage = useCallback(
    async (text: string, attachments?: Attachment[], sessionIdOverride?: string) => {
      const sid = sessionIdOverride ?? sessionId;
      if (!sid) return;

      // Add user message to local state
      addMessage({
        session_id: sid,
        role: "user",
        content: text,
        images: [],
        attachments: attachments ?? [],
        action: null,
        internal: null,
      });

      setState((prev) => ({
        ...prev,
        isStreaming: true,
        streamingText: "",
        lastAction: null,
        error: null,
      }));

      try {
        const response = await sendSessionMessage(sid, text, attachments);

        let fullText = "";
        let action: TutorAction | null = null;
        let internal: TutorInternal | null = null;

        for await (const chunk of parseSessionStream(response)) {
          switch (chunk.type) {
            case "text":
              fullText += chunk.content;
              setState((prev) => ({
                ...prev,
                streamingText: fullText,
              }));
              break;
            case "action":
              action = chunk.data;
              break;
            case "internal":
              internal = chunk.data;
              break;
            case "error":
              setState((prev) => ({ ...prev, error: chunk.message }));
              break;
          }
        }

        // Add completed assistant message
        const assistantMsg: Omit<ChatMessage, "id" | "created_at"> = {
          session_id: sid,
          role: "assistant",
          content: fullText,
          images: [],
          action,
          internal,
        };

        setState((prev) => ({
          ...prev,
          messages: [
            ...prev.messages,
            {
              ...assistantMsg,
              id: crypto.randomUUID(),
              created_at: new Date().toISOString(),
            },
          ],
          streamingText: "",
          isStreaming: false,
          lastAction: action,
          lastInternal: internal,
        }));
      } catch (err) {
        setState((prev) => ({
          ...prev,
          isStreaming: false,
          streamingText: "",
          error: err instanceof Error ? err.message : "Failed to send message",
        }));
      }
    },
    [sessionId, addMessage],
  );
```

The only changes vs. the original: signature has the third optional param, `const sid = sessionIdOverride ?? sessionId;` at the top, and all uses of `sessionId` inside the body are replaced with `sid`. Existing callers that pass only 1 or 2 arguments are unaffected.

- [ ] **Step 2: Typecheck**

```bash
pnpm tsc --noEmit
```
Expected: passes. Existing free-study session callers continue to work without changes.

---

## Task 12: useCompanionChat hook

**Files:**
- Create: `web/src/hooks/use-companion-chat.ts`

- [ ] **Step 1: Write the hook**

Notes on the implementation:
- `chatRef` holds the latest `chat` object so `ensureSession` and `sendMessage` callbacks remain stable across renders (avoids re-render storms and stale-closure issues).
- `ensureSession` returns the resolved session id, which is then passed as `sessionIdOverride` to `chat.sendMessage` — bypassing the React state-commit lag entirely.

```ts
import { useCallback, useEffect, useRef, useState } from "react";
import { useChatStream } from "@/hooks/use-chat-stream";
import { startChatSession, endChatSession } from "@/lib/api";
import {
  serializeCompanionContext,
  type CompanionContext,
} from "@/lib/companion-context";

export interface UseCompanionChatOptions {
  parentSessionId: string | null;
  subjectCode: string;
  topicId?: string;
  /** Ref kept fresh by the parent — read at send time, never captured. */
  contextRef: React.MutableRefObject<CompanionContext>;
}

export function useCompanionChat(opts: UseCompanionChatOptions) {
  const [companionSessionId, setCompanionSessionId] = useState<string | null>(null);
  const creatingRef = useRef<Promise<string> | null>(null);
  const greetingSeededRef = useRef(false);
  const chat = useChatStream(companionSessionId);

  // Stable ref to the latest chat object — keeps callbacks stable across renders.
  const chatRef = useRef(chat);
  useEffect(() => {
    chatRef.current = chat;
  }, [chat]);

  const ensureSession = useCallback(async (): Promise<string> => {
    if (companionSessionId) return companionSessionId;
    if (!creatingRef.current) {
      creatingRef.current = startChatSession("normal", {
        subject_code: opts.subjectCode,
        topic_id: opts.topicId,
        mode: "companion",
        parent_session_id: opts.parentSessionId ?? undefined,
      }).then((data) => {
        // Seed the greeting once into the local message list so the UI shows it.
        if (!greetingSeededRef.current) {
          greetingSeededRef.current = true;
          chatRef.current.addMessage({
            session_id: data.session_id,
            role: "assistant",
            content: data.tutor_greeting,
            images: [],
            action: null,
            internal: null,
          });
        }
        return data.session_id;
      });
    }
    const sid = await creatingRef.current;
    setCompanionSessionId(sid);
    return sid;
  }, [companionSessionId, opts.parentSessionId, opts.subjectCode, opts.topicId]);

  const sendMessage = useCallback(
    async (text: string) => {
      const sid = await ensureSession();
      const ctxBlock = serializeCompanionContext(opts.contextRef.current);
      // Pass `sid` as override — chat.sendMessage's closure-captured sessionId
      // may still be null on this render (state hasn't committed yet).
      await chatRef.current.sendMessage(`${ctxBlock}\n\n${text}`, undefined, sid);
    },
    [ensureSession, opts.contextRef],
  );

  const cleanup = useCallback(() => {
    if (companionSessionId) {
      endChatSession(companionSessionId, "completed").catch(() => {
        // fire-and-forget, do not block navigation
      });
    }
  }, [companionSessionId]);

  return {
    messages: chat.messages,
    streamingText: chat.streamingText,
    isStreaming: chat.isStreaming,
    error: chat.error,
    sendMessage,
    cleanup,
    sessionId: companionSessionId,
  };
}
```

- [ ] **Step 2: Typecheck**

```bash
pnpm tsc --noEmit
```
Expected: passes.

---

## Task 13: CompanionPanel component

**Files:**
- Create: `web/src/components/companion/companion-panel.tsx`

- [ ] **Step 1: Write the panel**

The empty-state hint is rendered as plain text above the always-mounted `ChatPanel` (which provides both message list + input). When messages arrive, the hint disappears naturally.

```tsx
"use client";

import { GraduationCap } from "lucide-react";
import { useImperativeHandle, forwardRef } from "react";
import { ChatPanel } from "@/components/session/ChatPanel";
import { useCompanionChat } from "@/hooks/use-companion-chat";
import type { CompanionContext } from "@/lib/companion-context";

export interface CompanionPanelHandle {
  cleanup: () => void;
}

export interface CompanionPanelProps {
  parentSessionId: string | null;
  subjectCode: string;
  topicId?: string;
  contextRef: React.MutableRefObject<CompanionContext>;
}

export const CompanionPanel = forwardRef<CompanionPanelHandle, CompanionPanelProps>(
  function CompanionPanel(
    { parentSessionId, subjectCode, topicId, contextRef },
    ref,
  ) {
    const companion = useCompanionChat({
      parentSessionId,
      subjectCode,
      topicId,
      contextRef,
    });

    useImperativeHandle(ref, () => ({ cleanup: companion.cleanup }), [companion.cleanup]);

    if (!parentSessionId) return null;

    const showEmptyHint = companion.messages.length === 0 && !companion.isStreaming;

    return (
      <div className="flex flex-col h-full">
        {/* Header */}
        <div className="flex items-center gap-2 px-4 py-3 border-b border-border/50 shrink-0">
          <div className="w-7 h-7 rounded-lg bg-primary/10 flex items-center justify-center">
            <GraduationCap className="w-4 h-4 text-primary" />
          </div>
          <div>
            <p className="text-sm font-semibold text-foreground">Tutor</p>
            <p className="text-[10px] text-muted-foreground">
              I&apos;ll guide you — never give the answer.
            </p>
          </div>
        </div>

        {showEmptyHint && (
          <div className="px-6 pt-6 pb-2 text-center text-sm text-muted-foreground">
            Stuck? Ask the tutor anything about this question.
          </div>
        )}

        <div className="flex-1 min-h-0">
          <ChatPanel
            messages={companion.messages}
            streamingText={companion.streamingText}
            isStreaming={companion.isStreaming}
            onSendMessage={(text) => companion.sendMessage(text)}
            disabled={false}
          />
        </div>
      </div>
    );
  },
);
```

- [ ] **Step 2: Typecheck**

```bash
pnpm tsc --noEmit
```
Expected: passes.

- [ ] **Step 3: Commit (frontend foundation)**

```bash
git add web/src/lib/companion-context.ts web/src/components/session/ChatMessage.tsx web/src/hooks/use-companion-chat.ts web/src/components/companion/companion-panel.tsx
git commit -m "feat(companion): context type, chat hook, panel component, message strip"
```

---

## Task 14: Flashcard session page integration

**Files:**
- Modify: `web/src/app/study/flashcards/session/page.tsx`

- [ ] **Step 1: Add imports**

After the existing imports (around line 12):
```ts
import { CompanionPanel, type CompanionPanelHandle } from "@/components/companion/companion-panel";
import type { CompanionContext } from "@/lib/companion-context";
```

- [ ] **Step 2: Track flashcard self-rating in state**

Inside `FlashcardSessionInner`, after the existing `lastMastery` state (around line 46), add:
```tsx
  const [lastResult, setLastResult] = useState<"know" | "partial" | "dunno" | null>(null);
```

In `handleResult` (line 92), at the top of the function (right after the early returns, around line 95), add:
```tsx
      setLastResult(result);
```
And in the part where the next card is loaded (the `if (currentIndex < cards.length - 1)` branch around line 118), reset:
```tsx
          setLastResult(null);
```

- [ ] **Step 3: Build and maintain context ref**

After all state hooks, add:
```tsx
  const companionContextRef = useRef<CompanionContext>({
    mode: "flashcard",
    topic: null,
    question: "",
    diagramUrls: [],
    studentAttempt: null,
    expectedAnswer: null,
    markScheme: null,
    overallFeedback: null,
  });

  useEffect(() => {
    const card = cards[currentIndex];
    if (!card) return;
    companionContextRef.current = {
      mode: "flashcard",
      topic: card.topic_name ?? null,
      question: card.question ?? card.flashcard_front ?? card.fact_text ?? "",
      diagramUrls: [],
      studentAttempt: lastResult,
      expectedAnswer: flipped ? explanation : null,
      markScheme: null,
      overallFeedback: null,
    };
  }, [cards, currentIndex, flipped, explanation, lastResult]);

  const companionRef = useRef<CompanionPanelHandle>(null);
```

- [ ] **Step 4: Cleanup on session end**

Modify `endFlashcards` callsite in `handleResult` (around line 123) — wrap the navigation:
```tsx
          const summary = await endFlashcards(sessionId);
          companionRef.current?.cleanup();
          setSummaryData(summary);
          setPhase("summary");
```

In the summary `onBack` callback (around line 157):
```tsx
        onBack={() => {
          companionRef.current?.cleanup();
          router.push("/study/flashcards");
        }}
```

(The `onRestart` keeps the same companion since the session continues — no cleanup there.)

- [ ] **Step 5: Wrap layout in 60/40 split**

Locate the loading return (line 136) and the playing return (line 179). The CompanionPanel should only mount once `sessionId` is ready and we are in `playing` phase (avoids creating empty ref state during loading).

Replace the closing of the playing render (line 179 onwards) so the existing `<div className="max-w-2xl mx-auto space-y-6">...</div>` becomes the LEFT pane, with the companion as the right pane:

Replace:
```tsx
  return (
    <div className="max-w-2xl mx-auto space-y-6">
      {/* Progress bar */}
      ...
      {/* Buttons (only when flipped) */}
      {flipped && !lastMastery && (
        <FlashcardButtons onResult={handleResult} disabled={answering} />
      )}
    </div>
  );
```

with:
```tsx
  return (
    <div className="flex h-[calc(100vh-80px)] -my-5 -mx-8">
      <div className="flex-[6] overflow-y-auto px-8 py-6">
        <div className="max-w-2xl mx-auto space-y-6">
          {/* Progress bar */}
          ...
          {/* Buttons (only when flipped) */}
          {flipped && !lastMastery && (
            <FlashcardButtons onResult={handleResult} disabled={answering} />
          )}
        </div>
      </div>
      <div className="flex-[4] hidden md:flex border-l border-border/50 bg-card/30 flex-col">
        <CompanionPanel
          ref={companionRef}
          parentSessionId={sessionId}
          subjectCode={subjectCode}
          topicId={topicId}
          contextRef={companionContextRef}
        />
      </div>
    </div>
  );
```

(Preserve the existing inner JSX between the `<div className="max-w-2xl mx-auto space-y-6">` and its closing `</div>` exactly — only the wrapper changes.)

- [ ] **Step 6: Typecheck**

```bash
pnpm tsc --noEmit
```
Expected: passes.

---

## Task 15: Quiz session page integration

**Files:**
- Modify: `web/src/app/study/quiz/session/page.tsx`

- [ ] **Step 1: Add imports**

After the existing imports (around line 14):
```ts
import { CompanionPanel, type CompanionPanelHandle } from "@/components/companion/companion-panel";
import type { CompanionContext } from "@/lib/companion-context";
```

- [ ] **Step 2: Track last user answer**

Inside `QuizSessionInner`, after the existing state hooks (around line 64), add:
```tsx
  const [lastUserAnswer, setLastUserAnswer] = useState<string | null>(null);
```

In `handleSubmit` (line 88), set it at the top:
```tsx
      setLastUserAnswer(answer);
```

In `handleNext` (line 124), in the branch that advances to the next question:
```tsx
      setCurrentIndex((i) => i + 1);
      setEvaluation(null);
      setLastUserAnswer(null);
      setPhase("answering");
```

- [ ] **Step 3: Build and maintain context ref**

After state hooks:
```tsx
  const companionContextRef = useRef<CompanionContext>({
    mode: "quiz",
    topic: null,
    question: "",
    diagramUrls: [],
    studentAttempt: null,
    expectedAnswer: null,
    markScheme: null,
    overallFeedback: null,
  });

  useEffect(() => {
    const q = questions[currentIndex];
    if (!q) return;
    const inFeedback = phase === "feedback" && evaluation !== null;
    companionContextRef.current = {
      mode: "quiz",
      topic: null,
      question: q.question_text,
      diagramUrls: q.diagram_urls ?? [],
      studentAttempt: inFeedback ? lastUserAnswer : null,
      expectedAnswer: null,
      markScheme: inFeedback
        ? evaluation!.mark_points.map((mp) => ({
            description: mp.description,
            awarded: mp.awarded,
          }))
        : null,
      overallFeedback: inFeedback ? evaluation!.overall_feedback : null,
    };
  }, [questions, currentIndex, phase, evaluation, lastUserAnswer]);

  const companionRef = useRef<CompanionPanelHandle>(null);
```

(Note: `topic` is null because the existing `Question` interface in this file does not carry `topic_name`. Acceptable — the prompt has the topic name from the session row.)

- [ ] **Step 4: Cleanup on session end**

In `handleNext` (line 124), inside the else branch where the quiz ends. **Critical:** call `companionRef.current?.cleanup()` BEFORE `setPhase("summary")`. Once `setPhase("summary")` runs, the component renders the summary view, the CompanionPanel unmounts, and `companionRef.current` becomes null — `endChatSession` would never fire, leaving the session `active` forever.

```tsx
      if (sessionId) {
        try {
          const summary = await endQuiz(sessionId);
          setSummaryData(summary);
        } catch {
          ...existing fallback...
        }
      }
      companionRef.current?.cleanup();   // BEFORE setPhase("summary")
      setPhase("summary");
      if (timerRef.current) clearInterval(timerRef.current);
```

In `QuizSummary onBack`:
```tsx
        onBack={() => {
          companionRef.current?.cleanup();
          router.push("/study/quiz");
        }}
```
And `onNew`:
```tsx
        onNew={() => {
          companionRef.current?.cleanup();
          router.push("/study/quiz");
        }}
```
(`onRetry={() => window.location.reload()}` is fine — the page unmounts.)

- [ ] **Step 5: Wrap layout in 60/40 split**

Replace the playing render (line 178 onwards):
```tsx
  return (
    <div className="max-w-3xl mx-auto space-y-6">
      ...existing...
    </div>
  );
```

with:
```tsx
  return (
    <div className="flex h-[calc(100vh-80px)] -my-5 -mx-8">
      <div className="flex-[6] overflow-y-auto px-8 py-6">
        <div className="max-w-3xl mx-auto space-y-6">
          ...existing inner content unchanged...
        </div>
      </div>
      <div className="flex-[4] hidden md:flex border-l border-border/50 bg-card/30 flex-col">
        <CompanionPanel
          ref={companionRef}
          parentSessionId={sessionId}
          subjectCode={subjectCode}
          topicId={topicId}
          contextRef={companionContextRef}
        />
      </div>
    </div>
  );
```

- [ ] **Step 6: Typecheck**

```bash
pnpm tsc --noEmit
```
Expected: passes.

- [ ] **Step 7: Commit (integration)**

```bash
git add web/src/app/study/flashcards/session/page.tsx web/src/app/study/quiz/session/page.tsx
git commit -m "feat(study): companion panel alongside flashcards and quizzes"
```

---

## Task 16: Manual integration verification

This step requires the dev server. The agent runs it; the human is not present.

- [ ] **Step 1: Start dev server**

```bash
pnpm --filter web dev
```

Run in background. Wait for "Ready in" line.

- [ ] **Step 2: Navigate via the existing test flow**

The agent should not assume a browser is wired. Instead, verify what can be verified server-side:

```bash
pnpm --filter web build
```
Expected: build succeeds with no type errors.

- [ ] **Step 3: Verify DB state after a smoke test**

If feasible (Supabase MCP available), insert a fake parent session + companion session via SQL to verify FK + cascade behavior:
```sql
-- (illustrative — only run if test data is acceptable)
WITH parent AS (
  INSERT INTO study_sessions (student_id, session_type, status)
  VALUES (
    (SELECT id FROM students LIMIT 1),
    'flashcard',
    'active'
  )
  RETURNING id
),
companion AS (
  INSERT INTO study_sessions (student_id, session_type, status, parent_session_id)
  VALUES (
    (SELECT id FROM students LIMIT 1),
    'study_companion',
    'active',
    (SELECT id FROM parent)
  )
  RETURNING id, parent_session_id
)
SELECT * FROM companion;
```

If running this would pollute production data, **skip** and rely on type-level guarantees + the build pass.

- [ ] **Step 4: Stop dev server**

Kill the background process.

- [ ] **Step 5: Final commit if any fixups were made**

```bash
git status
# Only commit if changes exist
```

---

## Self-Review Checklist (run before declaring done)

- [ ] Every spec requirement (R1–R6) maps to a task:
  - R1 (60/40 split desktop) → Tasks 14, 15 (flex layout + `hidden md:flex`)
  - R2 (auto context) → Task 10 (CompanionContext) + Tasks 14, 15 (build/update via useEffect)
  - R3 (continuous conversation) → Task 12 (sessionId persists across cards in `useCompanionChat`)
  - R4 (Socratic) → Task 2 (prompt) + Task 5 (slug switch in buildSystemPrompt)
  - R5 (mobile graceful) → Tasks 14, 15 (`hidden md:flex`)
  - R6 (no memory leak) → Tasks 6, 7 (sendMessage + endSession bypasses)
- [ ] No `any` types introduced.
- [ ] No `console.log` (only `console.error` for catch blocks, mirroring existing code).
- [ ] No new dependencies added.
- [ ] All file paths are absolute or correctly relative to repo root.
- [ ] Each task ends with a typecheck or commit step.

---

## Risks & rollback

If any task fails typecheck and cannot be fixed within the task's scope:
1. Revert the in-progress task: `git checkout -- <files>`.
2. Continue with remaining independent tasks (most are independent except Tasks 14/15 depend on 10–13).
3. Document the failure in the commit message of the partial work.

If the migration causes issues, rollback:
```sql
DROP INDEX IF EXISTS idx_sessions_parent;
ALTER TABLE study_sessions DROP COLUMN IF EXISTS parent_session_id;
```
