"use client";

import { BookOpen, Clock, Brain } from "lucide-react";
import { getSubjectMeta } from "@/lib/subject-meta";
import { cn } from "@/lib/utils";

interface ActivityEmptyProps {
  subjectCode: string;
  topicTitle: string;
  blockPhase: string;
  elapsedMinutes: number;
}

export function ActivityEmpty({
  subjectCode,
  topicTitle,
  blockPhase,
  elapsedMinutes,
}: ActivityEmptyProps) {
  const meta = getSubjectMeta(subjectCode);
  const Icon = meta.icon;

  return (
    <div className="flex flex-col items-center justify-center h-full p-8 text-center">
      <div
        className={cn(
          "w-16 h-16 rounded-2xl flex items-center justify-center bg-gradient-to-br mb-4",
          meta.gradient,
        )}
      >
        <Icon className={cn("w-8 h-8", meta.accent)} />
      </div>

      <h3 className="text-lg font-heading font-semibold text-foreground mb-1">
        {topicTitle}
      </h3>

      <p className="text-sm text-muted-foreground mb-6 capitalize">
        {blockPhase === "intro" ? "Getting started" : blockPhase}
      </p>

      <div className="flex items-center gap-6 text-muted-foreground">
        <div className="flex items-center gap-1.5">
          <Clock className="w-3.5 h-3.5" />
          <span className="text-xs tabular-nums">{elapsedMinutes}m</span>
        </div>
        <div className="flex items-center gap-1.5">
          <Brain className="w-3.5 h-3.5" />
          <span className="text-xs">Focus mode</span>
        </div>
        <div className="flex items-center gap-1.5">
          <BookOpen className="w-3.5 h-3.5" />
          <span className="text-xs">Guided session</span>
        </div>
      </div>
    </div>
  );
}
