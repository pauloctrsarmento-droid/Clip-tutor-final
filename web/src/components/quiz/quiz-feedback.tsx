"use client";

import { motion } from "framer-motion";
import { RichText } from "@/components/rich-text";
import { Button } from "@/components/ui/button";
import { Check, X, Lightbulb, ChevronRight, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

interface MarkPoint {
  id: string;
  description: string;
  awarded: boolean;
  feedback: string;
}

interface QuizFeedbackProps {
  loading: boolean;
  marksAwarded: number;
  marksAvailable: number;
  markPoints: MarkPoint[];
  overallFeedback: string;
  examTip: string;
  conceptCheck: string | null;
  mcqCorrectAnswer?: string | null;
  mcqSelected?: string | null;
  onNext: () => void;
}

export function QuizFeedback({
  loading,
  marksAwarded,
  marksAvailable,
  markPoints,
  overallFeedback,
  examTip,
  conceptCheck,
  onNext,
}: QuizFeedbackProps) {
  if (loading) {
    return (
      <motion.div
        initial={{ opacity: 0, height: 0 }}
        animate={{ opacity: 1, height: "auto" }}
        className="bg-card border border-border rounded-2xl p-6 flex items-center justify-center gap-3"
      >
        <Loader2 className="w-5 h-5 animate-spin text-primary" />
        <span className="text-sm text-muted-foreground">Evaluating your answer...</span>
      </motion.div>
    );
  }

  const ratio = marksAvailable > 0 ? marksAwarded / marksAvailable : 0;
  const tier = ratio >= 1 ? "full" : ratio > 0 ? "partial" : "zero";
  const tierColors = {
    full: { border: "border-emerald-500/30", bg: "bg-emerald-500/5", text: "text-emerald-400" },
    partial: { border: "border-amber-500/30", bg: "bg-amber-500/5", text: "text-amber-400" },
    zero: { border: "border-red-500/30", bg: "bg-red-500/5", text: "text-red-400" },
  };
  const colors = tierColors[tier];

  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
      className="space-y-4"
    >
      {/* Marks bar */}
      <div className={cn("rounded-2xl border-2 p-5", colors.border, colors.bg)}>
        <div className="flex items-center justify-between mb-4">
          <span className={cn("text-2xl font-heading font-bold tabular-nums", colors.text)}>
            {marksAwarded}/{marksAvailable} marks
          </span>
          <span className="text-xs text-muted-foreground">
            {tier === "full" ? "Full marks" : tier === "partial" ? "Partial marks" : "No marks"}
          </span>
        </div>

        {/* Mark points */}
        {markPoints.length > 0 && (
          <div className="space-y-2">
            {markPoints.map((mp, i) => (
              <motion.div
                key={mp.id}
                initial={{ opacity: 0, x: -8 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: 0.1 + i * 0.05 }}
                className={cn(
                  "flex items-start gap-3 p-3 rounded-xl border-l-4",
                  mp.awarded
                    ? "border-l-emerald-500 bg-emerald-500/5"
                    : "border-l-red-500 bg-red-500/5"
                )}
              >
                <div className={cn(
                  "w-5 h-5 rounded-full flex items-center justify-center shrink-0 mt-0.5",
                  mp.awarded ? "bg-emerald-500/20" : "bg-red-500/20"
                )}>
                  {mp.awarded
                    ? <Check className="w-3 h-3 text-emerald-400" />
                    : <X className="w-3 h-3 text-red-400" />}
                </div>
                <div className="flex-1 min-w-0">
                  <span className="text-xs font-mono text-muted-foreground">{mp.id}</span>
                  <RichText content={mp.feedback} className="text-sm leading-relaxed mt-0.5" />
                </div>
              </motion.div>
            ))}
          </div>
        )}
      </div>

      {/* Overall feedback */}
      {overallFeedback && (
        <div className="bg-card border border-border rounded-2xl p-5">
          <RichText
            content={overallFeedback}
            className="text-sm leading-relaxed text-muted-foreground [&_strong]:text-foreground"
          />
        </div>
      )}

      {/* Exam tip */}
      {examTip && (
        <div className="bg-amber-500/5 border border-amber-500/20 rounded-xl p-4 flex items-start gap-3">
          <Lightbulb className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
          <RichText content={examTip} className="text-sm text-amber-200/80" />
        </div>
      )}

      {/* Concept check */}
      {conceptCheck && (
        <div className="bg-primary/5 border border-primary/20 rounded-xl p-4">
          <p className="text-[10px] uppercase tracking-wider text-primary mb-1">Think about this</p>
          <RichText content={conceptCheck} className="text-sm" />
        </div>
      )}

      {/* Next button */}
      <Button onClick={onNext} className="w-full cursor-pointer gap-2 h-12">
        Next Question
        <ChevronRight className="w-4 h-4" />
      </Button>
    </motion.div>
  );
}
