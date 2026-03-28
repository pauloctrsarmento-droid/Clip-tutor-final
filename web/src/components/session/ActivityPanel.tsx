"use client";

import { AnimatePresence, motion } from "framer-motion";
import { ActivityEmpty } from "./ActivityEmpty";
import { ActivityQuiz } from "./ActivityQuiz";
import { ActivityFlashcards } from "./ActivityFlashcards";
import { ActivityContent } from "./ActivityContent";
import type { TutorAction } from "@/lib/types";
import type { QuizSummaryData } from "@/hooks/use-embedded-quiz";
import type { FlashcardSummaryData } from "@/hooks/use-embedded-flashcards";

export type ActivityState =
  | { type: "idle" }
  | { type: "quiz"; subjectCode: string; topicId?: string; numQuestions?: number }
  | { type: "flashcards"; subjectCode: string; topicId?: string; count?: number }
  | { type: "content"; title: string; content: string; diagramUrl?: string };

interface ActivityPanelProps {
  activity: ActivityState;
  subjectCode: string;
  topicTitle: string;
  blockPhase: string;
  elapsedMinutes: number;
  onQuizAnswer?: (result: { correct: boolean; marks_awarded: number; marks_available: number }) => void;
  onQuizComplete?: (summary: QuizSummaryData) => void;
  onFlashcardResult?: (result: "know" | "partial" | "dunno") => void;
  onFlashcardComplete?: (summary: FlashcardSummaryData) => void;
}

export function ActivityPanel({
  activity,
  subjectCode,
  topicTitle,
  blockPhase,
  elapsedMinutes,
  onQuizAnswer,
  onQuizComplete,
  onFlashcardResult,
  onFlashcardComplete,
}: ActivityPanelProps) {
  return (
    <div className="h-full overflow-hidden">
      <AnimatePresence mode="wait">
        <motion.div
          key={activity.type}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.3 }}
          className="h-full"
        >
          {activity.type === "idle" && (
            <ActivityEmpty
              subjectCode={subjectCode}
              topicTitle={topicTitle}
              blockPhase={blockPhase}
              elapsedMinutes={elapsedMinutes}
            />
          )}

          {activity.type === "quiz" && (
            <ActivityQuiz
              subjectCode={activity.subjectCode}
              topicId={activity.topicId}
              numQuestions={activity.numQuestions}
              onAnswer={onQuizAnswer}
              onComplete={onQuizComplete}
            />
          )}

          {activity.type === "flashcards" && (
            <ActivityFlashcards
              subjectCode={activity.subjectCode}
              topicId={activity.topicId}
              count={activity.count}
              onResult={onFlashcardResult}
              onComplete={onFlashcardComplete}
            />
          )}

          {activity.type === "content" && (
            <ActivityContent
              title={activity.title}
              content={activity.content}
              diagramUrl={activity.diagramUrl}
            />
          )}
        </motion.div>
      </AnimatePresence>
    </div>
  );
}

/** Map a TutorAction to an ActivityState */
export function actionToActivity(
  action: TutorAction,
  fallbackSubject: string,
): ActivityState | null {
  switch (action.type) {
    case "launch_quiz":
      return {
        type: "quiz",
        subjectCode: fallbackSubject,
        topicId: action.config.topic_id,
        numQuestions: action.config.num_questions,
      };
    case "launch_flashcards":
      return {
        type: "flashcards",
        subjectCode: fallbackSubject,
        topicId: action.config.topic_id,
        count: action.config.count,
      };
    case "show_content":
      return {
        type: "content",
        title: action.config.title,
        content: action.config.content,
        diagramUrl: action.config.diagram_url,
      };
    case "clear_panel":
    case "end_block":
    case "end_session":
      return { type: "idle" };
    default:
      return null;
  }
}
