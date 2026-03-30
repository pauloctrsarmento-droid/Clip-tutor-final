import { supabaseAdmin } from "@/lib/supabase-server";
import { callOpenAI, callOpenAIStream } from "@/lib/openai";
import { generateDiagramImage } from "@/lib/dalle";
import type { VisionContentPart, ChatTurnMessage } from "@/lib/openai";
import { getPrompt } from "@/lib/services/prompts";
import { getTodayPlan } from "@/lib/services/study-plan";
import {
  loadMemories,
  saveMemory,
  progressiveSummarize,
  generateBlockSummary,
} from "@/lib/services/tutor-memory";
import {
  STUDENT_ID,
  SUBJECT_LANGUAGE,
  SUBJECT_LANG_CODE,
} from "@/lib/constants";
import type {
  Mood,
  StudyPlanEntry,
  ChatMessage,
  TutorAction,
  TutorInternal,
  BlockPhase,
} from "@/lib/types";

// ── Constants ──────────────────────────────────────────────

const SLIDING_WINDOW_SIZE = 30;
const SUMMARIZE_THRESHOLD = 30;
const SUMMARIZE_BATCH = 10;

// ── Start Session ──────────────────────────────────────────

export interface SessionStartResult {
  session_id: string;
  blocks: StudyPlanEntry[];
  tutor_greeting: string;
}

export async function startSession(
  mood: Mood,
  studentId = STUDENT_ID,
): Promise<SessionStartResult> {
  // Fetch today's study plan + student profile + prompt in parallel
  const [planData, studentRes, promptTemplate] = await Promise.all([
    getTodayPlan(studentId),
    supabaseAdmin
      .from("students")
      .select("tutor_prompt")
      .eq("id", studentId)
      .single(),
    getPrompt("chat_tutor"),
  ]);

  const blocks = [...planData.today, ...planData.overdue].filter(
    (b) => b.status === "pending" && b.study_type !== "exam",
  );

  // Create chat_tutor session
  const { data: session, error: sessionError } = await supabaseAdmin
    .from("study_sessions")
    .insert({
      student_id: studentId,
      session_type: "chat_tutor",
      mood,
      status: "active",
      current_block_index: 0,
      block_phase: "intro",
      subject_code: blocks[0]?.subject_code ?? null,
    })
    .select()
    .single();

  if (sessionError) throw sessionError;
  const sessionId = session.id as string;

  // Build greeting
  const firstBlock = blocks[0];
  let greeting: string;

  if (!firstBlock) {
    greeting = buildFreeStudyGreeting(mood);
  } else {
    greeting = buildGreeting(mood, blocks);
  }

  // Save greeting as first message in DB (for resume context)
  await supabaseAdmin.from("chat_messages").insert({
    session_id: sessionId,
    role: "assistant",
    content: greeting,
  });

  return {
    session_id: sessionId,
    blocks,
    tutor_greeting: greeting,
  };
}

// ── Send Message (streaming) ───────────────────────────────

export interface SendMessageOptions {
  sessionId: string;
  message: string;
  images?: string[];
  studentId?: string;
}

/**
 * Process a user message and return a combined ReadableStream.
 *
 * Architecture (v2 — bulletproof):
 * 1. Stream LLM text to frontend (pure text, no JSON, no delimiters)
 * 2. After stream ends, detect intent via gpt-4o-mini (jsonMode=true → guaranteed valid JSON)
 * 3. If diagram requested, generate Mermaid code via gpt-4o-mini
 * 4. Append <<<ACTION_JSON>>> with server-generated JSON
 * 5. Close stream
 *
 * The LLM NEVER generates JSON. All structured data is server-generated.
 */
export async function sendMessage(
  options: SendMessageOptions,
): Promise<ReadableStream<Uint8Array>> {
  const { sessionId, message, images, studentId = STUDENT_ID } = options;

  // Save user message
  await supabaseAdmin.from("chat_messages").insert({
    session_id: sessionId,
    role: "user",
    content: message,
    images: images ?? [],
  });

  // Load session state + messages + build prompt in parallel
  const [sessionRes, messagesRes] = await Promise.all([
    supabaseAdmin.from("study_sessions").select("*").eq("id", sessionId).single(),
    supabaseAdmin.from("chat_messages").select("*").eq("session_id", sessionId).order("created_at", { ascending: true }),
  ]);

  const session = sessionRes.data;
  if (!session) throw new Error("Session not found");
  const allMessages = (messagesRes.data ?? []) as ChatMessage[];

  const systemPrompt = await buildSystemPrompt(session, allMessages, studentId);

  // Build conversation history (sliding window)
  const windowMessages = allMessages.slice(-SLIDING_WINDOW_SIZE);
  const chatHistory: ChatTurnMessage[] = windowMessages.map((m) => ({
    role: m.role === "assistant" ? "assistant" as const : "user" as const,
    content: m.content,
  }));
  chatHistory.pop(); // Remove last user message (goes as current 'user' param)

  // Build user content
  let userContent: string | VisionContentPart[];
  if (images && images.length > 0) {
    userContent = [
      { type: "text" as const, text: message },
      ...images.map((url) => ({
        type: "image_url" as const,
        image_url: { url, detail: "high" as const },
      })),
    ];
  } else {
    userContent = message;
  }

  // Call OpenAI streaming (pure text — LLM never generates JSON)
  const llmStream = await callOpenAIStream({
    system: systemPrompt,
    user: userContent,
    messages: chatHistory,
    maxTokens: 1024,
  });

  const encoder = new TextEncoder();
  const decoder = new TextDecoder();

  // Build a combined ReadableStream:
  // Phase 1: pipe LLM text chunks (live streaming)
  // Phase 2: detect intent + generate diagram + append action JSON
  return new ReadableStream<Uint8Array>({
    async start(controller) {
      let fullResponse = "";

      // Phase 1: Stream LLM text to frontend
      const reader = llmStream.getReader();
      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          const text = decoder.decode(value, { stream: true });
          fullResponse += text;
          // Filter out any accidental delimiters (LLM should not produce these with new prompt)
          if (!text.includes("<<<")) {
            controller.enqueue(value);
          } else {
            const clean = text.split("<<<")[0];
            if (clean) controller.enqueue(encoder.encode(clean));
          }
        }
      } finally {
        reader.releaseLock();
      }

      // Phase 2: Detect intent + generate diagrams (server-side, reliable)
      try {
        const currentBlockIndex = (session.current_block_index as number) ?? 0;
        const planData = await getTodayPlan(studentId);
        const allBlocks = [...planData.today, ...planData.overdue].filter(b => b.study_type !== "exam");
        const currentTopicId = allBlocks[currentBlockIndex]?.syllabus_topic_ids?.[0] ?? "";

        const detected = await detectAction(
          fullResponse,
          message,
          (session.block_phase as string) ?? "explanation",
          currentTopicId,
        );

        let action = detected.action;
        const internal = detected.internal;

        // If diagram requested, generate Mermaid code
        if (action?.type === "show_diagram" && action.config.diagram_type === "mermaid") {
          const mermaidCode = await generateMermaidCode(
            action.config.title ?? "Diagram",
            fullResponse,
          );
          action = {
            type: "show_diagram",
            config: { ...action.config, mermaid_code: mermaidCode },
          };
        }

        // If DALL-E requested, generate image
        if (action?.type === "show_diagram" && action.config.diagram_type === "dalle" && action.config.dalle_prompt) {
          try {
            const imageUrl = await generateDiagramImage(action.config.dalle_prompt);
            action = { type: "show_content", config: { title: action.config.title ?? "Diagram", content: "", diagram_url: imageUrl } };
          } catch {
            action = { type: "show_content", config: { title: action.config.title ?? "Diagram", content: "Diagram generation failed." } };
          }
        }

        // Append action JSON to stream
        const meta: Record<string, unknown> = {};
        if (action) meta.action = action;
        if (internal) meta.internal = internal;
        if (Object.keys(meta).length > 0) {
          const jsonStr = "\n<<<ACTION_JSON>>>\n" + JSON.stringify(meta);
          controller.enqueue(encoder.encode(jsonStr));
        }

        // Save to DB + handle side effects (fire-and-forget)
        savePostStreamData(sessionId, fullResponse, action, internal, session, allMessages, studentId).catch((err) => {
          console.error("[sendMessage] post-stream error:", err);
        });
      } catch (err) {
        console.error("[sendMessage] intent detection error:", err);
      }

      controller.close();
    },
  });
}

// ── Intent Detection (gpt-4o-mini, jsonMode=true → guaranteed valid JSON) ──

async function detectAction(
  assistantText: string,
  userMessage: string,
  blockPhase: string,
  currentTopicId: string,
): Promise<{ action: TutorAction | null; internal: TutorInternal }> {
  const result = await callOpenAI({
    system: `You analyze a tutor's response and extract structured metadata. Return JSON with:
- "action": null OR one action object
- "internal": {"current_phase": "intro"|"explanation"|"quiz"|"transition", "time_elapsed_minutes": 0, "block_progress": "1/1"}

Available actions (use ONLY when clearly intended):
- {"type":"show_diagram","config":{"title":"...","diagram_type":"mermaid"}} — tutor describes/offers a visual diagram, flowchart, or comparison
- {"type":"show_content","config":{"title":"...","content":"..."}} — tutor presents a structured summary or reference material for the board
- {"type":"launch_quiz","config":{"topic_id":"${currentTopicId}","num_questions":6,"question_types":["mcq","short"]}} — student said yes to a quiz
- {"type":"launch_flashcards","config":{"topic_id":"${currentTopicId}","count":12}} — student said yes to flashcards
- {"type":"clear_panel","config":{}} — clear the activity panel
- {"type":"end_block","config":{"completed_block_index":0}} — transitioning to next topic
- {"type":"end_session","config":{"reason":"completed"}} — session ending

Rules:
- For show_diagram, only set title and diagram_type. Do NOT generate diagram code.
- For launch_quiz/flashcards, only emit if the STUDENT explicitly agreed (said yes, sure, ok, etc.)
- Default action is null (no action needed for normal conversation)
- current_phase should reflect what the tutor is doing: intro, explanation, quiz, or transition`,
    user: `Student said: "${userMessage}"\n\nTutor responded:\n${assistantText.slice(0, 1500)}`,
    maxTokens: 300,
    jsonMode: true,
    model: "gpt-4o-mini",
  });

  try {
    return JSON.parse(result) as { action: TutorAction | null; internal: TutorInternal };
  } catch {
    return { action: null, internal: { current_phase: blockPhase as BlockPhase, time_elapsed_minutes: 0, block_progress: "1/1" } };
  }
}

// ── Post-stream DB saves (fire-and-forget) ──────────────────

async function savePostStreamData(
  sessionId: string,
  fullResponse: string,
  action: TutorAction | null,
  internal: TutorInternal | null,
  session: Record<string, unknown>,
  allMessages: ChatMessage[],
  studentId: string,
): Promise<void> {
  // Save assistant message
  await supabaseAdmin.from("chat_messages").insert({
    session_id: sessionId,
    role: "assistant",
    content: fullResponse,
    action: action ?? undefined,
    internal: internal ?? undefined,
  });

  // Handle actions
  if (action) {
    await handleAction(sessionId, action, studentId);
  }

  // Update block phase
  if (internal) {
    await supabaseAdmin
      .from("study_sessions")
      .update({ block_phase: internal.current_phase })
      .eq("id", sessionId);
  }

  // Progressive summarization
  if (allMessages.length + 1 > SUMMARIZE_THRESHOLD) {
    const messagesToSummarize = allMessages.slice(0, SUMMARIZE_BATCH);
    const newSummary = await progressiveSummarize(
      session.running_summary as string | null,
      messagesToSummarize,
    );
    await supabaseAdmin
      .from("study_sessions")
      .update({ running_summary: newSummary })
      .eq("id", sessionId);
  }
}

// ── Pause Session ──────────────────────────────────────────

export async function pauseSession(sessionId: string): Promise<void> {
  await supabaseAdmin
    .from("study_sessions")
    .update({ status: "paused" })
    .eq("id", sessionId);
}

// ── Resume Session ─────────────────────────────────────────

export interface ResumeResult {
  session_id: string;
  current_block_index: number;
  block_phase: BlockPhase;
  history: ChatMessage[];
  tutor_greeting: string;
}

export async function resumeSession(
  sessionId: string,
  studentId = STUDENT_ID,
): Promise<ResumeResult> {
  const { data: session } = await supabaseAdmin
    .from("study_sessions")
    .select("*")
    .eq("id", sessionId)
    .single();

  if (!session) throw new Error("Session not found");

  // Load recent messages
  const { data: messages } = await supabaseAdmin
    .from("chat_messages")
    .select("*")
    .eq("session_id", sessionId)
    .order("created_at", { ascending: false })
    .limit(SLIDING_WINDOW_SIZE);

  const history = ((messages ?? []) as ChatMessage[]).reverse();

  // Generate resume greeting
  const greeting =
    "Welcome back! Let's continue where we left off.";

  // Save greeting
  await supabaseAdmin.from("chat_messages").insert({
    session_id: sessionId,
    role: "assistant",
    content: greeting,
  });

  // Update status
  await supabaseAdmin
    .from("study_sessions")
    .update({ status: "active" })
    .eq("id", sessionId);

  return {
    session_id: sessionId,
    current_block_index: session.current_block_index as number,
    block_phase: session.block_phase as BlockPhase,
    history,
    tutor_greeting: greeting,
  };
}

// ── End Session ────────────────────────────────────────────

export interface EndSessionResult {
  blocks_completed: number;
  blocks_total: number;
}

export async function endSession(
  sessionId: string,
  reason: "completed" | "interrupted",
  studentId = STUDENT_ID,
): Promise<EndSessionResult> {
  const { data: session } = await supabaseAdmin
    .from("study_sessions")
    .select("*")
    .eq("id", sessionId)
    .single();

  if (!session) throw new Error("Session not found");

  // Generate final block memory if mid-block
  const { data: recentMessages } = await supabaseAdmin
    .from("chat_messages")
    .select("*")
    .eq("session_id", sessionId)
    .order("created_at", { ascending: false })
    .limit(30);

  if (recentMessages && recentMessages.length > 0) {
    const msgs = (recentMessages as ChatMessage[]).reverse();
    const { summary, key_points } = await generateBlockSummary(
      session.running_summary as string | null,
      msgs,
    );
    await saveMemory(
      studentId,
      session.subject_code as string ?? "general",
      sessionId,
      summary,
      key_points,
    );
  }

  // Update session
  await supabaseAdmin
    .from("study_sessions")
    .update({
      status: reason,
      ended_at: new Date().toISOString(),
    })
    .eq("id", sessionId);

  // Mark plan entries as done if completed
  const currentBlockIndex = session.current_block_index as number;

  return {
    blocks_completed: currentBlockIndex + (reason === "completed" ? 1 : 0),
    blocks_total: currentBlockIndex + 1, // approximation
  };
}

// ── Handle Quiz Result ─────────────────────────────────────

export interface QuizResultInput {
  sessionId: string;
  correct: number;
  total: number;
}

export async function handleQuizResult(
  input: QuizResultInput,
): Promise<{ tutor_comment: string }> {
  const { sessionId, correct, total } = input;

  // Clear embedded session
  await supabaseAdmin
    .from("study_sessions")
    .update({
      embedded_session_id: null,
      block_phase: "explanation",
    })
    .eq("id", sessionId);

  const accuracy = total > 0 ? Math.round((correct / total) * 100) : 0;
  let comment: string;

  if (accuracy >= 80) {
    comment = `Great job! ${correct}/${total} — you really know this material. Let's move forward!`;
  } else if (accuracy >= 50) {
    comment = `${correct}/${total} — good effort! Let's quickly review the ones you missed before moving on.`;
  } else {
    comment = `${correct}/${total} — that's okay, this is tricky material. Let's go through the key concepts again.`;
  }

  // Save as assistant message
  await supabaseAdmin.from("chat_messages").insert({
    session_id: sessionId,
    role: "assistant",
    content: comment,
    action: { type: "clear_panel", config: {} },
  });

  return { tutor_comment: comment };
}

// ── System Prompt Builder ──────────────────────────────────

async function buildSystemPrompt(
  session: Record<string, unknown>,
  allMessages: ChatMessage[],
  studentId: string,
): Promise<string> {
  const subjectCode = (session.subject_code as string) ?? "0620";
  const mood = (session.mood as string) ?? "normal";
  const runningSummary = (session.running_summary as string) ?? "";
  const blockPhase = (session.block_phase as string) ?? "intro";
  const currentBlockIndex = (session.current_block_index as number) ?? 0;

  // Parallel data fetching
  const [promptTemplate, studentRes, memories, factsRes, planData] =
    await Promise.all([
      getPrompt("chat_tutor"),
      supabaseAdmin
        .from("students")
        .select("tutor_prompt")
        .eq("id", studentId)
        .single(),
      loadMemories(studentId, subjectCode, 5),
      supabaseAdmin
        .from("atomic_facts")
        .select("fact_text")
        .eq("subject_code", subjectCode)
        .limit(20),
      getTodayPlan(studentId),
    ]);

  const studentProfile =
    (studentRes.data?.tutor_prompt as string) ?? "No profile available";
  const languageName = SUBJECT_LANGUAGE[subjectCode] ?? "English";

  // Format memories
  const memoriesText = memories.length > 0
    ? memories
        .map(
          (m, i) =>
            `Session ${i + 1}: ${m.summary}`,
        )
        .join("\n")
    : "No previous sessions for this subject.";

  // Format atomic facts
  const factsText = (factsRes.data ?? [])
    .map((f) => `- ${f.fact_text as string}`)
    .join("\n");

  // Format study plan summary (exclude exam markers)
  const allBlocks = [...planData.today, ...planData.overdue].filter(
    (b) => b.study_type !== "exam",
  );
  const planSummary = allBlocks
    .map(
      (b, i) =>
        `${i === currentBlockIndex ? "→ " : "  "}${b.title} (${b.subject_code}, ${b.study_type}) — ${b.status}`,
    )
    .join("\n");

  // Study type instructions for current block
  const currentStudyType = allBlocks[currentBlockIndex]?.study_type ?? "study";
  const studyTypeInstruction = getStudyTypeInstruction(currentStudyType);

  // Time nudge — adapted per study_type
  const sessionStart = new Date(session.started_at as string);
  const minutesElapsed = Math.round(
    (Date.now() - sessionStart.getTime()) / 60000,
  );
  let timeNudge = "";
  if (currentStudyType === "practice" || currentStudyType === "final_prep") {
    // Practice/final_prep: push for testing much earlier
    if (minutesElapsed > 20) {
      timeNudge =
        "\n[SYSTEM: 20+ minutes in a practice block. You SHOULD be doing questions, not explaining. Suggest a quiz or exam practice now.]";
    } else if (minutesElapsed > 10) {
      timeNudge =
        "\n[SYSTEM: 10+ minutes in a practice block. Wrap up any explanation and move to questions soon.]";
    }
  } else {
    // study/mixed: standard pacing
    if (minutesElapsed > 40) {
      timeNudge =
        "\n[SYSTEM: 40+ minutes without a quiz. You MUST suggest testing now. Still ask for student approval.]";
    } else if (minutesElapsed > 30) {
      timeNudge =
        "\n[SYSTEM: 30+ minutes without a quiz. Strongly suggest a quick quiz to the student.]";
    } else if (minutesElapsed > 20) {
      timeNudge =
        "\n[SYSTEM: 20+ minutes in this block. Consider suggesting a quiz when the moment is right.]";
    }
  }

  // Replace template variables
  let prompt = promptTemplate
    .replace(/\{\{student_profile\}\}/g, studentProfile)
    .replace(/\{\{language_name\}\}/g, languageName)
    .replace(/\{\{language\}\}/g, languageName)
    .replace(/\{\{subject_name\}\}/g, subjectCode)
    .replace(/\{\{topic_name\}\}/g, allBlocks[currentBlockIndex]?.title ?? "General review")
    .replace(/\{\{mastery_data\}\}/g, "See recent quiz results")
    .replace(/\{\{today_plan\}\}/g, planSummary)
    .replace(/\{\{days_until_exam\}\}/g, "See exam calendar")
    .replace(/\{\{relevant_facts\}\}/g, factsText || "No specific facts loaded.")
    .replace(/\{\{mood\}\}/g, mood)
    .replace(/\{\{subject_memories\}\}/g, memoriesText)
    .replace(/\{\{running_summary\}\}/g, runningSummary || "Session just started.")
    .replace(/\{\{block_duration\}\}/g, String(allBlocks[currentBlockIndex]?.planned_hours ?? 1))
    .replace(/\{\{block_progress\}\}/g, `Block ${currentBlockIndex + 1} of ${allBlocks.length}`)
    .replace(/\{\{time_nudge\}\}/g, timeNudge);

  // Append study_type instruction after all replacements
  prompt += `\n\n== BLOCK TYPE: ${currentStudyType.toUpperCase()} ==\n${studyTypeInstruction}`;

  return prompt;
}

// ── Study Type Instructions ────────────────────────────────

function getStudyTypeInstruction(studyType: string): string {
  switch (studyType) {
    case "practice":
      return `This is a PRACTICE block. The student should spend most of the time answering questions, not listening to explanations.
- Keep explanations to 3-5 minutes MAX, then move to questions.
- Suggest quizzes early and often (after 5-10 min, not 20).
- Use longer quizzes (8-10 questions) with a mix of MCQ and structured.
- You can also suggest Exam Practice (a full paper section) for the activity panel — ask: "Want to try a full exam section?"
- If she gets >80% on a quiz, move to harder questions or the next topic.
- If she gets <50%, do a SHORT targeted re-explanation (2-3 min) then quiz again.
- Focus on exam technique: "Show your working", "Include units", "Use the formula first".`;

    case "final_prep":
      return `This is a FINAL PREP block — the exam is very close (within days).
- NO long explanations. Only quick reviews of key facts and formulas.
- Start with: "Let's do a quick check — what are the key things you need to remember for this topic?"
- Focus on: common exam traps, mark scheme requirements, time management tips.
- Suggest past paper questions immediately (within 5 minutes).
- Use flashcards for rapid fact recall.
- If she knows the material well (>70% mastery), just do exam practice.
- If there are weak spots, do a VERY brief targeted review (1-2 min) then test.
- Confidence is critical now — be encouraging, remind her she's prepared.`;

    case "mixed":
      return `This is a MIXED block — combine explanation with practice.
- Split roughly 40% explanation, 60% practice.
- After explaining a concept, immediately test it with 2-3 questions.
- Alternate: explain → mini-quiz → explain → mini-quiz.`;

    case "study":
    default:
      return `This is a STUDY block — focus on deep understanding.
- Take time to explain concepts thoroughly using visual descriptions and examples.
- Use the standard block flow: introduction → interactive explanation → quiz → transition.
- Ask checking questions throughout to ensure understanding.
- Use atomic facts as your knowledge source.`;
  }
}

// ── Response Parser (delimiters) ───────────────────────────

// Match delimiters flexibly — LLMs sometimes vary the format
const ACTION_PATTERNS = ["<<<ACTION>>>", "<<<action>>>", "<<<Action>>>", "<<<>>>"];
const INTERNAL_PATTERNS = ["<<<INTERNAL>>>", "<<<internal>>>", "<<<Internal>>>"];

function findFirstDelimiter(raw: string, patterns: string[]): { index: number; length: number } | null {
  let best: { index: number; length: number } | null = null;
  for (const p of patterns) {
    const idx = raw.indexOf(p);
    if (idx >= 0 && (best === null || idx < best.index)) {
      best = { index: idx, length: p.length };
    }
  }
  return best;
}

function parseResponse(raw: string): {
  text: string;
  action: TutorAction | null;
  internal: TutorInternal | null;
} {
  let text = raw;
  let action: TutorAction | null = null;
  let internal: TutorInternal | null = null;

  const actionMatch = findFirstDelimiter(raw, ACTION_PATTERNS);
  const internalMatch = findFirstDelimiter(raw, INTERNAL_PATTERNS);

  if (actionMatch) {
    text = raw.slice(0, actionMatch.index).trim();
    const afterAction = raw.slice(actionMatch.index + actionMatch.length);

    if (internalMatch && internalMatch.index > actionMatch.index) {
      const actionJson = afterAction.slice(
        0,
        internalMatch.index - actionMatch.index - actionMatch.length,
      );
      const internalJson = raw.slice(internalMatch.index + internalMatch.length);

      action = tryRepairJson<TutorAction>(actionJson.trim());
      internal = tryRepairJson<TutorInternal>(internalJson.trim());
    } else {
      action = tryRepairJson<TutorAction>(afterAction.trim());
    }
  } else if (internalMatch) {
    text = raw.slice(0, internalMatch.index).trim();
    const internalJson = raw.slice(internalMatch.index + internalMatch.length);
    internal = tryRepairJson<TutorInternal>(internalJson.trim());
  }

  return { text, action, internal };
}

/**
 * Resolve diagram actions server-side:
 * - Mermaid: if mermaid_code is missing/broken, generate it via a quick LLM call
 * - DALL-E: generate the image and convert to show_content with diagram_url
 * - show_content with "Content loading...": try to generate a Mermaid diagram from the title
 */
async function resolveDiagramAction(action: TutorAction, fullResponse: string): Promise<TutorAction> {
  if (action.type === "show_diagram") {
    if (action.config.diagram_type === "mermaid") {
      // If mermaid_code is missing or looks broken, generate it
      const code = action.config.mermaid_code ?? "";
      if (!code || !code.includes("graph") && !code.includes("flowchart") && !code.includes("sequenceDiagram")) {
        const generated = await generateMermaidCode(action.config.title, fullResponse);
        return { type: "show_diagram", config: { ...action.config, mermaid_code: generated } };
      }
    }
    if (action.config.diagram_type === "dalle" && action.config.dalle_prompt) {
      try {
        const imageUrl = await generateDiagramImage(action.config.dalle_prompt);
        return { type: "show_content", config: { title: action.config.title, content: "", diagram_url: imageUrl } };
      } catch {
        return { type: "show_content", config: { title: action.config.title, content: `Diagram: ${action.config.dalle_prompt}` } };
      }
    }
  }

  // If show_content has "Content loading..." or "Generating diagram...", generate a Mermaid diagram
  if (action.type === "show_content" && (action.config.content === "Content loading..." || action.config.content === "Generating diagram...")) {
    const generated = await generateMermaidCode(action.config.title, fullResponse);
    return { type: "show_diagram", config: { title: action.config.title, diagram_type: "mermaid", mermaid_code: generated } };
  }

  // If show_content has content that looks like Mermaid code, convert to show_diagram
  if (action.type === "show_content" && action.config.content) {
    const content = action.config.content;
    const looksLikeMermaid = content.match(/(?:graph\s+(?:LR|TD|TB|BT|RL)|flowchart|sequenceDiagram|classDiagram|pie)/);
    if (looksLikeMermaid) {
      // Clean the mermaid code: remove markdown fences
      const cleaned = content.replace(/```mermaid\n?/g, "").replace(/```\n?/g, "").trim();
      return { type: "show_diagram", config: { title: action.config.title, diagram_type: "mermaid", mermaid_code: cleaned } };
    }
  }

  // If show_content mentions "diagram" in the title but has no useful content, generate one
  if (action.type === "show_content" && action.config.title && (!action.config.content || action.config.content.length < 20)) {
    const titleLower = action.config.title.toLowerCase();
    if (titleLower.includes("diagram") || titleLower.includes("flowchart") || titleLower.includes("transition") || titleLower.includes("comparison")) {
      const generated = await generateMermaidCode(action.config.title, fullResponse);
      return { type: "show_diagram", config: { title: action.config.title, diagram_type: "mermaid", mermaid_code: generated } };
    }
  }

  return action;
}

/** Quick non-streaming LLM call to generate valid Mermaid code from a title/context */
async function generateMermaidCode(title: string, context: string): Promise<string> {
  try {
    const result = await callOpenAI({
      system: `You generate Mermaid.js diagram code. Rules:
1. Return ONLY valid Mermaid code. No markdown fences, no explanation, no comments.
2. Start with: graph TD, graph LR, flowchart TD, flowchart LR, sequenceDiagram, classDiagram, or pie
3. Each statement MUST be on its own line. Never put multiple statements on one line.
4. Use simple node IDs (A, B, C) with labels in brackets: A[Label]
5. Use --> for arrows, -->|text| for labeled arrows
6. Do NOT use semicolons at end of lines
7. Do NOT use backslashes
8. Keep it simple — max 15 nodes

Example of VALID code:
graph TD
    A[Solid] -->|Melting| B[Liquid]
    B -->|Boiling| C[Gas]
    C -->|Condensation| B
    B -->|Freezing| A`,
      user: `Generate a Mermaid diagram for: "${title}"\n\nContext:\n${context.slice(-500)}`,
      maxTokens: 400,
      model: "gpt-4o-mini",
    });
    // Aggressively clean: extract only the Mermaid code block
    let cleaned = result;
    // Remove code fences
    cleaned = cleaned.replace(/```mermaid\s*/gi, "").replace(/```\s*/g, "");
    // Find the first line starting with graph/flowchart/sequence/class/pie
    const lines = cleaned.split("\n");
    const startIdx = lines.findIndex((l) =>
      /^\s*(graph|flowchart|sequenceDiagram|classDiagram|pie)\b/i.test(l),
    );
    if (startIdx >= 0) {
      // Take from the graph line until we hit a non-diagram line (empty or explanation text)
      const diagramLines: string[] = [];
      for (let i = startIdx; i < lines.length; i++) {
        const line = lines[i].trim();
        // Stop at explanation text (lines not starting with diagram keywords or node refs)
        if (i > startIdx && line && !line.match(/^[\s\w[\]({|}><!&\-=:.#"';,]+$/) && !line.startsWith("subgraph") && !line.startsWith("end") && !line.startsWith("style") && !line.startsWith("linkStyle") && !line.startsWith("class")) {
          break;
        }
        diagramLines.push(lines[i]);
      }
      cleaned = diagramLines.join("\n");
    }
    // Remove trailing semicolons
    cleaned = cleaned.replace(/;$/gm, "");
    return cleaned.trim();
  } catch {
    return `graph TD\n    A[${title}]\n    A --> B[Could not generate diagram]`;
  }
}

/**
 * Last-resort regex extraction when JSON parsing fails completely.
 * Looks for action type keywords in the raw LLM output and reconstructs a minimal action.
 */
function extractActionByRegex(raw: string): TutorAction | null {
  // Look for show_diagram (mermaid or dalle)
  if (raw.match(/show_diagram/i)) {
    const titleMatch = raw.match(/["']title["']\s*:\s*["']([^"']+)["']/);
    const title = titleMatch?.[1] ?? "Diagram";

    // Check for mermaid code
    const mermaidMatch = raw.match(/["']mermaid_code["']\s*:\s*["']([\s\S]*?)(?:["']\s*[},]|$)/);
    if (mermaidMatch) {
      const code = mermaidMatch[1]?.replace(/\\n/g, "\n")?.replace(/\\"/g, '"') ?? "";
      return { type: "show_diagram", config: { title, diagram_type: "mermaid", mermaid_code: code } };
    }

    // Check for dalle prompt
    const dalleMatch = raw.match(/["']dalle_prompt["']\s*:\s*["']([^"']+)["']/);
    if (dalleMatch) {
      return { type: "show_diagram", config: { title, diagram_type: "dalle", dalle_prompt: dalleMatch[1] } };
    }

    // Fallback: check diagram_type
    if (raw.match(/mermaid/i)) {
      // Try to find any graph/flowchart code
      const codeMatch = raw.match(/(graph\s+(?:LR|TD|TB|BT|RL)[\s\S]*?)(?:["'}\]]|$)/);
      return { type: "show_diagram", config: { title, diagram_type: "mermaid", mermaid_code: codeMatch?.[1] ?? "graph LR\n  A[Error] --> B[Could not parse diagram]" } };
    }
    if (raw.match(/dalle/i)) {
      const promptMatch = raw.match(/["'](?:prompt|dalle_prompt)["']\s*:\s*["']([^"']+)["']/);
      return { type: "show_diagram", config: { title, diagram_type: "dalle", dalle_prompt: promptMatch?.[1] ?? title } };
    }
  }

  // Look for show_content with title
  const showContentMatch = raw.match(/show_content/i);
  if (showContentMatch) {
    // Try to extract title
    const titleMatch = raw.match(/["']title["']\s*:\s*["']([^"']+)["']/);
    const title = titleMatch?.[1] ?? "Visual Content";

    // Try to extract content — get everything between "content": " and the next closing
    const contentMatch = raw.match(/["']content["']\s*:\s*["']([\s\S]*?)(?:["']\s*[},]|$)/);
    const content = contentMatch?.[1]
      ?.replace(/\\n/g, "\n")
      ?.replace(/\\"/g, '"')
      ?? "Content loading...";

    return { type: "show_content", config: { title, content } };
  }

  // Look for launch_quiz
  if (raw.match(/launch_quiz/i)) {
    return { type: "launch_quiz", config: { topic_id: "", num_questions: 6, question_types: ["mcq", "short"] } };
  }

  // Look for launch_flashcards
  if (raw.match(/launch_flashcards/i)) {
    return { type: "launch_flashcards", config: { topic_id: "", count: 12 } };
  }

  // Look for end_block
  if (raw.match(/end_block/i)) {
    return { type: "end_block", config: { completed_block_index: 0 } };
  }

  // Look for clear_panel
  if (raw.match(/clear_panel/i)) {
    return { type: "clear_panel", config: {} as Record<string, never> };
  }

  return null;
}

/** Try to parse JSON with fallback for LLM-malformed output */
function tryRepairJson<T>(raw: string): T | null {
  if (!raw) return null;
  try { return JSON.parse(raw) as T; } catch { /* continue */ }

  // Extract first complete JSON object
  const firstBrace = raw.indexOf("{");
  if (firstBrace < 0) return null;

  let depth = 0;
  let inStr = false;
  let esc = false;
  let lastBrace = -1;

  for (let i = firstBrace; i < raw.length; i++) {
    const ch = raw[i];
    if (esc) { esc = false; continue; }
    if (ch === "\\") { esc = true; continue; }
    if (ch === '"') { inStr = !inStr; continue; }
    if (inStr) continue;
    if (ch === "{") depth++;
    if (ch === "}") { depth--; if (depth === 0) { lastBrace = i; break; } }
  }

  if (lastBrace > firstBrace) {
    try { return JSON.parse(raw.slice(firstBrace, lastBrace + 1)) as T; } catch { /* continue */ }
  }

  // Close unclosed braces
  let fixed = raw.slice(firstBrace);
  let openB = 0;
  inStr = false; esc = false;
  for (const ch of fixed) {
    if (esc) { esc = false; continue; }
    if (ch === "\\") { esc = true; continue; }
    if (ch === '"') { inStr = !inStr; continue; }
    if (inStr) continue;
    if (ch === "{") openB++;
    if (ch === "}") openB--;
  }
  if (inStr) fixed += '"';
  while (openB > 0) { fixed += "}"; openB--; }

  try { return JSON.parse(fixed) as T; } catch { return null; }
}

// ── Action Handler ─────────────────────────────────────────

async function handleAction(
  sessionId: string,
  action: TutorAction,
  _studentId: string,
): Promise<void> {
  switch (action.type) {
    case "end_block": {
      // Generate block memory and transition
      const { data: messages } = await supabaseAdmin
        .from("chat_messages")
        .select("*")
        .eq("session_id", sessionId)
        .order("created_at", { ascending: false })
        .limit(30);

      const { data: session } = await supabaseAdmin
        .from("study_sessions")
        .select("*")
        .eq("id", sessionId)
        .single();

      if (session && messages) {
        const msgs = (messages as ChatMessage[]).reverse();
        const { summary, key_points } = await generateBlockSummary(
          session.running_summary as string | null,
          msgs,
        );
        await saveMemory(
          _studentId,
          session.subject_code as string ?? "general",
          sessionId,
          summary,
          key_points,
        );

        // Advance to next block
        const nextIndex = (session.current_block_index as number) + 1;
        const nextSubject = action.config.next_subject ?? session.subject_code;

        await supabaseAdmin
          .from("study_sessions")
          .update({
            current_block_index: nextIndex,
            block_phase: "intro",
            subject_code: nextSubject,
            running_summary: null, // Reset for new block
          })
          .eq("id", sessionId);
      }
      break;
    }

    case "launch_quiz":
    case "launch_flashcards": {
      // Update block phase and embedded session reference
      await supabaseAdmin
        .from("study_sessions")
        .update({ block_phase: "quiz" })
        .eq("id", sessionId);
      break;
    }

    case "show_diagram": {
      // For DALL-E: generate image and convert action to show_content with URL
      if (action.config.diagram_type === "dalle" && action.config.dalle_prompt) {
        try {
          const imageUrl = await generateDiagramImage(action.config.dalle_prompt);
          // Mutate the action to show_content with the generated image URL
          // The frontend will receive this via the <<<ACTION_JSON>>> appended by flush()
          (action as unknown as { type: string }).type = "show_content";
          (action as unknown as { config: { title: string; content: string; diagram_url: string } }).config = {
            title: action.config.title,
            content: "",
            diagram_url: imageUrl,
          };
        } catch {
          // Fallback: show the prompt as text
          (action as unknown as { type: string }).type = "show_content";
          (action as unknown as { config: { title: string; content: string } }).config = {
            title: action.config.title,
            content: `Diagram generation failed. Description: ${action.config.dalle_prompt}`,
          };
        }
      }
      // Mermaid: passed through to frontend as-is
      break;
    }

    case "end_session":
    case "show_content":
    case "clear_panel":
      // These are handled by the frontend
      break;
  }
}

// ── Greeting Helpers ───────────────────────────────────────

function buildGreeting(mood: Mood, blocks: StudyPlanEntry[]): string {
  const blockList = blocks
    .map((b) => b.title)
    .slice(0, 4)
    .join(", ");

  const firstBlock = blocks[0];
  const typeHint =
    firstBlock.study_type === "practice"
      ? " We'll jump straight into questions."
      : firstBlock.study_type === "final_prep"
        ? " Quick revision — your exam is coming up soon!"
        : "";

  switch (mood) {
    case "unmotivated":
      return `Hi Luísa! I know today might feel tough, but we'll take it easy. We have: ${blockList}.${typeHint} Let's start slow — one step at a time?`;
    case "normal":
      return `Hi Luísa! Today we have: ${blockList}.${typeHint} Ready to start with ${firstBlock.title}?`;
    case "good":
      return `Hi Luísa! Great to see you! We've got: ${blockList}.${typeHint} Let's get into it!`;
    case "motivated":
      return `Luísa! Love the energy! Today's lineup: ${blockList}.${typeHint} Let's crush it!`;
  }
}

function buildFreeStudyGreeting(mood: Mood): string {
  switch (mood) {
    case "unmotivated":
      return "Hi Luísa! No scheduled blocks today — let's just review whatever feels right. What subject would you like to look at?";
    case "normal":
      return "Hi Luísa! Your schedule is clear today. Want to review some weak topics or practice something specific?";
    case "good":
      return "Hi Luísa! Free study day! Want to tackle some weak spots or explore something interesting?";
    case "motivated":
      return "Luísa! No schedule constraints today — perfect for deep diving! What do you want to master?";
  }
}
