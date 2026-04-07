"use client";

import { useEffect, useState } from "react";
import type { StudyPlanEntry } from "@/lib/types";

export const NON_STUDY_SUBJECTS = new Set(["PERSONAL", "ART"]);

/** Parse "HH:MM" or "HH:MM:SS" into today's Date */
export function timeToDate(timeStr: string): Date {
  const [h, m] = timeStr.split(":").map(Number);
  const d = new Date();
  d.setHours(h ?? 0, m ?? 0, 0, 0);
  return d;
}

export type BlockTimeStatus =
  | { kind: "upcoming"; label: string }
  | { kind: "in_progress"; label: string; progress: number }
  | { kind: "finished" }
  | { kind: "no_time" };

export function getBlockTimeStatus(block: StudyPlanEntry, now: Date): BlockTimeStatus {
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

/** Returns true when a study block's time has passed but status is still pending */
export function isMissedStudyBlock(block: StudyPlanEntry, now: Date): boolean {
  return (
    block.status === "pending" &&
    !NON_STUDY_SUBJECTS.has(block.subject_code) &&
    getBlockTimeStatus(block, now).kind === "finished"
  );
}

/** Reactive clock that updates every `intervalMs` (default 15s) */
export function useNow(intervalMs = 15000): Date {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), intervalMs);
    return () => clearInterval(id);
  }, [intervalMs]);
  return now;
}
