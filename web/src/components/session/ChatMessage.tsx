"use client";

import { GraduationCap, User } from "lucide-react";
import { cn } from "@/lib/utils";
import { ChatRichText } from "./ChatRichText";

interface ChatMessageProps {
  role: "user" | "assistant" | "system";
  content: string;
  images?: string[];
  isStreaming?: boolean;
}

export function ChatMessage({
  role,
  content,
  images,
  isStreaming,
}: ChatMessageProps) {
  const isAssistant = role === "assistant";

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
        {/* Image thumbnails */}
        {images && images.length > 0 && (
          <div className="flex flex-wrap gap-2 mb-2">
            {images.map((url, i) => (
              <img
                key={i}
                src={url}
                alt={`Attachment ${i + 1}`}
                className="w-32 h-32 object-cover rounded-lg border border-border/50 cursor-pointer hover:opacity-80 transition-opacity"
              />
            ))}
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
