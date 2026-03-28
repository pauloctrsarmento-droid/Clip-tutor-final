"use client";

import { CheckCircle, SkipForward, AlertTriangle, BookOpen, Clock } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { getSubjectMeta } from "@/lib/subject-meta";
import type { StudyPlanEntry } from "@/lib/types";

interface StudyPlanDayProps {
  blocks: StudyPlanEntry[];
  overdueBlocks: StudyPlanEntry[];
}

function BlockCard({
  block,
  isFirstPending,
}: {
  block: StudyPlanEntry;
  isFirstPending: boolean;
}) {
  const meta = getSubjectMeta(block.subject_code);
  const Icon = meta.icon;

  return (
    <div
      className={cn(
        "flex items-center gap-3 rounded-xl bg-card border p-4 transition-all",
        block.status === "done" && "opacity-60 border-border",
        block.status === "skipped" && "opacity-40 border-border",
        block.status === "pending" && "border-border",
        block.status === "rescheduled" && "border-border opacity-50",
        isFirstPending && "border-l-4 border-l-primary border-t-border border-r-border border-b-border"
      )}
    >
      {/* Subject icon */}
      <div
        className={cn(
          "w-10 h-10 rounded-lg flex items-center justify-center shrink-0 bg-gradient-to-br",
          meta.gradient
        )}
      >
        <Icon className={cn("w-5 h-5", meta.accent)} />
      </div>

      {/* Title + duration */}
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-foreground truncate">
          {block.title}
        </p>
        <div className="flex items-center gap-1.5 mt-1">
          <Clock className="w-3 h-3 text-muted-foreground" />
          <Badge variant="secondary" className="text-[10px] px-1.5 py-0">
            {block.planned_hours}h
          </Badge>
        </div>
      </div>

      {/* Status */}
      <div className="shrink-0">
        {block.status === "done" && (
          <Badge variant="default" className="bg-emerald-500/15 text-emerald-400 border-0">
            <CheckCircle className="w-3 h-3 mr-1" />
            Done
          </Badge>
        )}
        {block.status === "pending" && (
          <Badge variant="outline" className="text-muted-foreground">
            Pending
          </Badge>
        )}
        {block.status === "skipped" && (
          <Badge variant="secondary" className="text-muted-foreground">
            <SkipForward className="w-3 h-3 mr-1" />
            Skipped
          </Badge>
        )}
        {block.status === "rescheduled" && (
          <Badge variant="secondary" className="text-muted-foreground">
            Rescheduled
          </Badge>
        )}
      </div>
    </div>
  );
}

export function StudyPlanDay({ blocks, overdueBlocks }: StudyPlanDayProps) {
  const firstPendingId = blocks.find((b) => b.status === "pending")?.id;

  return (
    <div className="space-y-4 mt-1">
      {/* Overdue section */}
      {overdueBlocks.length > 0 && (
        <div className="rounded-xl bg-amber-500/5 border border-amber-500/20 p-4 space-y-3">
          <div className="flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 text-amber-400" />
            <span className="text-sm font-semibold text-amber-400">
              Overdue blocks
            </span>
            <Badge variant="secondary" className="text-amber-400 bg-amber-500/10 border-0 text-[10px]">
              {overdueBlocks.length}
            </Badge>
          </div>
          {overdueBlocks.map((block) => (
            <BlockCard key={block.id} block={block} isFirstPending={false} />
          ))}
        </div>
      )}

      {/* Today blocks */}
      {blocks.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-10 text-center">
          <div className="w-12 h-12 rounded-xl bg-muted flex items-center justify-center mb-3">
            <BookOpen className="w-6 h-6 text-muted-foreground/60" />
          </div>
          <p className="text-sm font-medium text-muted-foreground">
            No blocks scheduled for today
          </p>
          <p className="text-xs text-muted-foreground/60 mt-1">
            Try some free study!
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          {blocks.map((block) => (
            <BlockCard
              key={block.id}
              block={block}
              isFirstPending={block.id === firstPendingId}
            />
          ))}
        </div>
      )}
    </div>
  );
}
