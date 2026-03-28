"use client";

import { useEffect, useRef } from "react";
import { ChatMessage, TypingIndicator } from "./ChatMessage";
import { ChatInput } from "./ChatInput";
import type { ChatMessage as ChatMessageType } from "@/lib/types";

interface ChatPanelProps {
  messages: ChatMessageType[];
  streamingText: string;
  isStreaming: boolean;
  onSendMessage: (text: string, images?: string[]) => void;
  disabled?: boolean;
}

export function ChatPanel({
  messages,
  streamingText,
  isStreaming,
  onSendMessage,
  disabled = false,
}: ChatPanelProps) {
  const scrollRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to bottom on new messages or streaming
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages.length, streamingText]);

  return (
    <div className="flex flex-col h-full">
      {/* Messages area */}
      <div
        ref={scrollRef}
        className="flex-1 overflow-y-auto px-4 py-4 space-y-3 flex flex-col"
      >
        {messages.map((msg) => (
          <ChatMessage
            key={msg.id}
            role={msg.role === "system" ? "assistant" : msg.role}
            content={msg.content}
            images={msg.images}
          />
        ))}

        {/* Streaming message */}
        {isStreaming && streamingText && (
          <ChatMessage
            role="assistant"
            content={streamingText}
            isStreaming
          />
        )}

        {/* Typing indicator (when streaming but no text yet) */}
        {isStreaming && !streamingText && <TypingIndicator />}
      </div>

      {/* Input */}
      <ChatInput
        onSend={onSendMessage}
        disabled={disabled || isStreaming}
      />
    </div>
  );
}
