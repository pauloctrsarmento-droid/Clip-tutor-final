"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { SubjectPicker } from "@/components/flashcards/subject-picker";
import { QUIZ_DISABLED_SUBJECTS } from "@/lib/constants";
import { cn } from "@/lib/utils";

const QUESTION_TYPES = [
  { value: "all", label: "All Types" },
  { value: "mcq", label: "Multiple Choice" },
  { value: "text", label: "Written" },
  { value: "numeric", label: "Calculation" },
];

const DIFFICULTIES = [
  { value: "all", label: "All Levels" },
  { value: "easy", label: "Easy" },
  { value: "medium", label: "Medium" },
  { value: "hard", label: "Hard" },
];

const COUNTS = [5, 10, 15, 20];

export default function QuizPage() {
  const router = useRouter();
  const [questionType, setQuestionType] = useState("all");
  const [difficulty, setDifficulty] = useState("all");
  const [count, setCount] = useState(10);

  const handleStart = (subjectCode: string, topicId?: string) => {
    const params = new URLSearchParams({
      subject: subjectCode,
      type: questionType,
      count: String(count),
    });
    if (topicId) params.set("topic", topicId);
    if (difficulty !== "all") params.set("difficulty", difficulty);
    router.push(`/study/quiz/session?${params.toString()}`);
  };

  return (
    <div className="space-y-8">
      {/* Filters */}
      <div className="flex flex-wrap items-center gap-6">
        {/* Question type */}
        <div className="space-y-1.5">
          <p className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">Type</p>
          <div className="flex gap-1.5">
            {QUESTION_TYPES.map((t) => (
              <button
                key={t.value}
                onClick={() => setQuestionType(t.value)}
                className={cn(
                  "px-3 py-1.5 rounded-lg text-xs font-medium cursor-pointer transition-all",
                  questionType === t.value
                    ? "bg-primary text-primary-foreground"
                    : "bg-secondary text-muted-foreground hover:text-foreground"
                )}
              >
                {t.label}
              </button>
            ))}
          </div>
        </div>

        {/* Difficulty */}
        <div className="space-y-1.5">
          <p className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">Difficulty</p>
          <div className="flex gap-1.5">
            {DIFFICULTIES.map((d) => (
              <button
                key={d.value}
                onClick={() => setDifficulty(d.value)}
                className={cn(
                  "px-3 py-1.5 rounded-lg text-xs font-medium cursor-pointer transition-all",
                  difficulty === d.value
                    ? "bg-primary text-primary-foreground"
                    : "bg-secondary text-muted-foreground hover:text-foreground"
                )}
              >
                {d.label}
              </button>
            ))}
          </div>
        </div>

        {/* Count */}
        <div className="space-y-1.5">
          <p className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">Questions</p>
          <div className="flex gap-1.5">
            {COUNTS.map((c) => (
              <button
                key={c}
                onClick={() => setCount(c)}
                className={cn(
                  "w-10 h-8 rounded-lg text-xs font-medium cursor-pointer transition-all tabular-nums",
                  count === c
                    ? "bg-primary text-primary-foreground"
                    : "bg-secondary text-muted-foreground hover:text-foreground"
                )}
              >
                {c}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Subject picker (reused from flashcards) */}
      <SubjectPicker onStart={handleStart} title="Quick Quiz" disabledSubjects={QUIZ_DISABLED_SUBJECTS} />
    </div>
  );
}
