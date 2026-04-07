"use client";

import { GraduationCap, User, FileText } from "lucide-react";
import { cn } from "@/lib/utils";
import { ChatRichText } from "./ChatRichText";
import { isImageAttachment } from "@/lib/types";
import type { Attachment } from "@/lib/types";

interface ChatMessageProps {
  role: "user" | "assistant" | "system";
  content: string;
  /** Legacy image-only URLs (backward compat with DB rows). */
  images?: string[];
  /** Rich attachments with name metadata. */
  attachments?: Attachment[];
  isStreaming?: boolean;
}

export function ChatMessage({
  role,
  content,
  images,
  attachments,
  isStreaming,
}: ChatMessageProps) {
  const isAssistant = role === "assistant";

  // Merge legacy images into attachments for unified rendering
  const allAttachments: Attachment[] = [
    ...(attachments ?? []),
    ...(images ?? [])
      .filter((url) => !attachments?.some((a) => a.url === url))
      .map((url, i) => ({ url, name: `Attachment ${i + 1}` })),
  ];

  return (
    <div
      className={cn(
        "flex gap-2.5 max-w-[88%]",
        isAssistant ? "self-start" : "self-end ml-auto flex-row-reverse",
      )}
    >
      {/* Avatar */}
      <div
        className={cn(
          "w-7 h-7 rounded-lg flex items-center justify-center shrink-0 mt-0.5",
          isAssistant
            ? "bg-primary/10"
            : "bg-muted",
        )}
      >
        {isAssistant ? (
          <GraduationCap className="w-3.5 h-3.5 text-primary" />
        ) : (
          <User className="w-3.5 h-3.5 text-muted-foreground" />
        )}
      </div>

      {/* Bubble */}
      <div
        className={cn(
          "rounded-2xl px-3.5 py-2.5 text-sm leading-relaxed",
          isAssistant
            ? "bg-card border border-border/50 text-foreground"
            : "bg-primary/15 text-foreground",
        )}
      >
        {/* Attachment previews */}
        {allAttachments.length > 0 && (
          <div className="flex flex-wrap gap-2 mb-2">
            {allAttachments.map((att, i) =>
              isImageAttachment(att.url) ? (
                <img
                  key={i}
                  src={att.url}
                  alt={att.name}
                  className="w-32 h-32 object-cover rounded-lg border border-border/50 cursor-pointer hover:opacity-80 transition-opacity"
                />
              ) : (
                <div
                  key={i}
                  className="flex items-center gap-2 rounded-lg border border-border/50 bg-muted/50 px-3 py-2"
                >
                  <FileText className="w-5 h-5 text-muted-foreground shrink-0" />
                  <span className="text-xs text-muted-foreground truncate max-w-[150px]">
                    {att.name}
                  </span>
                </div>
              ),
            )}
          </div>
        )}

        {/* Text content with markdown + KaTeX rendering */}
        {isAssistant ? (
          <div className="break-words">
            <ChatRichText content={content} />
            {isStreaming && (
              <span className="inline-block w-1.5 h-4 ml-0.5 bg-primary/60 animate-pulse rounded-sm" />
            )}
          </div>
        ) : (
          <div className="whitespace-pre-wrap break-words">
            {content}
          </div>
        )}
      </div>
    </div>
  );
}

/** Typing indicator (three bouncing dots) */
export function TypingIndicator() {
  return (
    <div className="flex gap-2.5 self-start max-w-[88%]">
      <div className="w-7 h-7 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
        <GraduationCap className="w-3.5 h-3.5 text-primary" />
      </div>
      <div className="bg-card border border-border/50 rounded-2xl px-4 py-3 flex items-center gap-1">
        <span className="w-1.5 h-1.5 rounded-full bg-muted-foreground/50 animate-bounce [animation-delay:0ms]" />
        <span className="w-1.5 h-1.5 rounded-full bg-muted-foreground/50 animate-bounce [animation-delay:150ms]" />
        <span className="w-1.5 h-1.5 rounded-full bg-muted-foreground/50 animate-bounce [animation-delay:300ms]" />
      </div>
    </div>
  );
}
