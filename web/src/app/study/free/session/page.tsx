"use client";

import { useEffect, useState, useCallback, useRef, Suspense } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { startChatSession, endChatSession, sendQuizResult } from "@/lib/api";
import { useChatStream } from "@/hooks/use-chat-stream";
import { ChatPanel } from "@/components/session/ChatPanel";
import { ActivityPanel, actionToActivity } from "@/components/session/ActivityPanel";
import type { ActivityState } from "@/components/session/ActivityPanel";
import { getSubjectMeta } from "@/lib/subject-meta";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { ArrowLeft, Clock, X } from "lucide-react";
import { cn } from "@/lib/utils";

const SUBJECT_NAMES: Record<string, string> = {
  "0620": "Chemistry", "0625": "Physics", "0610": "Biology",
  "0478": "CS", "0520": "French", "0504": "Portuguese",
};

function FreeSessionInner() {
  const searchParams = useSearchParams();
  const router = useRouter();

  const subjectCode = searchParams.get("subject") ?? "0620";
  const topicId = searchParams.get("topic") || undefined;
  const mode = (searchParams.get("mode") ?? "tutor") as "tutor" | "review";

  const [sessionId, setSessionId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [activity, setActivity] = useState<ActivityState>({ type: "idle" });
  const [elapsedMinutes, setElapsedMinutes] = useState(0);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const startedRef = useRef(false);

  const chat = useChatStream(sessionId);

  // Elapsed time
  useEffect(() => {
    if (!sessionId) return;
    timerRef.current = setInterval(() => setElapsedMinutes((m) => m + 1), 60000);
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, [sessionId]);

  // Start session
  useEffect(() => {
    if (startedRef.current) return;
    startedRef.current = true;

    startChatSession("normal", {
      subject_code: subjectCode,
      topic_id: topicId,
      mode,
    })
      .then((data) => {
        setSessionId(data.session_id);
        chat.addMessage({
          session_id: data.session_id,
          role: "assistant",
          content: data.tutor_greeting,
          images: [],
          action: null,
          internal: null,
        });
        setLoading(false);
      })
      .catch(() => router.push("/study/free"));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // React to tutor actions
  useEffect(() => {
    if (!chat.lastAction) return;
    const newActivity = actionToActivity(chat.lastAction, subjectCode);
    if (newActivity) setActivity(newActivity);

    if (chat.lastAction.type === "end_session" && sessionId) {
      endChatSession(sessionId, "completed").then(() => router.push("/study/free"));
    }

    chat.clearAction();
  }, [chat.lastAction, subjectCode, sessionId, router, chat]);

  const handleQuizComplete = useCallback(
    async (summary: { total_marks_earned: number; total_marks_available: number; questions_attempted: number; accuracy: number; duration_seconds: number }) => {
      if (!sessionId) return;
      await sendQuizResult(sessionId, Math.round(summary.accuracy * summary.questions_attempted / 100), summary.questions_attempted);
    },
    [sessionId],
  );

  const handleEnd = useCallback(async () => {
    if (sessionId) await endChatSession(sessionId, "completed");
    router.push("/study/free");
  }, [sessionId, router]);

  if (loading) {
    return (
      <div className="flex gap-4 h-[calc(100vh-80px)]">
        <Skeleton className="flex-1 rounded-xl" />
        <Skeleton className="flex-1 rounded-xl" />
      </div>
    );
  }

  const meta = getSubjectMeta(subjectCode);
  const SubjectIcon = meta.icon;
  const subjectName = SUBJECT_NAMES[subjectCode] ?? subjectCode;

  return (
    <div className="flex flex-col h-[calc(100vh-80px)] -my-5 -mx-8">
      {/* Simplified header */}
      <div className="flex items-center justify-between px-4 py-2.5 border-b border-border/50 bg-card/50 shrink-0">
        <div className="flex items-center gap-3">
          <button
            onClick={handleEnd}
            className="flex items-center gap-1.5 text-muted-foreground hover:text-foreground transition-colors cursor-pointer"
          >
            <ArrowLeft className="w-4 h-4" />
            <span className="text-xs">Back</span>
          </button>
          <div className="w-px h-5 bg-border" />
          <div className={cn("w-7 h-7 rounded-lg flex items-center justify-center bg-gradient-to-br", meta.gradient)}>
            <SubjectIcon className={cn("w-4 h-4", meta.accent)} />
          </div>
          <div>
            <p className="text-sm font-semibold text-foreground">
              Free Study: {subjectName}
            </p>
            <p className="text-[10px] text-muted-foreground">
              {mode === "review" ? "Note review mode" : "Ask anything"}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <Clock className="w-3.5 h-3.5" />
            {elapsedMinutes}m
          </div>
          <Button
            variant="ghost"
            size="sm"
            className="text-xs gap-1 cursor-pointer"
            onClick={handleEnd}
          >
            <X className="w-3.5 h-3.5" />
            End
          </Button>
        </div>
      </div>

      {/* Split screen */}
      <div className="flex flex-1 min-h-0">
        {/* Chat panel (left) */}
        <div className="w-1/2 border-r border-border/50 flex flex-col">
          <div className="flex-1 min-h-0">
            <ChatPanel
              messages={chat.messages}
              streamingText={chat.streamingText}
              isStreaming={chat.isStreaming}
              onSendMessage={chat.sendMessage}
              disabled={!sessionId}
            />
          </div>
        </div>

        {/* Activity panel (right) */}
        <div className="w-1/2 bg-card/30">
          <ActivityPanel
            activity={activity}
            subjectCode={subjectCode}
            topicTitle={`Free Study: ${subjectName}`}
            blockPhase={chat.lastInternal?.current_phase ?? "intro"}
            elapsedMinutes={elapsedMinutes}
            onQuizComplete={handleQuizComplete}
          />
        </div>
      </div>
    </div>
  );
}

export default function FreeStudySessionPage() {
  return (
    <Suspense
      fallback={
        <div className="flex gap-4 h-[calc(100vh-80px)]">
          <Skeleton className="flex-1 rounded-xl" />
          <Skeleton className="flex-1 rounded-xl" />
        </div>
      }
    >
      <FreeSessionInner />
    </Suspense>
  );
}
