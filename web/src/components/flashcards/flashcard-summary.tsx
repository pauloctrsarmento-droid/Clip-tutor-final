"use client";

import { motion } from "framer-motion";
import { Button } from "@/components/ui/button";
import { CheckCircle2, AlertCircle, Trophy, ArrowLeft, RotateCcw } from "lucide-react";
import { cn } from "@/lib/utils";

interface FlashcardSummaryProps {
  totalCards: number;
  correct: number;
  incorrect: number;
  durationSeconds: number;
  onBack: () => void;
  onRestart: () => void;
}

export function FlashcardSummary({
  totalCards,
  correct,
  incorrect,
  durationSeconds,
  onBack,
  onRestart,
}: FlashcardSummaryProps) {
  const accuracy = totalCards > 0 ? Math.round((correct / totalCards) * 100) : 0;
  const minutes = Math.floor(durationSeconds / 60);
  const seconds = durationSeconds % 60;

  const tier =
    accuracy >= 80 ? "great" : accuracy >= 50 ? "good" : "needs-work";

  const tierConfig = {
    great: {
      icon: Trophy,
      color: "text-emerald-400",
      bg: "bg-emerald-500/10",
      border: "border-emerald-500/20",
      message: "Excellent session!",
    },
    good: {
      icon: CheckCircle2,
      color: "text-amber-400",
      bg: "bg-amber-500/10",
      border: "border-amber-500/20",
      message: "Good progress — keep going!",
    },
    "needs-work": {
      icon: AlertCircle,
      color: "text-primary",
      bg: "bg-primary/10",
      border: "border-primary/20",
      message: "Every review counts — you're building mastery.",
    },
  };

  const config = tierConfig[tier];
  const Icon = config.icon;

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ duration: 0.4, ease: [0.4, 0, 0.2, 1] }}
      className="max-w-md mx-auto text-center space-y-8"
    >
      {/* Icon */}
      <motion.div
        initial={{ scale: 0 }}
        animate={{ scale: 1 }}
        transition={{ delay: 0.2, type: "spring", stiffness: 200, damping: 15 }}
        className={cn("w-20 h-20 rounded-2xl mx-auto flex items-center justify-center", config.bg, config.border, "border-2")}
      >
        <Icon className={cn("w-10 h-10", config.color)} />
      </motion.div>

      {/* Score */}
      <div className="space-y-2">
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3 }}
        >
          <p className={cn("text-5xl font-heading font-bold tabular-nums", config.color)}>
            {accuracy}%
          </p>
          <p className="text-muted-foreground text-sm mt-1">{config.message}</p>
        </motion.div>
      </div>

      {/* Stats */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.4 }}
        className="grid grid-cols-3 gap-4"
      >
        <div className="bg-card border border-border rounded-xl p-4">
          <p className="text-xl font-heading font-bold text-emerald-400">{correct}</p>
          <p className="text-[10px] text-muted-foreground">Correct</p>
        </div>
        <div className="bg-card border border-border rounded-xl p-4">
          <p className="text-xl font-heading font-bold text-red-400">{incorrect}</p>
          <p className="text-[10px] text-muted-foreground">Incorrect</p>
        </div>
        <div className="bg-card border border-border rounded-xl p-4">
          <p className="text-xl font-heading font-bold text-foreground">
            {minutes}:{seconds.toString().padStart(2, "0")}
          </p>
          <p className="text-[10px] text-muted-foreground">Duration</p>
        </div>
      </motion.div>

      {/* Actions */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.5 }}
        className="flex gap-3"
      >
        <Button
          variant="ghost"
          onClick={onBack}
          className="flex-1 cursor-pointer gap-2"
        >
          <ArrowLeft className="w-4 h-4" />
          Back
        </Button>
        <Button
          onClick={onRestart}
          className="flex-1 cursor-pointer gap-2"
        >
          <RotateCcw className="w-4 h-4" />
          More flashcards
        </Button>
      </motion.div>
    </motion.div>
  );
}
