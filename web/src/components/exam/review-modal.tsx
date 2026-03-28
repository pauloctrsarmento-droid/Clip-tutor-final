"use client";

import { useState, useCallback } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import type { ReviewQuestion, Clarification } from "./types";

interface ReviewModalProps {
  open: boolean;
  questions: ReviewQuestion[];
  onSubmit: (clarifications: Clarification[]) => void;
  onSkip: () => void;
}

export function ReviewModal({ open, questions, onSubmit, onSkip }: ReviewModalProps) {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [clarifications, setClarifications] = useState<Map<string, string>>(
    () => new Map()
  );

  const current = questions[currentIndex];
  const isLast = currentIndex === questions.length - 1;

  const handleTextChange = useCallback(
    (value: string) => {
      if (!current) return;
      setClarifications((prev) => {
        const next = new Map(prev);
        next.set(current.question_number, value);
        return next;
      });
    },
    [current]
  );

  const handleNext = useCallback(() => {
    if (isLast) {
      const result: Clarification[] = [];
      for (const q of questions) {
        const text = clarifications.get(q.question_number) ?? "";
        if (text.trim()) {
          result.push({ question_number: q.question_number, typed_text: text });
        }
      }
      onSubmit(result);
    } else {
      setCurrentIndex((i) => i + 1);
    }
  }, [isLast, questions, clarifications, onSubmit]);

  if (!current) return null;

  return (
    <Dialog open={open}>
      <DialogContent showCloseButton={false} className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Clarify Your Answer</DialogTitle>
          <p className="text-xs text-muted-foreground tabular-nums">
            {currentIndex + 1} of {questions.length}
          </p>
        </DialogHeader>

        <AnimatePresence mode="wait">
          <motion.div
            key={currentIndex}
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -20 }}
            transition={{ duration: 0.2 }}
            className="space-y-4"
          >
            <p className="text-sm text-foreground">
              I couldn&apos;t clearly read your answer to{" "}
              <span className="font-semibold">Q{current.question_number}</span>
            </p>

            <div className="rounded-lg bg-secondary px-3 py-2">
              <p className="text-xs text-muted-foreground mb-1">What I read:</p>
              <p className="text-sm text-foreground">{current.read_text}</p>
            </div>

            <div className="space-y-1.5">
              <label
                htmlFor="clarification-input"
                className="text-xs font-medium text-muted-foreground"
              >
                Type your actual answer
              </label>
              <textarea
                id="clarification-input"
                rows={3}
                value={clarifications.get(current.question_number) ?? ""}
                onChange={(e) => handleTextChange(e.target.value)}
                placeholder="Type your answer here..."
                className="w-full rounded-lg border border-border bg-card px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring resize-none"
              />
            </div>
          </motion.div>
        </AnimatePresence>

        <DialogFooter>
          <Button variant="ghost" onClick={onSkip} className="cursor-pointer">
            Skip All
          </Button>
          <Button onClick={handleNext} className="cursor-pointer">
            {isLast ? "Finish" : "Next"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
