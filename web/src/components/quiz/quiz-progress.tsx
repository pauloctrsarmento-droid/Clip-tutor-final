"use client";

import { motion } from "framer-motion";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { Timer } from "lucide-react";

interface QuizProgressProps {
  current: number;
  total: number;
  marksEarned: number;
  marksAvailable: number;
  elapsedSeconds: number;
  subjectName: string;
  topicName?: string;
  accentClass: string;
}

export function QuizProgress({
  current,
  total,
  marksEarned,
  marksAvailable,
  elapsedSeconds,
  subjectName,
  topicName,
  accentClass,
}: QuizProgressProps) {
  const progress = total > 0 ? (current / total) * 100 : 0;
  const minutes = Math.floor(elapsedSeconds / 60);
  const seconds = elapsedSeconds % 60;

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className={cn("w-2 h-2 rounded-full", accentClass.replace("text-", "bg-"))} />
          <span className="text-sm font-medium">{subjectName}</span>
          {topicName && (
            <span className="text-xs text-muted-foreground">/ {topicName}</span>
          )}
        </div>
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <Timer className="w-3.5 h-3.5" />
            <span className="tabular-nums">{minutes}:{seconds.toString().padStart(2, "0")}</span>
          </div>
          <Badge variant="secondary" className="tabular-nums text-xs">
            {marksEarned}/{marksAvailable} marks
          </Badge>
        </div>
      </div>

      <div className="flex items-center gap-3">
        <div className="flex-1 h-1.5 rounded-full bg-muted overflow-hidden">
          <motion.div
            className="h-full rounded-full bg-primary"
            animate={{ width: `${progress}%` }}
            transition={{ duration: 0.5, ease: "easeOut" }}
          />
        </div>
        <span className="text-xs text-muted-foreground tabular-nums shrink-0">
          {current}/{total}
        </span>
      </div>
    </div>
  );
}
