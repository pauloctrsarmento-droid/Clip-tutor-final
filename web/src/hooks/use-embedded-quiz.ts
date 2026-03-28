import { useEffect, useState, useCallback, useRef } from "react";
import { startQuiz, evaluateQuizAnswer, endQuiz } from "@/lib/api";

// ── Types ──────────────────────────────────────────────────

export interface QuizQuestionData {
  id: string;
  question_text: string;
  marks: number;
  response_type: string;
  question_type: string;
  parent_context: string | null;
  diagram_urls: string[];
  options: Record<string, string> | null;
}

export interface QuizEvaluation {
  marks_awarded: number;
  marks_available: number;
  mark_points: Array<{
    id: string;
    description: string;
    awarded: boolean;
    feedback: string;
  }>;
  overall_feedback: string;
  exam_tip: string;
  concept_check: string | null;
}

export interface QuizSummaryData {
  total_marks_earned: number;
  total_marks_available: number;
  questions_attempted: number;
  accuracy: number;
  duration_seconds: number;
}

// ── Hook options ───────────────────────────────────────────

interface UseEmbeddedQuizOptions {
  subjectCode: string;
  topicId?: string;
  count?: number;
  questionType?: string;
  onAnswer?: (result: {
    correct: boolean;
    marks_awarded: number;
    marks_available: number;
  }) => void;
  onComplete?: (summary: QuizSummaryData) => void;
}

// ── Hook ───────────────────────────────────────────────────

export function useEmbeddedQuiz(options: UseEmbeddedQuizOptions) {
  const {
    subjectCode,
    topicId,
    count = 6,
    questionType = "all",
    onAnswer,
    onComplete,
  } = options;

  const [phase, setPhase] = useState<
    "loading" | "answering" | "feedback" | "summary"
  >("loading");
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [questions, setQuestions] = useState<QuizQuestionData[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [evaluation, setEvaluation] = useState<QuizEvaluation | null>(null);
  const [evaluating, setEvaluating] = useState(false);
  const [marksEarned, setMarksEarned] = useState(0);
  const [marksAvailable, setMarksAvailable] = useState(0);
  const [summary, setSummary] = useState<QuizSummaryData | null>(null);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const [loadError, setLoadError] = useState<string | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Timer
  useEffect(() => {
    if (phase === "answering" || phase === "feedback") {
      timerRef.current = setInterval(
        () => setElapsedSeconds((s) => s + 1),
        1000,
      );
      return () => {
        if (timerRef.current) clearInterval(timerRef.current);
      };
    }
  }, [phase]);

  // Start quiz session
  useEffect(() => {
    if (!subjectCode) return;
    startQuiz({
      subject_code: subjectCode,
      topic_id: topicId,
      count,
      question_type: questionType,
    })
      .then((data) => {
        setSessionId(data.session_id);
        setQuestions(data.questions ?? []);
        setPhase(data.questions?.length ? "answering" : "summary");
      })
      .catch((err) => {
        setLoadError(
          err instanceof Error ? err.message : "Failed to load quiz",
        );
      });
  }, [subjectCode, topicId, count, questionType]);

  const submitAnswer = useCallback(
    async (answer: string) => {
      if (!sessionId || evaluating) return;
      const q = questions[currentIndex];
      if (!q) return;

      setEvaluating(true);
      setPhase("feedback");

      try {
        const result = await evaluateQuizAnswer({
          session_id: sessionId,
          question_id: q.id,
          student_answer: answer,
        });

        setEvaluation(result);
        setMarksEarned((m) => m + (result.marks_awarded ?? 0));
        setMarksAvailable((m) => m + (result.marks_available ?? q.marks));

        onAnswer?.({
          correct: (result.marks_awarded ?? 0) > 0,
          marks_awarded: result.marks_awarded ?? 0,
          marks_available: result.marks_available ?? q.marks,
        });
      } catch {
        setEvaluation({
          marks_awarded: 0,
          marks_available: q.marks,
          mark_points: [],
          overall_feedback: "Failed to evaluate. Please try again.",
          exam_tip: "",
          concept_check: null,
        });
      } finally {
        setEvaluating(false);
      }
    },
    [sessionId, evaluating, questions, currentIndex, onAnswer],
  );

  const nextQuestion = useCallback(async () => {
    if (currentIndex < questions.length - 1) {
      setCurrentIndex((i) => i + 1);
      setEvaluation(null);
      setPhase("answering");
    } else {
      // End quiz
      let summaryData: QuizSummaryData;
      if (sessionId) {
        try {
          summaryData = await endQuiz(sessionId);
        } catch {
          summaryData = {
            total_marks_earned: marksEarned,
            total_marks_available: marksAvailable,
            questions_attempted: questions.length,
            accuracy:
              marksAvailable > 0
                ? Math.round((marksEarned / marksAvailable) * 100)
                : 0,
            duration_seconds: elapsedSeconds,
          };
        }
      } else {
        summaryData = {
          total_marks_earned: marksEarned,
          total_marks_available: marksAvailable,
          questions_attempted: questions.length,
          accuracy:
            marksAvailable > 0
              ? Math.round((marksEarned / marksAvailable) * 100)
              : 0,
          duration_seconds: elapsedSeconds,
        };
      }

      setSummary(summaryData);
      setPhase("summary");
      if (timerRef.current) clearInterval(timerRef.current);
      onComplete?.(summaryData);
    }
  }, [
    currentIndex,
    questions,
    sessionId,
    marksEarned,
    marksAvailable,
    elapsedSeconds,
    onComplete,
  ]);

  return {
    phase,
    currentQuestion: questions[currentIndex] ?? null,
    currentIndex,
    totalQuestions: questions.length,
    evaluation,
    marksEarned,
    marksAvailable,
    elapsedSeconds,
    evaluating,
    submitAnswer,
    nextQuestion,
    summary,
    loadError,
  };
}
