"use client";

import { motion } from "framer-motion";
import { Button } from "@/components/ui/button";
import { Trophy, Target, AlertCircle, ArrowLeft, RotateCcw, Plus } from "lucide-react";
import { cn } from "@/lib/utils";

interface QuizSummaryProps {
  totalMarksEarned: number;
  totalMarksAvailable: number;
  questionsAttempted: number;
  accuracy: number;
  durationSeconds: number;
  onBack: () => void;
  onRetry: () => void;
  onNew: () => void;
}

export function QuizSummary({
  totalMarksEarned,
  totalMarksAvailable,
  questionsAttempted,
  accuracy,
  durationSeconds,
  onBack,
  onRetry,
  onNew,
}: QuizSummaryProps) {
  const minutes = Math.floor(durationSeconds / 60);
  const seconds = durationSeconds % 60;

  const tier = accuracy >= 80 ? "great" : accuracy >= 50 ? "good" : "needs-work";
  const config = {
    great: { icon: Trophy, color: "text-emerald-400", bg: "bg-emerald-500/10", border: "border-emerald-500/20", message: "Excellent performance!" },
    good: { icon: Target, color: "text-amber-400", bg: "bg-amber-500/10", border: "border-amber-500/20", message: "Solid work — keep practising!" },
    "needs-work": { icon: AlertCircle, color: "text-primary", bg: "bg-primary/10", border: "border-primary/20", message: "Every attempt builds understanding." },
  }[tier];

  const Icon = config.icon;

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ duration: 0.4, ease: [0.4, 0, 0.2, 1] }}
      className="max-w-md mx-auto text-center space-y-8"
    >
      <motion.div
        initial={{ scale: 0 }}
        animate={{ scale: 1 }}
        transition={{ delay: 0.2, type: "spring", stiffness: 200, damping: 15 }}
        className={cn("w-20 h-20 rounded-2xl mx-auto flex items-center justify-center border-2", config.bg, config.border)}
      >
        <Icon className={cn("w-10 h-10", config.color)} />
      </motion.div>

      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.3 }} className="space-y-2">
        <p className={cn("text-5xl font-heading font-bold tabular-nums", config.color)}>
          {totalMarksEarned}/{totalMarksAvailable}
        </p>
        <p className="text-lg text-muted-foreground">{accuracy}% accuracy</p>
        <p className="text-sm text-muted-foreground">{config.message}</p>
      </motion.div>

      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.4 }} className="grid grid-cols-3 gap-4">
        <div className="bg-card border border-border rounded-xl p-4">
          <p className="text-xl font-heading font-bold">{questionsAttempted}</p>
          <p className="text-[10px] text-muted-foreground">Questions</p>
        </div>
        <div className="bg-card border border-border rounded-xl p-4">
          <p className="text-xl font-heading font-bold">{accuracy}%</p>
          <p className="text-[10px] text-muted-foreground">Accuracy</p>
        </div>
        <div className="bg-card border border-border rounded-xl p-4">
          <p className="text-xl font-heading font-bold tabular-nums">
            {minutes}:{seconds.toString().padStart(2, "0")}
          </p>
          <p className="text-[10px] text-muted-foreground">Duration</p>
        </div>
      </motion.div>

      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.5 }} className="flex gap-3">
        <Button variant="ghost" onClick={onBack} className="flex-1 cursor-pointer gap-1.5">
          <ArrowLeft className="w-4 h-4" /> Back
        </Button>
        <Button variant="ghost" onClick={onRetry} className="flex-1 cursor-pointer gap-1.5">
          <RotateCcw className="w-4 h-4" /> Retry
        </Button>
        <Button onClick={onNew} className="flex-1 cursor-pointer gap-1.5">
          <Plus className="w-4 h-4" /> New Quiz
        </Button>
      </motion.div>
    </motion.div>
  );
}
