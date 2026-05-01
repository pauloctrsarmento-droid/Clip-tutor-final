"use client";

import { useEffect, useState, useCallback, useRef, Suspense } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { startFlashcards, explainFlashcard, answerFlashcard, endFlashcards } from "@/lib/api";
import { getSubjectMeta } from "@/lib/subject-meta";
import { FlashcardCard } from "@/components/flashcards/flashcard-card";
import { FlashcardButtons } from "@/components/flashcards/flashcard-buttons";
import { FlashcardSummary } from "@/components/flashcards/flashcard-summary";
import { Skeleton } from "@/components/ui/skeleton";
import { motion, AnimatePresence } from "framer-motion";
import { cn } from "@/lib/utils";
import { CompanionPanel, type CompanionPanelHandle } from "@/components/companion/companion-panel";
import type { CompanionContext } from "@/lib/companion-context";

interface Card {
  fact_id: string;
  fact_text: string;
  flashcard_front: string | null;
  question: string;
  question_id: string | null;
  topic_name: string;
  subject_code: string;
  mastery_score: number | null;
}

interface SessionStats {
  correct: number;
  incorrect: number;
}

function FlashcardSessionInner() {
  const searchParams = useSearchParams();
  const router = useRouter();

  const subjectCode = searchParams.get("subject") ?? "";
  const topicId = searchParams.get("topic") ?? undefined;

  const [phase, setPhase] = useState<"loading" | "playing" | "summary">("loading");
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [cards, setCards] = useState<Card[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [flipped, setFlipped] = useState(false);
  const [explanation, setExplanation] = useState<string | null>(null);
  const [explainLoading, setExplainLoading] = useState(false);
  const [answering, setAnswering] = useState(false);
  const [stats, setStats] = useState<SessionStats>({ correct: 0, incorrect: 0 });
  const [lastMastery, setLastMastery] = useState<{ from: number; to: number } | null>(null);
  const [lastResult, setLastResult] = useState<"know" | "partial" | "dunno" | null>(null);
  const [summaryData, setSummaryData] = useState<{
    total_cards: number;
    correct: number;
    incorrect: number;
    duration_seconds: number;
  } | null>(null);

  const explainPromise = useRef<Promise<{ explanation: string }> | null>(null);

  const meta = getSubjectMeta(subjectCode);

  const companionContextRef = useRef<CompanionContext>({
    mode: "flashcard",
    topic: null,
    question: "",
    diagramUrls: [],
    studentAttempt: null,
    expectedAnswer: null,
    markScheme: null,
    overallFeedback: null,
  });
  const companionRef = useRef<CompanionPanelHandle>(null);

  useEffect(() => {
    const card = cards[currentIndex];
    if (!card) return;
    companionContextRef.current = {
      mode: "flashcard",
      topic: card.topic_name ?? null,
      question: card.question ?? card.flashcard_front ?? card.fact_text ?? "",
      diagramUrls: [],
      studentAttempt: lastResult,
      expectedAnswer: flipped ? explanation : null,
      markScheme: null,
      overallFeedback: null,
    };
  }, [cards, currentIndex, flipped, explanation, lastResult]);

  // Start session
  useEffect(() => {
    if (!subjectCode) return;
    startFlashcards({ subject_code: subjectCode, topic_id: topicId })
      .then((data) => {
        setSessionId(data.session_id);
        setCards(data.cards ?? []);
        setPhase(data.cards?.length ? "playing" : "summary");
      })
      .catch(() => router.push("/study/flashcards"));
  }, [subjectCode, topicId, router]);

  // Fire explain in background when showing a new card front
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

  const handleFlip = useCallback(() => {
    if (!flipped) setFlipped(true);
  }, [flipped]);

  const handleResult = useCallback(
    async (result: "know" | "partial" | "dunno") => {
      if (!sessionId || answering) return;
      const card = cards[currentIndex];
      if (!card) return;

      setAnswering(true);
      setLastResult(result);
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

        setLastMastery({ from: Math.round(prevMastery * 100), to: Math.round(data.updated_mastery * 100) });

        await new Promise((r) => setTimeout(r, 800));
        setLastMastery(null);

        if (currentIndex < cards.length - 1) {
          setFlipped(false);
          setExplanation(null);
          setLastResult(null);
          setCurrentIndex((i) => i + 1);
        } else {
          const summary = await endFlashcards(sessionId);
          companionRef.current?.cleanup();
          setSummaryData(summary);
          setPhase("summary");
        }
      } catch {
        // Continue anyway
      } finally {
        setAnswering(false);
      }
    },
    [sessionId, answering, cards, currentIndex]
  );

  if (phase === "loading") {
    return (
      <div className="max-w-2xl mx-auto space-y-6">
        <Skeleton className="h-2 rounded-full" />
        <Skeleton className="h-[400px] rounded-2xl" />
        <div className="flex gap-3">
          <Skeleton className="flex-1 h-12 rounded-xl" />
          <Skeleton className="flex-1 h-12 rounded-xl" />
          <Skeleton className="flex-1 h-12 rounded-xl" />
        </div>
      </div>
    );
  }

  if (phase === "summary") {
    return (
      <FlashcardSummary
        totalCards={summaryData?.total_cards ?? stats.correct + stats.incorrect}
        correct={summaryData?.correct ?? stats.correct}
        incorrect={summaryData?.incorrect ?? stats.incorrect}
        durationSeconds={summaryData?.duration_seconds ?? 0}
        onBack={() => {
          companionRef.current?.cleanup();
          router.push("/study/flashcards");
        }}
        onRestart={() => {
          setPhase("loading");
          setCurrentIndex(0);
          setStats({ correct: 0, incorrect: 0 });
          setFlipped(false);
          setExplanation(null);
          setSummaryData(null);
          startFlashcards({ subject_code: subjectCode, topic_id: topicId })
            .then((data) => {
              setSessionId(data.session_id);
              setCards(data.cards ?? []);
              setPhase(data.cards?.length ? "playing" : "summary");
            });
        }}
      />
    );
  }

  const card = cards[currentIndex];
  const progress = cards.length > 0 ? ((currentIndex + 1) / cards.length) * 100 : 0;

  return (
    <div className="flex h-[calc(100vh-80px)] -my-5 -mx-8">
      <div className="flex-[6] overflow-y-auto px-8 py-6">
        <div className="max-w-2xl mx-auto space-y-6">
          {/* Progress bar */}
          <div className="flex items-center gap-3">
            <div className="flex-1 h-1.5 rounded-full bg-muted overflow-hidden">
              <motion.div
                className="h-full rounded-full bg-primary"
                animate={{ width: `${progress}%` }}
                transition={{ duration: 0.5, ease: "easeOut" }}
              />
            </div>
            <span className="text-xs text-muted-foreground tabular-nums shrink-0">
              {currentIndex + 1} / {cards.length}
            </span>
          </div>

          {/* Topic label */}
          <div className="flex items-center gap-2">
            <div
              className={cn("w-2 h-2 rounded-full", meta.accent.replace("text-", "bg-"))}
            />
            <span className="text-xs text-muted-foreground">{card?.topic_name}</span>
          </div>

          {/* Card */}
          <AnimatePresence mode="wait">
            <motion.div
              key={currentIndex}
              initial={{ opacity: 0, x: 40 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -40 }}
              transition={{ duration: 0.25 }}
            >
              <FlashcardCard
                front={card?.question ?? card?.flashcard_front ?? card?.fact_text ?? ""}
                explanation={explanation}
                flipped={flipped}
                loading={explainLoading && flipped}
                accentClass={meta.accent.replace("text-", "")}
                onFlip={handleFlip}
              />
            </motion.div>
          </AnimatePresence>

          {/* Mastery update indicator */}
          <AnimatePresence>
            {lastMastery && (
              <motion.div
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0 }}
                className="text-center text-sm text-muted-foreground"
              >
                Mastery:{" "}
                <span className="text-foreground tabular-nums">{lastMastery.from}%</span>
                {" → "}
                <span
                  className={cn(
                    "font-semibold tabular-nums",
                    lastMastery.to > lastMastery.from ? "text-emerald-400" : "text-red-400"
                  )}
                >
                  {lastMastery.to}%
                </span>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Buttons (only when flipped) */}
          {flipped && !lastMastery && (
            <FlashcardButtons onResult={handleResult} disabled={answering} />
          )}
        </div>
      </div>
      <div className="flex-[4] hidden md:flex border-l border-border/50 bg-card/30 flex-col">
        <CompanionPanel
          ref={companionRef}
          parentSessionId={sessionId}
          subjectCode={subjectCode}
          topicId={topicId}
          contextRef={companionContextRef}
        />
      </div>
    </div>
  );
}

export default function FlashcardSessionPage() {
  return (
    <Suspense fallback={<Skeleton className="h-[400px] max-w-2xl mx-auto rounded-2xl" />}>
      <FlashcardSessionInner />
    </Suspense>
  );
}
