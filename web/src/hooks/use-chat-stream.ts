import { useState, useCallback, useRef } from "react";
import { sendSessionMessage } from "@/lib/api";
import { parseSessionStream } from "@/lib/stream-parser";
import type { TutorAction, TutorInternal, ChatMessage } from "@/lib/types";

interface ChatStreamState {
  messages: ChatMessage[];
  streamingText: string;
  isStreaming: boolean;
  lastAction: TutorAction | null;
  lastInternal: TutorInternal | null;
  error: string | null;
}

export function useChatStream(sessionId: string | null) {
  const [state, setState] = useState<ChatStreamState>({
    messages: [],
    streamingText: "",
    isStreaming: false,
    lastAction: null,
    lastInternal: null,
    error: null,
  });

  const abortRef = useRef<AbortController | null>(null);

  const addMessage = useCallback((msg: Omit<ChatMessage, "id" | "created_at">) => {
    setState((prev) => ({
      ...prev,
      messages: [
        ...prev.messages,
        {
          ...msg,
          id: crypto.randomUUID(),
          created_at: new Date().toISOString(),
        },
      ],
    }));
  }, []);

  const setHistory = useCallback((messages: ChatMessage[]) => {
    setState((prev) => ({ ...prev, messages }));
  }, []);

  const sendMessage = useCallback(
    async (text: string, images?: string[]) => {
      if (!sessionId) return;

      // Add user message to local state
      addMessage({
        session_id: sessionId,
        role: "user",
        content: text,
        images: images ?? [],
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
        const response = await sendSessionMessage(sessionId, text, images);

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
          session_id: sessionId,
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

  const clearAction = useCallback(() => {
    setState((prev) => ({ ...prev, lastAction: null }));
  }, []);

  const abort = useCallback(() => {
    abortRef.current?.abort();
    setState((prev) => ({ ...prev, isStreaming: false, streamingText: "" }));
  }, []);

  return {
    ...state,
    sendMessage,
    clearAction,
    setHistory,
    addMessage,
    abort,
  };
}
