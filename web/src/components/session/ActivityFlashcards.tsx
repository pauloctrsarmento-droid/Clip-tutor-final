"use client";

import { useEmbeddedFlashcards } from "@/hooks/use-embedded-flashcards";
import type { FlashcardSummaryData } from "@/hooks/use-embedded-flashcards";
import { getSubjectMeta } from "@/lib/subject-meta";
import { FlashcardCard } from "@/components/flashcards/flashcard-card";
import { FlashcardButtons } from "@/components/flashcards/flashcard-buttons";
import { FlashcardSummary } from "@/components/flashcards/flashcard-summary";
import { Skeleton } from "@/components/ui/skeleton";
import { motion, AnimatePresence } from "framer-motion";
import { cn } from "@/lib/utils";

interface ActivityFlashcardsProps {
  subjectCode: string;
  topicId?: string;
  count?: number;
  onResult?: (result: "know" | "partial" | "dunno") => void;
  onComplete?: (summary: FlashcardSummaryData) => void;
}

export function ActivityFlashcards({
  subjectCode,
  topicId,
  count = 10,
  onResult,
  onComplete,
}: ActivityFlashcardsProps) {
  const meta = getSubjectMeta(subjectCode);

  const {
    phase,
    currentCard,
    currentIndex,
    totalCards,
    flipped,
    explanation,
    explainLoading,
    answering,
    lastMastery,
    summary,
    loadError,
    flip,
    handleResult,
  } = useEmbeddedFlashcards({
    subjectCode,
    topicId,
    limit: count,
    onResult,
    onComplete,
  });

  if (loadError) {
    return (
      <div className="flex items-center justify-center h-full p-8">
        <p className="text-sm text-muted-foreground">Failed to load flashcards.</p>
      </div>
    );
  }

  if (phase === "loading") {
    return (
      <div className="p-6 space-y-4">
        <Skeleton className="h-2 rounded-full" />
        <Skeleton className="h-[300px] rounded-2xl" />
        <div className="flex gap-3">
          <Skeleton className="flex-1 h-10 rounded-xl" />
          <Skeleton className="flex-1 h-10 rounded-xl" />
          <Skeleton className="flex-1 h-10 rounded-xl" />
        </div>
      </div>
    );
  }

  if (phase === "summary" && summary) {
    return (
      <div className="p-4">
        <FlashcardSummary
          totalCards={summary.total_cards}
          correct={summary.correct}
          incorrect={summary.incorrect}
          durationSeconds={summary.duration_seconds}
          onBack={() => {}}
          onRestart={() => {}}
        />
      </div>
    );
  }

  if (!currentCard) return null;

  const progress = totalCards > 0 ? ((currentIndex + 1) / totalCards) * 100 : 0;

  return (
    <div className="p-4 space-y-4 overflow-y-auto h-full">
      {/* Progress */}
      <div className="flex items-center gap-3">
        <div className="flex-1 h-1.5 rounded-full bg-muted overflow-hidden">
          <motion.div
            className="h-full rounded-full bg-primary"
            animate={{ width: `${progress}%` }}
            transition={{ duration: 0.5, ease: "easeOut" }}
          />
        </div>
        <span className="text-xs text-muted-foreground tabular-nums shrink-0">
          {currentIndex + 1} / {totalCards}
        </span>
      </div>

      {/* Topic */}
      <div className="flex items-center gap-2">
        <div className={cn("w-2 h-2 rounded-full", meta.accent.replace("text-", "bg-"))} />
        <span className="text-xs text-muted-foreground">{currentCard.topic_name}</span>
      </div>

      {/* Card */}
      <AnimatePresence mode="wait">
        <motion.div
          key={currentIndex}
          initial={{ opacity: 0, x: 30 }}
          animate={{ opacity: 1, x: 0 }}
          exit={{ opacity: 0, x: -30 }}
          transition={{ duration: 0.25 }}
        >
          <FlashcardCard
            front={currentCard.question ?? currentCard.flashcard_front ?? currentCard.fact_text}
            explanation={explanation}
            flipped={flipped}
            loading={explainLoading && flipped}
            accentClass={meta.accent.replace("text-", "")}
            onFlip={flip}
          />
        </motion.div>
      </AnimatePresence>

      {/* Mastery delta */}
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
                lastMastery.to > lastMastery.from ? "text-emerald-400" : "text-red-400",
              )}
            >
              {lastMastery.to}%
            </span>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Buttons */}
      {flipped && !lastMastery && (
        <FlashcardButtons onResult={handleResult} disabled={answering} />
      )}
    </div>
  );
}
