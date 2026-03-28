"use client";

import { motion } from "framer-motion";
import { Check, Minus, X } from "lucide-react";
import { cn } from "@/lib/utils";

type Result = "know" | "partial" | "dunno";

interface FlashcardButtonsProps {
  onResult: (result: Result) => void;
  disabled: boolean;
}

const BUTTONS: { result: Result; label: string; icon: typeof Check; colors: string }[] = [
  {
    result: "dunno",
    label: "Don't know",
    icon: X,
    colors: "border-red-500/20 bg-red-500/5 text-red-400 hover:bg-red-500/10 hover:border-red-500/30",
  },
  {
    result: "partial",
    label: "Partially",
    icon: Minus,
    colors: "border-amber-500/20 bg-amber-500/5 text-amber-400 hover:bg-amber-500/10 hover:border-amber-500/30",
  },
  {
    result: "know",
    label: "I know this",
    icon: Check,
    colors: "border-emerald-500/20 bg-emerald-500/5 text-emerald-400 hover:bg-emerald-500/10 hover:border-emerald-500/30",
  },
];

export function FlashcardButtons({ onResult, disabled }: FlashcardButtonsProps) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3, ease: "easeOut" }}
      className="flex gap-3"
    >
      {BUTTONS.map((btn) => {
        const Icon = btn.icon;
        return (
          <button
            key={btn.result}
            onClick={() => onResult(btn.result)}
            disabled={disabled}
            className={cn(
              "flex-1 flex items-center justify-center gap-2",
              "min-h-12 rounded-xl border-2",
              "text-sm font-semibold",
              "cursor-pointer transition-all duration-200",
              "active:scale-[0.97]",
              "disabled:opacity-40 disabled:cursor-not-allowed",
              "focus-visible:ring-2 focus-visible:ring-primary focus-visible:outline-none",
              btn.colors
            )}
          >
            <Icon className="w-4 h-4" />
            {btn.label}
          </button>
        );
      })}
    </motion.div>
  );
}
