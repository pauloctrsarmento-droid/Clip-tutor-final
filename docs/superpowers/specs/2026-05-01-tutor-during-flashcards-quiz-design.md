# Design — Tutor companion during flashcards & quizzes

**Date:** 2026-05-01
**Author:** Paulo (with Claude)
**Status:** Approved, ready for implementation plan

## Problem

Luísa (IGCSE Cambridge June 2026) currently has Free Study chat tutor and standalone flashcards/quizzes — but during practice she has no way to ask "why am I wrong?" or "explain this" without abandoning the session. She needs an "Ask the tutor" panel persistently available alongside flashcards and quiz questions, with full context of what she is looking at, that **guides her to the answer instead of revealing it**.

## Hard requirements

| # | Requirement |
|---|---|
| R1 | Persistent split layout (60% study / 40% companion) on flashcard and quiz session pages — desktop only |
| R2 | Tutor sees current card/question + topic + diagrams + (after attempt) student answer + mark scheme |
| R3 | Conversation persists across cards within a single study session — one chat session per study session |
| R4 | Tutor uses Socratic method — **never** reveals the final answer, even if begged |
| R5 | Mobile gracefully degrades to study-only (panel hidden) |
| R6 | No leakage of mark scheme / correct answers into long-term tutor memory (tutor_memory table) |

## Architecture

Reuse the existing `chat-tutor` orchestrator with a new `mode='companion'` and a new prompt template, persisted as a new `session_type='study_companion'`.

```
┌──────────────────────────────────────────────────────────────┐
│  /study/{flashcards|quiz}/session  (page.tsx)                │
│  ┌─────────────────────────────┬─────────────────────────────┐│
│  │ flex-[6] — study side       │ flex-[4] — CompanionPanel   ││
│  │  (existing UI unchanged)    │  ┌────────────────────────┐ ││
│  │                             │  │ ChatPanel (reused)     │ ││
│  │  on card change →           │  │  ChatInput / Message   │ ││
│  │  setCompanionContext({...}) │  └────────────────────────┘ ││
│  └─────────────────────────────┴─────────────────────────────┘│
│                useCompanionChat(parentSessionId, ctxRef)      │
└────────────────┬─────────────────────────────────────────────-┘
                 │ POST /api/session/start  (mode='companion', parent_session_id)
                 │ POST /api/session/message
                 ▼
        ┌────────────────────────────────────┐
        │ chat-tutor.ts orchestrator         │
        │  branches on session_type:         │
        │  - 'study_companion' → companion   │
        │      prompt, no actions, no plan,  │
        │      no progressiveSummarize,      │
        │      no saveMemory                 │
        │  - 'chat_tutor' → unchanged        │
        └────────────────────────────────────┘
```

**New components**
- `CompanionPanel` (React, desktop-only)
- `useCompanionChat` hook (wraps `useChatStream`, lazy session creation, context injection)
- `chat_tutor_companion` prompt (DB row in `prompts` table)
- `serializeCompanionContext()` helper

**Modified**
- `chat-tutor.ts` orchestrator (new branch for `session_type='study_companion'`)
- `/api/session/start` zod schema (accept `mode='companion'` + `parent_session_id`)
- Flashcard and Quiz session pages (wrap content in 60/40 flex split)
- `ChatMessage` (strip `[STUDY_CONTEXT]` block before rendering user messages)

**One DB migration**
```sql
ALTER TABLE study_sessions
  ADD COLUMN IF NOT EXISTS parent_session_id UUID
  REFERENCES study_sessions(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_sessions_parent
  ON study_sessions(parent_session_id);
```

`session_type` is plain TEXT — adding `'study_companion'` value needs no schema change.

## Data flow

### Lifecycle (lazy)

The companion `study_sessions` row is created **only when she sends her first message**, not on panel render. Avoids empty rows for sessions where she never opens the tutor.

```
user opens /study/quiz/session
  ├─ quiz session created (existing flow)
  └─ CompanionPanel renders empty state — no API call

user types first message
  ├─ creatingRef mutex prevents duplicate creates on rapid double-send
  ├─ POST /api/session/start { mode:'companion', parent_session_id, subject_code, topic_id }
  │    → study_sessions row inserted (session_type='study_companion')
  └─ POST /api/session/message { session_id, message: <ctx>+<user_text> }

user changes card/question
  └─ useEffect updates contextRef.current — no API call

study session ends (Back / endQuiz / endFlashcards)
  └─ endChatSession(companionSessionId, 'completed') fire-and-forget
       → branch in endSession() skips memory save for study_companion
```

### Per-turn context injection

Frontend keeps a `contextRef: React.MutableRefObject<CompanionContext>` updated on every card/question change. In `useCompanionChat.sendMessage`, the latest context is serialized and prepended to the user's message:

```
[STUDY_CONTEXT]
mode: quiz
topic: Stoichiometry
question: Calculate the moles of CO₂ when 4.4g of propane burns completely.
diagram_urls: []
student_answer: 0.1 mol
mark_scheme:
  - 1/2: identifies n(propane) = 0.1 mol ✓
  - 0/1: applies 1:3 mole ratio ✗
  - 0/1: gives final answer with units ✗
overall_feedback: Good start with the moles of propane. Reconsider the balanced equation.
[/STUDY_CONTEXT]

I don't get why I lost marks
```

**Key rule:** `mark_scheme` and `expected_answer` are only included in `currentContext` *after the student has attempted* (flashcard flipped; quiz `phase==='feedback'`). Never before.

**Why prepend in user message (not system prompt):**
1. No system-prompt rebuild on each card change (subject + topic facts stay stable)
2. Context flows naturally through the sliding window of 30 messages
3. Tradeoff accepted: `chat_messages.content` stores polluted text — stripped at render time via regex

### Cleanup at session end

`useCompanionChat` exposes a `cleanup()` callback. The flashcard/quiz session pages call it on unmount + on explicit "Back" / completion. The cleanup fires `endChatSession(companionSessionId, 'completed')` and forgets — does not block navigation.

## Backend changes

### B1 — New prompt `chat_tutor_companion`

DB row in `prompts` table. Seeded via `scripts/seed-companion-prompt.sql` (idempotent — `INSERT ... ON CONFLICT (slug) DO NOTHING`).

Prompt structure (Socratic, hint-laddered, no actions):

```
You are a study companion guiding {{student_name}} through {{subject_name}}
({{language_name}}). She is currently practicing flashcards or quiz questions
and asking you for help with the question in front of her.

═══════════════════════════════════════════════════════════════
GOLDEN RULE: NEVER GIVE THE FINAL ANSWER.
═══════════════════════════════════════════════════════════════
Your role is to guide her TO the answer, not deliver it. If she walks away
having only copied your output, you have failed. She must construct the
understanding herself.

Non-negotiable, even if:
- She begs ("just tell me", "I don't have time")
- The answer seems trivially obvious
- She says she'll learn it later
- The mark scheme is in your context

═══════════════════════════════════════════════════════════════
INPUT FORMAT
═══════════════════════════════════════════════════════════════
Each user message may begin with [STUDY_CONTEXT]...[/STUDY_CONTEXT].
Parse silently. Never quote it back. Fields:
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
    "Apply it to the numbers/terms in the question. What do you get for
     [intermediate step]?"

  L4 (only if she's stuck after L3):
    "Walk me through the steps you'd take. I'll spot where to look closer."

  NEVER L5 — there is no level that reveals the answer. If she truly cannot
  progress, give a worked example with DIFFERENT numbers.

═══════════════════════════════════════════════════════════════
WHEN SHE GIVES A PARTIAL ANSWER
═══════════════════════════════════════════════════════════════
1. Confirm what's right SPECIFICALLY: "Yes — you correctly identified that
   propane needs 5 O₂ per molecule."
2. Point at the gap WITHOUT filling it: "But check the ratio of CO₂ to
   propane. What does the balanced equation say?"
3. Never say "the answer is..." or "you should write...".

═══════════════════════════════════════════════════════════════
WHEN SHE BEGS / GIVES UP
═══════════════════════════════════════════════════════════════
"Just tell me" / "I give up" / "no idea":
  Reply: "I won't — that's the deal. Let's break it down. Read the question
  again and tell me one thing — even one word — that you DO recognize."

If emotionally frustrated, acknowledge briefly then redirect:
  "I know it's hard. Take a breath. What's the actual word/number/symbol
  that's confusing you?"

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
```

**Placeholders used:** `{{student_name}}`, `{{subject_name}}`, `{{language_name}}`, `{{relevant_facts}}`. **Explicitly omitted:** `{{running_summary}}`, `{{mood}}`, `{{today_plan}}`, `{{block_progress}}`, `{{time_nudge}}`, `{{subject_memories}}` — none make sense for a per-question companion, and `running_summary` + `subject_memories` would re-inject leaked mark scheme into every turn.

### B2 — `chat-tutor.ts` orchestrator changes

**`startSession`:**
```ts
export interface FreeStudyOptions {
  subjectCode?: string;
  topicId?: string;
  mode?: "tutor" | "review" | "companion";
  parentSessionId?: string;
}
```

When `mode === 'companion'`:
- `session_type = 'study_companion'`
- Skip plan loading (`blocks = []`)
- Greeting: `"I'm here. Show me what you're stuck on."`
- Insert with `parent_session_id = options.parentSessionId ?? null`

**`buildSystemPrompt`:**
```ts
const sessionType = (session.session_type as string) ?? "chat_tutor";
const promptSlug = sessionType === "study_companion"
  ? "chat_tutor_companion"
  : "chat_tutor";
const promptTemplate = await getPrompt(promptSlug);
```
For companion sessions, also skip `getTodayPlan`, `loadMemories`, and `buildFreeStudyContextGreeting`-related logic. Only fetch facts (topic-scoped) + student name + language.

**`sendMessage` — companion bypass after streaming:**
```ts
// After Phase 1 (text streaming) finishes, but before Phase 2 (intent detection):
if (sessionType === "study_companion") {
  // Save assistant message and exit. No detectAction, no handleAction, 
  // no progressiveSummarize, no saveMemory.
  await supabaseAdmin.from("chat_messages").insert({
    session_id: sessionId,
    role: "assistant",
    content: fullResponse,
  });
  controller.close();
  return;
}
// existing chat_tutor flow continues here
```

**`endSession` — companion bypass:**
```ts
if ((session.session_type as string) === "study_companion") {
  // Skip generateBlockSummary + saveMemory — they would leak mark scheme 
  // into tutor_memory permanently.
  await supabaseAdmin
    .from("study_sessions")
    .update({ status: reason, ended_at: new Date().toISOString() })
    .eq("id", sessionId);
  return { blocks_completed: 0, blocks_total: 0 };
}
// existing chat_tutor end flow continues
```

### B3 — API route changes

`/api/session/start` zod schema:
```ts
const schema = z.object({
  mood: z.enum(["unmotivated", "normal", "good", "motivated"]),
  subject_code: z.string().optional(),
  topic_id: z.string().uuid().optional(),
  mode: z.enum(["tutor", "review", "companion"]).optional(),
  parent_session_id: z.string().uuid().optional(),
});
```

`/api/session/message` and `/api/session/end` need no schema changes.

## Frontend changes

### F1 — Types

```ts
// web/src/lib/types.ts (or new file)
export interface CompanionContext {
  mode: "flashcard" | "quiz";
  topic: string | null;
  question: string;
  diagramUrls: string[];
  studentAttempt: string | null;
  expectedAnswer: string | null;     // flashcards: explanation post-flip
  markScheme: Array<{ description: string; awarded: boolean }> | null;
  overallFeedback: string | null;
}
```

### F2 — `serializeCompanionContext()` helper

Pure function. Produces the `[STUDY_CONTEXT]...[/STUDY_CONTEXT]` block. Omits null fields. Co-located with the hook.

### F3 — `useCompanionChat` hook

```ts
export function useCompanionChat(opts: {
  parentSessionId: string | null;
  subjectCode: string;
  topicId?: string;
  contextRef: React.MutableRefObject<CompanionContext>;
}) {
  const [companionSessionId, setCompanionSessionId] = useState<string | null>(null);
  const creatingRef = useRef<Promise<string> | null>(null);
  const chat = useChatStream(companionSessionId);

  const sendMessage = useCallback(async (text: string) => {
    let sid = companionSessionId;
    if (!sid) {
      // Mutex prevents duplicate session rows on rapid double-send
      if (!creatingRef.current) {
        creatingRef.current = startChatSession("normal", {
          subject_code: opts.subjectCode,
          topic_id: opts.topicId,
          mode: "companion",
          parent_session_id: opts.parentSessionId ?? undefined,
        }).then(d => d.session_id);
      }
      sid = await creatingRef.current;
      setCompanionSessionId(sid);
    }
    const ctx = serializeCompanionContext(contextRef.current);
    await chat.sendMessage(`${ctx}\n\n${text}`);
  }, [companionSessionId, opts, chat, contextRef]);

  const cleanup = useCallback(() => {
    if (companionSessionId) {
      endChatSession(companionSessionId, "completed").catch(() => {});
    }
  }, [companionSessionId]);

  return { ...chat, sendMessage, cleanup };
}
```

### F4 — `CompanionPanel` component

```tsx
interface CompanionPanelProps {
  parentSessionId: string | null;
  subjectCode: string;
  topicId?: string;
  contextRef: React.MutableRefObject<CompanionContext>;
}
```

States:
- **Empty (no messages)**: centered placeholder — *"Stuck? Ask the tutor anything about this question. I'll guide you — never give the answer."*
- **Active**: thin header (`💡 Tutor`) + reused `<ChatPanel>` with placeholder *"Ask the tutor..."*
- **Loading first message**: minimal skeleton

### F5 — Page integration

Both `web/src/app/study/flashcards/session/page.tsx` and `web/src/app/study/quiz/session/page.tsx` wrap their existing content:

```tsx
// inside the page
const contextRef = useRef<CompanionContext>(buildContext(...));
useEffect(() => {
  contextRef.current = buildContext(card, flipped, lastResult, explanation);
}, [card, flipped, lastResult, explanation]);

// render
<div className="flex h-[calc(100vh-80px)] -my-5 -mx-8">
  <div className="flex-[6] overflow-y-auto px-6 py-6">
    {/* existing study UI unchanged */}
  </div>
  <div className="flex-[4] hidden md:flex border-l border-border/50 bg-card/30 flex-col">
    <CompanionPanel
      parentSessionId={sessionId}
      subjectCode={subjectCode}
      topicId={topicId}
      contextRef={contextRef}
    />
  </div>
</div>
```

`hidden md:flex` makes the panel invisible on mobile (R5).

### F6 — `ChatMessage` strip regex

Add a one-line strip applied only when `role === 'user'`:
```ts
const displayContent = role === "user"
  ? content.replace(/\[STUDY_CONTEXT\][\s\S]*?\[\/STUDY_CONTEXT\]\s*/g, "").trim()
  : content;
```

Global flag `g` handles the unlikely case where the LLM echoes the tag back into a future user message via copy-paste.

## Edge cases

| Case | Behavior |
|---|---|
| Card changes mid-stream | Active stream finishes with old context. Next message uses new context. No interrupt — confuses more. |
| She sends before context is ready | `contextRef.current` always has a value (initialized at page mount). |
| Two rapid sends before first session creates | `creatingRef` mutex — second send awaits the same promise. One session row. |
| `parentSessionId` is null (study session creation failed) | `CompanionPanel` returns null. Graceful degradation. |
| She switches topic mid-conversation | Prompt explicitly allows follow-ups — no forced re-injection. |
| API failure mid-send | `useChatStream` exposes `error`. Inline message + retry. |
| Tutor leaks answer despite prompt | Logged for prompt iteration. Not a hard guarantee — accepted as eventual rule. |
| 30+ message conversation | Sliding window already in `chat-tutor.ts` (no `progressiveSummarize` for companion — see B2). |
| Page closed before `endChatSession` fires | Session stays `active`. Acceptable (no dashboard depends on `active` state). |
| LLM somehow echoes `[STUDY_CONTEXT]` tag in its response | Rendered as-is in assistant bubble (only user messages stripped). Prompt explicitly forbids it. |

## Testing

### Vitest

| Test | What it verifies |
|---|---|
| `serializeCompanionContext omits null fields` | No leaked `mark_scheme: null` lines |
| `serializeCompanionContext produces parseable block` | Round-trip through a regex extractor |
| `ChatMessage strips STUDY_CONTEXT from user role only` | Display + assistant pass-through |
| `useCompanionChat creates session lazily` | First send triggers `startChatSession`, second does not |
| `useCompanionChat mutex prevents double-create on rapid sends` | Two rapid `sendMessage` calls → one `startChatSession` call |
| `chat-tutor: companion session loads chat_tutor_companion prompt` | Service-level test mocking `getPrompt` |
| `chat-tutor: companion sendMessage skips progressiveSummarize` | Spy ensures it is not called |
| `chat-tutor: companion endSession skips saveMemory` | Spy ensures it is not called |
| `/api/session/start accepts mode='companion' + parent_session_id` | zod parse + DB insert |

### Manual integration

| Scenario | Expected |
|---|---|
| Open quiz session, type before answering | Context has `student_answer: null`, `mark_scheme: null` |
| Submit quiz answer, then ask "why wrong?" | Context includes feedback. Tutor explains concept without quoting mark scheme. |
| Beg "just tell me" | Tutor refuses, redirects to a step. |
| Move to next question, ask follow-up | Tutor receives new context. Old conversation history retained. |
| Resize browser narrower than `md` (~768px) | Companion panel hides, study UI takes full width. |
| Close tab mid-conversation | Session stays `active`. No data loss for next visit (re-opens fresh). |
| Inspect `tutor_memory` after a companion session | No new rows for that subject. |

## Cost & limits

- ~1.5–2.5k tokens system prompt + 30-message sliding window with `[STUDY_CONTEXT]` blocks → 6–10k input tokens/turn.
- Single-user app (Luísa) — at gpt-4o pricing, ~$0.015–$0.025/turn. Hundreds of turns/day worst case ≈ €2–5/day.
- Acceptable for a single user. Not optimized for fleet usage.

## Out of scope

- Mobile-optimized UX (graceful disable only, R5)
- Voice input
- Image upload from the companion (already supported by underlying `ChatInput` if surfaced — but not configured for this flow in v1)
- Analytics dashboards on companion usage
- Multi-language UI (UI stays English; subject language follows `{{language_name}}`)

## Open implementation questions

None. All design decisions resolved during brainstorming.

## Risks acknowledged

| Risk | Mitigation |
|---|---|
| Tutor occasionally leaks the answer | Eventual rule, not hard. Logged for prompt iteration. Could add post-stream regex guard in v2. |
| Sliding window cuts off relevant earlier turn | Acceptable — 30 turns is plenty for per-question follow-ups. |
| Companion session orphaned if parent deleted | `ON DELETE SET NULL` keeps memories intact (relevant since `tutor_memory` rows survive). |
| Cost spike if she runs many sessions | Single user, capped by her own time. Not a fleet concern. |
