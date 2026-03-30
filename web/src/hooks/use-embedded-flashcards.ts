import { useEffect, useState, useCallback, useRef } from "react";
import {
  startFlashcards,
  explainFlashcard,
  answerFlashcard,
  endFlashcards,
} from "@/lib/api";

// ── Types ──────────────────────────────────────────────────

export interface FlashcardData {
  fact_id: string;
  fact_text: string;
  flashcard_front: string | null;
  question: string;
  question_id: string | null;
  topic_name: string;
  subject_code: string;
  mastery_score: number | null;
}

export interface FlashcardSummaryData {
  total_cards: number;
  correct: number;
  incorrect: number;
  duration_seconds: number;
}

// ── Hook options ───────────────────────────────────────────

interface UseEmbeddedFlashcardsOptions {
  subjectCode: string;
  topicId?: string;
  limit?: number;
  onResult?: (result: "know" | "partial" | "dunno") => void;
  onComplete?: (summary: FlashcardSummaryData) => void;
}

// ── Hook ───────────────────────────────────────────────────

export function useEmbeddedFlashcards(
  options: UseEmbeddedFlashcardsOptions,
) {
  const { subjectCode, topicId, limit, onResult, onComplete } = options;

  const [phase, setPhase] = useState<"loading" | "playing" | "summary">(
    "loading",
  );
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [cards, setCards] = useState<FlashcardData[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [flipped, setFlipped] = useState(false);
  const [explanation, setExplanation] = useState<string | null>(null);
  const [explainLoading, setExplainLoading] = useState(false);
  const [answering, setAnswering] = useState(false);
  const [stats, setStats] = useState({ correct: 0, incorrect: 0 });
  const [lastMastery, setLastMastery] = useState<{
    from: number;
    to: number;
  } | null>(null);
  const [summary, setSummary] = useState<FlashcardSummaryData | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  const explainPromise = useRef<Promise<{ explanation: string }> | null>(
    null,
  );

  // Start session
  useEffect(() => {
    if (!subjectCode) return;
    startFlashcards({
      subject_code: subjectCode,
      topic_id: topicId || undefined,
      limit,
    })
      .then((data) => {
        setSessionId(data.session_id);
        setCards(data.cards ?? []);
        setPhase(data.cards?.length ? "playing" : "summary");
      })
      .catch((err) => {
        setLoadError(
          err instanceof Error ? err.message : "Failed to load flashcards",
        );
      });
  }, [subjectCode, topicId, limit]);

  // Fire explain in background for current card
  useEffect(() => {
    if (phase !== "playing" || !cards[currentIndex]) return;
    const card = cards[currentIndex];
    setExplanation(null);
    setExplainLoading(true);
    const promise = explainFlashcard(card.fact_id, card.question);
    explainPromise.current = promise;
    promise
      .then((data) => {
        if (explainPromise.current === promise) {
          setExplanation(data.explanation);
        }
      })
      .catch(() => setExplanation(null))
      .finally(() => setExplainLoading(false));
  }, [phase, cards, currentIndex]);

  const flip = useCallback(() => {
    if (!flipped) setFlipped(true);
  }, [flipped]);

  const handleResult = useCallback(
    async (result: "know" | "partial" | "dunno") => {
      if (!sessionId || answering) return;
      const card = cards[currentIndex];
      if (!card) return;

      setAnswering(true);
      const prevMastery = card.mastery_score ?? 0;

      try {
        const data = await answerFlashcard({
          session_id: sessionId,
          fact_id: card.fact_id,
          result,
        });

        setStats((prev) => ({
          correct: prev.correct + (result === "know" ? 1 : 0),
          incorrect: prev.incorrect + (result !== "know" ? 1 : 0),
        }));

        setLastMastery({
          from: Math.round(prevMastery * 100),
          to: Math.round(data.updated_mastery * 100),
        });

        onResult?.(result);

        await new Promise((r) => setTimeout(r, 800));
        setLastMastery(null);

        if (currentIndex < cards.length - 1) {
          setFlipped(false);
          setExplanation(null);
          setCurrentIndex((i) => i + 1);
        } else {
          const summaryData = await endFlashcards(sessionId);
          setSummary(summaryData);
          setPhase("summary");
          onComplete?.(summaryData);
        }
      } catch {
        // Continue anyway
      } finally {
        setAnswering(false);
      }
    },
    [sessionId, answering, cards, currentIndex, onResult, onComplete],
  );

  return {
    phase,
    currentCard: cards[currentIndex] ?? null,
    currentIndex,
    totalCards: cards.length,
    flipped,
    explanation,
    explainLoading,
    answering,
    stats,
    lastMastery,
    summary,
    loadError,
    flip,
    handleResult,
  };
}
