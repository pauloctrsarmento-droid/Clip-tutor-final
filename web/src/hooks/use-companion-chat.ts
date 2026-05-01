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
