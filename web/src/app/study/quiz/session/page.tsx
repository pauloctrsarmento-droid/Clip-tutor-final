"use client";

import { useEffect, useState, useCallback, useRef, Suspense } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { startQuiz, evaluateQuizAnswer, endQuiz } from "@/lib/api";
import { getSubjectMeta } from "@/lib/subject-meta";
import { QuizProgress } from "@/components/quiz/quiz-progress";
import { QuizQuestion } from "@/components/quiz/quiz-question";
import { QuizAnswerInput } from "@/components/quiz/quiz-answer-input";
import { QuizFeedback } from "@/components/quiz/quiz-feedback";
import { QuizSummary } from "@/components/quiz/quiz-summary";
import { Skeleton } from "@/components/ui/skeleton";
import { motion, AnimatePresence } from "framer-motion";

interface Question {
  id: string;
  question_text: string;
  marks: number;
  response_type: string;
  question_type: string;
  parent_context: string | null;
  diagram_urls: string[];
  options: Record<string, string> | null;
}

interface Evaluation {
  marks_awarded: number;
  marks_available: number;
  mark_points: Array<{ id: string; description: string; awarded: boolean; feedback: string }>;
  overall_feedback: string;
  exam_tip: string;
  concept_check: string | null;
}

interface Summary {
  total_marks_earned: number;
  total_marks_available: number;
  questions_attempted: number;
  accuracy: number;
  duration_seconds: number;
}

function QuizSessionInner() {
  const searchParams = useSearchParams();
  const router = useRouter();

  const subjectCode = searchParams.get("subject") ?? "";
  const topicId = searchParams.get("topic") ?? undefined;
  const questionType = searchParams.get("type") ?? "all";
  const difficulty = searchParams.get("difficulty") ?? undefined;
  const count = Number(searchParams.get("count") ?? "10");

  const [phase, setPhase] = useState<"loading" | "answering" | "feedback" | "summary">("loading");
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [questions, setQuestions] = useState<Question[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [evaluation, setEvaluation] = useState<Evaluation | null>(null);
  const [evaluating, setEvaluating] = useState(false);
  const [marksEarned, setMarksEarned] = useState(0);
  const [marksAvailable, setMarksAvailable] = useState(0);
  const [summaryData, setSummaryData] = useState<Summary | null>(null);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const meta = getSubjectMeta(subjectCode);

  // Timer
  useEffect(() => {
    if (phase === "answering" || phase === "feedback") {
      timerRef.current = setInterval(() => setElapsedSeconds((s) => s + 1), 1000);
      return () => { if (timerRef.current) clearInterval(timerRef.current); };
    }
  }, [phase]);

  // Start session
  useEffect(() => {
    if (!subjectCode) return;
    startQuiz({ subject_code: subjectCode, topic_id: topicId, count, question_type: questionType, difficulty })
      .then((data) => {
        setSessionId(data.session_id);
        setQuestions(data.questions ?? []);
        setPhase(data.questions?.length ? "answering" : "summary");
      })
      .catch(() => router.push("/study/quiz"));
  }, [subjectCode, topicId, count, questionType, router]);

  const handleSubmit = useCallback(
    async (answer: string, photos?: File[]) => {
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
          photos,
        });

        setEvaluation(result);
        setMarksEarned((m) => m + (result.marks_awarded ?? 0));
        setMarksAvailable((m) => m + (result.marks_available ?? q.marks));
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
    [sessionId, evaluating, questions, currentIndex]
  );

  const handleNext = useCallback(async () => {
    if (currentIndex < questions.length - 1) {
      setCurrentIndex((i) => i + 1);
      setEvaluation(null);
      setPhase("answering");
    } else {
      // End quiz
      if (sessionId) {
        try {
          const summary = await endQuiz(sessionId);
          setSummaryData(summary);
        } catch {
          setSummaryData({
            total_marks_earned: marksEarned,
            total_marks_available: marksAvailable,
            questions_attempted: questions.length,
            accuracy: marksAvailable > 0 ? Math.round((marksEarned / marksAvailable) * 100) : 0,
            duration_seconds: elapsedSeconds,
          });
        }
      }
      setPhase("summary");
      if (timerRef.current) clearInterval(timerRef.current);
    }
  }, [currentIndex, questions, sessionId, marksEarned, marksAvailable, elapsedSeconds]);

  if (phase === "loading") {
    return (
      <div className="max-w-3xl mx-auto space-y-6">
        <Skeleton className="h-12 rounded-xl" />
        <Skeleton className="h-[300px] rounded-2xl" />
        <Skeleton className="h-40 rounded-2xl" />
      </div>
    );
  }

  if (phase === "summary") {
    const s = summaryData;
    return (
      <QuizSummary
        totalMarksEarned={s?.total_marks_earned ?? marksEarned}
        totalMarksAvailable={s?.total_marks_available ?? marksAvailable}
        questionsAttempted={s?.questions_attempted ?? questions.length}
        accuracy={s?.accuracy ?? (marksAvailable > 0 ? Math.round((marksEarned / marksAvailable) * 100) : 0)}
        durationSeconds={s?.duration_seconds ?? elapsedSeconds}
        onBack={() => router.push("/study/quiz")}
        onRetry={() => window.location.reload()}
        onNew={() => router.push("/study/quiz")}
      />
    );
  }

  const question = questions[currentIndex];

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      {/* Progress */}
      <QuizProgress
        current={currentIndex + 1}
        total={questions.length}
        marksEarned={marksEarned}
        marksAvailable={marksAvailable}
        elapsedSeconds={elapsedSeconds}
        subjectName={subjectCode}
        accentClass={meta.accent}
      />

      {/* Question */}
      <AnimatePresence mode="wait">
        <motion.div
          key={currentIndex}
          initial={{ opacity: 0, x: 30 }}
          animate={{ opacity: 1, x: 0 }}
          exit={{ opacity: 0, x: -30 }}
          transition={{ duration: 0.2 }}
        >
          <div className="bg-card border border-border rounded-2xl p-6 space-y-6">
            <QuizQuestion
              questionText={question.question_text}
              marks={question.marks}
              parentContext={question.parent_context}
              diagramUrls={question.diagram_urls}
            />

            {/* Answer input (hidden during feedback) */}
            {phase === "answering" && (
              <QuizAnswerInput
                responseType={question.response_type}
                options={question.options}
                onSubmit={handleSubmit}
                submitting={evaluating}
                disabled={false}
                accentClass={meta.accent}
              />
            )}
          </div>
        </motion.div>
      </AnimatePresence>

      {/* Feedback */}
      {(phase === "feedback" || evaluating) && (
        <QuizFeedback
          loading={evaluating}
          marksAwarded={evaluation?.marks_awarded ?? 0}
          marksAvailable={evaluation?.marks_available ?? question.marks}
          markPoints={evaluation?.mark_points ?? []}
          overallFeedback={evaluation?.overall_feedback ?? ""}
          examTip={evaluation?.exam_tip ?? ""}
          conceptCheck={evaluation?.concept_check ?? null}
          onNext={handleNext}
        />
      )}
    </div>
  );
}

export default function QuizSessionPage() {
  return (
    <Suspense fallback={<Skeleton className="h-[400px] max-w-3xl mx-auto rounded-2xl" />}>
      <QuizSessionInner />
    </Suspense>
  );
}
