"use client";

import { Clock, BookOpen } from "lucide-react";
import { getSubjectMeta } from "@/lib/subject-meta";
import { cn } from "@/lib/utils";

interface SessionHeaderProps {
  subjectCode: string;
  topicTitle: string;
  blockIndex: number;
  totalBlocks: number;
  elapsedMinutes: number;
}

export function SessionHeader({
  subjectCode,
  topicTitle,
  blockIndex,
  totalBlocks,
  elapsedMinutes,
}: SessionHeaderProps) {
  const meta = getSubjectMeta(subjectCode);
  const Icon = meta.icon;

  return (
    <div className="flex items-center justify-between px-4 py-2 border-b border-border/50 bg-card/50 rounded-t-xl">
      <div className="flex items-center gap-3">
        <div
          className={cn(
            "w-7 h-7 rounded-lg flex items-center justify-center bg-gradient-to-br",
            meta.gradient,
          )}
        >
          <Icon className={cn("w-3.5 h-3.5", meta.accent)} />
        </div>
        <div>
          <p className="text-sm font-medium text-foreground leading-tight">
            {topicTitle}
          </p>
          <p className="text-[11px] text-muted-foreground">
            Block {blockIndex + 1} of {totalBlocks}
          </p>
        </div>
      </div>

      <div className="flex items-center gap-4">
        <div className="flex items-center gap-1.5 text-muted-foreground">
          <Clock className="w-3.5 h-3.5" />
          <span className="text-xs tabular-nums">{elapsedMinutes}m</span>
        </div>

        {/* Block progress dots */}
        <div className="flex items-center gap-1">
          {Array.from({ length: totalBlocks }).map((_, i) => (
            <div
              key={i}
              className={cn(
                "w-2 h-2 rounded-full transition-colors",
                i < blockIndex
                  ? "bg-primary"
                  : i === blockIndex
                    ? "bg-primary/60 animate-pulse"
                    : "bg-muted",
              )}
            />
          ))}
        </div>
      </div>
    </div>
  );
}
