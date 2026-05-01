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
