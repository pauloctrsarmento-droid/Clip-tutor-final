"use client";

import { useEffect, useState, useCallback, useRef, Suspense } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { startChatSession, pauseChatSession, endChatSession, sendQuizResult } from "@/lib/api";
import { useChatStream } from "@/hooks/use-chat-stream";
import { SessionHeader } from "@/components/session/SessionHeader";
import { ChatPanel } from "@/components/session/ChatPanel";
import { ActivityPanel, actionToActivity } from "@/components/session/ActivityPanel";
import type { ActivityState } from "@/components/session/ActivityPanel";
import { PauseConfirm } from "@/components/session/PauseConfirm";
import { FreeStudyConfirm } from "@/components/session/FreeStudyConfirm";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { Pause, BookOpen } from "lucide-react";
import type { Mood, StudyPlanEntry } from "@/lib/types";

function SessionInner() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const mood = (searchParams.get("mood") ?? "normal") as Mood;

  const [sessionId, setSessionId] = useState<string | null>(null);
  const [blocks, setBlocks] = useState<StudyPlanEntry[]>([]);
  const [currentBlockIndex, setCurrentBlockIndex] = useState(0);
  const [loading, setLoading] = useState(true);
  const [activity, setActivity] = useState<ActivityState>({ type: "idle" });
  const [showPause, setShowPause] = useState(false);
  const [showFreeStudy, setShowFreeStudy] = useState(false);
  const [elapsedMinutes, setElapsedMinutes] = useState(0);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const startedRef = useRef(false);

  const chat = useChatStream(sessionId);

  // Elapsed time tracker
  useEffect(() => {
    if (!sessionId) return;
    timerRef.current = setInterval(() => {
      setElapsedMinutes((m) => m + 1);
    }, 60000);
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [sessionId]);

  // Start session on mount (guard against React strict mode double-invoke)
  useEffect(() => {
    if (startedRef.current) return;
    startedRef.current = true;

    startChatSession(mood)
      .then((data) => {
        setSessionId(data.session_id);
        setBlocks(data.blocks as StudyPlanEntry[]);
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
      .catch(() => {
        router.push("/study");
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // React to tutor actions
  useEffect(() => {
    if (!chat.lastAction) return;
    const currentBlock = blocks[currentBlockIndex];
    const subjectCode = currentBlock?.subject_code ?? "0620";

    const newActivity = actionToActivity(chat.lastAction, subjectCode);
    if (newActivity) {
      setActivity(newActivity);
    }

    // Handle end_block
    if (chat.lastAction.type === "end_block") {
      setCurrentBlockIndex((i) => i + 1);
    }

    // Handle end_session
    if (chat.lastAction.type === "end_session" && sessionId) {
      endChatSession(sessionId, "completed").then(() => {
        router.push("/study");
      });
    }

    chat.clearAction();
  }, [chat.lastAction, blocks, currentBlockIndex, sessionId, router, chat]);

  // Quiz complete handler
  const handleQuizComplete = useCallback(
    async (summary: { total_marks_earned: number; total_marks_available: number; questions_attempted: number; accuracy: number; duration_seconds: number }) => {
      if (!sessionId) return;
      await sendQuizResult(sessionId, Math.round(summary.accuracy * summary.questions_attempted / 100), summary.questions_attempted);
      // Activity will be cleared by the tutor's response
    },
    [sessionId],
  );

  // Pause handler
  const handlePause = useCallback(async () => {
    if (!sessionId) return;
    setShowPause(false);
    await pauseChatSession(sessionId);
    router.push("/study");
  }, [sessionId, router]);

  // Free study handler
  const handleFreeStudy = useCallback(async () => {
    if (!sessionId) return;
    setShowFreeStudy(false);
    await endChatSession(sessionId, "interrupted");
    router.push("/study");
  }, [sessionId, router]);

  if (loading) {
    return (
      <div className="flex gap-4 h-[calc(100vh-80px)]">
        <Skeleton className="flex-1 rounded-xl" />
        <Skeleton className="flex-1 rounded-xl" />
      </div>
    );
  }

  const currentBlock = blocks[currentBlockIndex];

  return (
    <div className="flex flex-col h-[calc(100vh-80px)] -my-5 -mx-8">
      {/* Session header */}
      <SessionHeader
        subjectCode={currentBlock?.subject_code ?? "0620"}
        topicTitle={currentBlock?.title ?? "Free Study"}
        blockIndex={currentBlockIndex}
        totalBlocks={blocks.length || 1}
        elapsedMinutes={elapsedMinutes}
      />

      {/* Split screen */}
      <div className="flex flex-1 min-h-0">
        {/* Chat panel (left 50%) */}
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

          {/* Action buttons */}
          <div className="flex items-center gap-2 px-3 py-2 border-t border-border/50 bg-card/30">
            <Button
              variant="ghost"
              size="sm"
              className="text-xs"
              onClick={() => setShowPause(true)}
            >
              <Pause className="w-3.5 h-3.5 mr-1.5" />
              Pause
            </Button>
            <Button
              variant="ghost"
              size="sm"
              className="text-xs"
              onClick={() => setShowFreeStudy(true)}
            >
              <BookOpen className="w-3.5 h-3.5 mr-1.5" />
              Free Study
            </Button>
          </div>
        </div>

        {/* Activity panel (right 50%) */}
        <div className="w-1/2 bg-card/30">
          <ActivityPanel
            activity={activity}
            subjectCode={currentBlock?.subject_code ?? "0620"}
            topicTitle={currentBlock?.title ?? "Free Study"}
            blockPhase={chat.lastInternal?.current_phase ?? "intro"}
            elapsedMinutes={elapsedMinutes}
            onQuizComplete={handleQuizComplete}
          />
        </div>
      </div>

      {/* Modals */}
      <PauseConfirm
        open={showPause}
        onConfirm={handlePause}
        onCancel={() => setShowPause(false)}
      />
      <FreeStudyConfirm
        open={showFreeStudy}
        onConfirm={handleFreeStudy}
        onCancel={() => setShowFreeStudy(false)}
      />
    </div>
  );
}

export default function SessionPage() {
  return (
    <Suspense
      fallback={
        <div className="flex gap-4 h-[calc(100vh-80px)]">
          <Skeleton className="flex-1 rounded-xl" />
          <Skeleton className="flex-1 rounded-xl" />
        </div>
      }
    >
      <SessionInner />
    </Suspense>
  );
}
