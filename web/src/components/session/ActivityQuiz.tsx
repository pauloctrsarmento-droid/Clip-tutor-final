"use client";

import { useEmbeddedQuiz } from "@/hooks/use-embedded-quiz";
import type { QuizSummaryData } from "@/hooks/use-embedded-quiz";
import { getSubjectMeta } from "@/lib/subject-meta";
import { QuizProgress } from "@/components/quiz/quiz-progress";
import { QuizQuestion } from "@/components/quiz/quiz-question";
import { QuizAnswerInput } from "@/components/quiz/quiz-answer-input";
import { QuizFeedback } from "@/components/quiz/quiz-feedback";
import { QuizSummary } from "@/components/quiz/quiz-summary";
import { Skeleton } from "@/components/ui/skeleton";
import { motion, AnimatePresence } from "framer-motion";

interface ActivityQuizProps {
  subjectCode: string;
  topicId?: string;
  numQuestions?: number;
  onAnswer?: (result: { correct: boolean; marks_awarded: number; marks_available: number }) => void;
  onComplete?: (summary: QuizSummaryData) => void;
}

export function ActivityQuiz({
  subjectCode,
  topicId,
  numQuestions = 6,
  onAnswer,
  onComplete,
}: ActivityQuizProps) {
  const meta = getSubjectMeta(subjectCode);

  const {
    phase,
    currentQuestion,
    currentIndex,
    totalQuestions,
    evaluation,
    marksEarned,
    marksAvailable,
    elapsedSeconds,
    evaluating,
    submitAnswer,
    nextQuestion,
    summary,
    loadError,
  } = useEmbeddedQuiz({
    subjectCode,
    topicId,
    count: numQuestions,
    onAnswer,
    onComplete,
  });

  if (loadError) {
    return (
      <div className="flex items-center justify-center h-full p-8">
        <p className="text-sm text-muted-foreground">
          Failed to load quiz. The tutor will ask you questions in the chat instead.
        </p>
      </div>
    );
  }

  if (phase === "loading") {
    return (
      <div className="p-6 space-y-4">
        <Skeleton className="h-10 rounded-xl" />
        <Skeleton className="h-[200px] rounded-2xl" />
        <Skeleton className="h-32 rounded-2xl" />
      </div>
    );
  }

  if (phase === "summary" && summary) {
    return (
      <div className="p-4">
        <QuizSummary
          totalMarksEarned={summary.total_marks_earned}
          totalMarksAvailable={summary.total_marks_available}
          questionsAttempted={summary.questions_attempted}
          accuracy={summary.accuracy}
          durationSeconds={summary.duration_seconds}
          onBack={() => {}}
          onRetry={() => {}}
          onNew={() => {}}
        />
      </div>
    );
  }

  if (!currentQuestion) return null;

  return (
    <div className="p-4 space-y-4 overflow-y-auto h-full">
      <QuizProgress
        current={currentIndex + 1}
        total={totalQuestions}
        marksEarned={marksEarned}
        marksAvailable={marksAvailable}
        elapsedSeconds={elapsedSeconds}
        subjectName={subjectCode}
        accentClass={meta.accent}
      />

      <AnimatePresence mode="wait">
        <motion.div
          key={currentIndex}
          initial={{ opacity: 0, x: 20 }}
          animate={{ opacity: 1, x: 0 }}
          exit={{ opacity: 0, x: -20 }}
          transition={{ duration: 0.2 }}
        >
          <div className="bg-card border border-border rounded-2xl p-5 space-y-4">
            <QuizQuestion
              questionText={currentQuestion.question_text}
              marks={currentQuestion.marks}
              parentContext={currentQuestion.parent_context}
              diagramUrls={currentQuestion.diagram_urls}
            />

            {phase === "answering" && (
              <QuizAnswerInput
                responseType={currentQuestion.response_type}
                options={currentQuestion.options}
                onSubmit={submitAnswer}
                submitting={evaluating}
                disabled={false}
                accentClass={meta.accent}
              />
            )}
          </div>
        </motion.div>
      </AnimatePresence>

      {(phase === "feedback" || evaluating) && (
        <QuizFeedback
          loading={evaluating}
          marksAwarded={evaluation?.marks_awarded ?? 0}
          marksAvailable={evaluation?.marks_available ?? currentQuestion.marks}
          markPoints={evaluation?.mark_points ?? []}
          overallFeedback={evaluation?.overall_feedback ?? ""}
          examTip={evaluation?.exam_tip ?? ""}
          conceptCheck={evaluation?.concept_check ?? null}
          onNext={nextQuestion}
        />
      )}
    </div>
  );
}
