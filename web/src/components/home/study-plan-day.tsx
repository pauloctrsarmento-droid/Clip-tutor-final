"use client";

import { useEffect, useState } from "react";
import { CheckCircle, SkipForward, AlertTriangle, BookOpen, Clock, Bell, BellOff, Play } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { getSubjectMeta } from "@/lib/subject-meta";
import { useNotifications } from "@/hooks/use-notifications";
import type { StudyPlanEntry } from "@/lib/types";

const NON_STUDY_SUBJECTS = new Set(["PERSONAL", "ART"]);

interface StudyPlanDayProps {
  blocks: StudyPlanEntry[];
  overdueBlocks: StudyPlanEntry[];
  onStartBlock?: (block: StudyPlanEntry) => void;
}

/** Parse "HH:MM" or "HH:MM:SS" into today's Date */
function timeToDate(timeStr: string): Date {
  const [h, m] = timeStr.split(":").map(Number);
  const d = new Date();
  d.setHours(h ?? 0, m ?? 0, 0, 0);
  return d;
}

type BlockTimeStatus =
  | { kind: "upcoming"; label: string }
  | { kind: "in_progress"; label: string; progress: number }
  | { kind: "finished" }
  | { kind: "no_time" };

function getBlockTimeStatus(block: StudyPlanEntry, now: Date): BlockTimeStatus {
  if (!block.start_time || !block.end_time) return { kind: "no_time" };

  const start = timeToDate(block.start_time);
  const end = timeToDate(block.end_time);
  const nowMs = now.getTime();

  if (nowMs < start.getTime()) {
    const diffMs = start.getTime() - nowMs;
    const diffMin = Math.ceil(diffMs / 60000);
    if (diffMin < 60) {
      return { kind: "upcoming", label: `in ${diffMin}m` };
    }
    const hours = Math.floor(diffMin / 60);
    const mins = diffMin % 60;
    return { kind: "upcoming", label: mins > 0 ? `in ${hours}h ${mins}m` : `in ${hours}h` };
  }

  if (nowMs >= start.getTime() && nowMs < end.getTime()) {
    const total = end.getTime() - start.getTime();
    const elapsed = nowMs - start.getTime();
    const remaining = Math.ceil((end.getTime() - nowMs) / 60000);
    const progress = Math.min(100, (elapsed / total) * 100);
    const label = remaining < 60
      ? `${remaining}m left`
      : `${Math.floor(remaining / 60)}h ${remaining % 60}m left`;
    return { kind: "in_progress", label, progress };
  }

  return { kind: "finished" };
}

function useNow(intervalMs = 15000): Date {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), intervalMs);
    return () => clearInterval(id);
  }, [intervalMs]);
  return now;
}

function BlockCard({
  block,
  isFirstPending,
  now,
  onStart,
}: {
  block: StudyPlanEntry;
  isFirstPending: boolean;
  now: Date;
  onStart?: () => void;
}) {
  const meta = getSubjectMeta(block.subject_code);
  const Icon = meta.icon;
  const timeStatus = getBlockTimeStatus(block, now);
  const isActive = timeStatus.kind === "in_progress";

  return (
    <div
      onClick={onStart}
      role={onStart ? "button" : undefined}
      tabIndex={onStart ? 0 : undefined}
      className={cn(
        "relative flex items-center gap-3 rounded-xl bg-card border p-4 transition-all",
        block.status === "done" && "opacity-60 border-border",
        block.status === "skipped" && "opacity-40 border-border",
        block.status === "pending" && !isActive && "border-border",
        block.status === "rescheduled" && "border-border opacity-50",
        isActive && "border-emerald-500/50 bg-emerald-500/5",
        isFirstPending && !isActive && "border-l-4 border-l-primary border-t-border border-r-border border-b-border",
        onStart && "cursor-pointer hover:border-primary/30 hover:bg-primary/5 active:scale-[0.99]"
      )}
    >
      {/* Progress bar for active blocks */}
      {isActive && timeStatus.kind === "in_progress" && (
        <div className="absolute bottom-0 left-0 right-0 h-0.5 rounded-b-xl bg-muted overflow-hidden">
          <div
            className="h-full bg-emerald-500 transition-all duration-1000"
            style={{ width: `${timeStatus.progress}%` }}
          />
        </div>
      )}

      {/* Subject icon */}
      <div
        className={cn(
          "w-10 h-10 rounded-lg flex items-center justify-center shrink-0 bg-gradient-to-br",
          meta.gradient,
          isActive && "ring-2 ring-emerald-500/30"
        )}
      >
        {isActive ? (
          <Play className="w-4 h-4 text-emerald-400 fill-emerald-400" />
        ) : (
          <Icon className={cn("w-5 h-5", meta.accent)} />
        )}
      </div>

      {/* Title + time */}
      <div className="flex-1 min-w-0">
        <p className={cn(
          "text-sm font-medium truncate",
          isActive ? "text-emerald-300" : "text-foreground"
        )}>
          {block.title}
        </p>
        <div className="flex items-center gap-1.5 mt-1">
          <Clock className="w-3 h-3 text-muted-foreground" />
          {block.start_time && block.end_time ? (
            <span className="text-[11px] font-medium text-muted-foreground">
              {block.start_time.slice(0, 5)} – {block.end_time.slice(0, 5)}
            </span>
          ) : (
            <Badge variant="secondary" className="text-[10px] px-1.5 py-0">
              {block.planned_hours}h
            </Badge>
          )}
        </div>
      </div>

      {/* Countdown / Status */}
      <div className="shrink-0 text-right">
        {block.status === "done" ? (
          <Badge variant="default" className="bg-emerald-500/15 text-emerald-400 border-0">
            <CheckCircle className="w-3 h-3 mr-1" />
            Done
          </Badge>
        ) : block.status === "skipped" ? (
          <Badge variant="secondary" className="text-muted-foreground">
            <SkipForward className="w-3 h-3 mr-1" />
            Skipped
          </Badge>
        ) : block.status === "rescheduled" ? (
          <Badge variant="secondary" className="text-muted-foreground">
            Rescheduled
          </Badge>
        ) : timeStatus.kind === "in_progress" ? (
          <div className="flex flex-col items-end gap-0.5">
            <Badge variant="default" className="bg-emerald-500/15 text-emerald-400 border-0 animate-pulse">
              Now
            </Badge>
            <span className="text-[10px] font-medium text-emerald-400/70">
              {timeStatus.label}
            </span>
          </div>
        ) : timeStatus.kind === "upcoming" ? (
          <div className="flex flex-col items-end gap-0.5">
            <span className="text-xs font-semibold text-primary">
              {timeStatus.label}
            </span>
          </div>
        ) : timeStatus.kind === "finished" ? (
          <Badge variant="outline" className="text-muted-foreground/60">
            Ended
          </Badge>
        ) : (
          <Badge variant="outline" className="text-muted-foreground">
            Pending
          </Badge>
        )}
      </div>
    </div>
  );
}

export function StudyPlanDay({ blocks, overdueBlocks, onStartBlock }: StudyPlanDayProps) {
  const firstPendingId = blocks.find((b) => b.status === "pending")?.id;
  const { permission, requestPermission } = useNotifications(blocks);
  const now = useNow();

  return (
    <div className="space-y-4 mt-1">
      {/* Notification permission banner */}
      {permission !== "granted" && blocks.length > 0 && (
        <button
          onClick={requestPermission}
          className="flex items-center gap-2 w-full rounded-xl bg-primary/5 border border-primary/20 px-4 py-2.5 text-left transition-colors hover:bg-primary/10"
        >
          <BellOff className="w-4 h-4 text-primary shrink-0" />
          <span className="text-xs text-primary font-medium">
            Enable notifications to get reminders before each block
          </span>
        </button>
      )}

      {permission === "granted" && blocks.some((b) => b.start_time) && (
        <div className="flex items-center gap-2 px-1">
          <Bell className="w-3 h-3 text-emerald-400" />
          <span className="text-[10px] text-muted-foreground">
            Notifications active — you'll be reminded 5 min before each block
          </span>
        </div>
      )}

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
            <BlockCard key={block.id} block={block} isFirstPending={false} now={now} />
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
          {blocks.map((block) => {
            const isStudyBlock = !NON_STUDY_SUBJECTS.has(block.subject_code) && block.status === "pending";
            return (
              <BlockCard
                key={block.id}
                block={block}
                isFirstPending={block.id === firstPendingId}
                now={now}
                onStart={isStudyBlock && onStartBlock ? () => onStartBlock(block) : undefined}
              />
            );
          })}
        </div>
      )}
    </div>
  );
}
