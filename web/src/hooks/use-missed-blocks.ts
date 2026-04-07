"use client";

import { useMemo, useCallback, useRef, useSyncExternalStore } from "react";
import { NON_STUDY_SUBJECTS, getBlockTimeStatus } from "@/lib/block-time";
import type { StudyPlanEntry } from "@/lib/types";

const SNOOZE_KEY = "snoozed-blocks";
const SNOOZE_DURATION_MS = 30 * 60 * 1000; // 30 minutes

/** Read snoozed map from localStorage, pruning expired entries */
function readSnoozed(): Map<string, number> {
  try {
    const raw = localStorage.getItem(SNOOZE_KEY);
    if (!raw) return new Map();
    const parsed = JSON.parse(raw) as Record<string, number>;
    const now = Date.now();
    const map = new Map<string, number>();
    for (const [id, until] of Object.entries(parsed)) {
      if (until > now) map.set(id, until);
    }
    return map;
  } catch {
    return new Map();
  }
}

function writeSnoozed(map: Map<string, number>): void {
  const obj: Record<string, number> = {};
  for (const [id, until] of map) obj[id] = until;
  localStorage.setItem(SNOOZE_KEY, JSON.stringify(obj));
}

// Simple external store for snooze state so React re-renders on changes
let snoozedVersion = 0;
const listeners = new Set<() => void>();

function subscribe(cb: () => void) {
  listeners.add(cb);
  return () => listeners.delete(cb);
}

function getSnapshot() {
  return snoozedVersion;
}

function notifySnoozed() {
  snoozedVersion++;
  for (const cb of listeners) cb();
}

export function useMissedBlocks(blocks: StudyPlanEntry[], now: Date) {
  // Subscribe to snooze changes
  useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
  const snoozedRef = useRef<Map<string, number>>(new Map());
  snoozedRef.current = readSnoozed();

  const missedBlocks = useMemo(() => {
    const nowMs = now.getTime();
    return blocks.filter((b) => {
      if (b.status !== "pending") return false;
      if (NON_STUDY_SUBJECTS.has(b.subject_code)) return false;
      if (getBlockTimeStatus(b, now).kind !== "finished") return false;
      const snoozedUntil = snoozedRef.current.get(b.id);
      if (snoozedUntil && snoozedUntil > nowMs) return false;
      return true;
    });
  }, [blocks, now]);

  const currentMissed = missedBlocks[0] ?? null;

  const snooze = useCallback((blockId: string) => {
    const map = readSnoozed();
    map.set(blockId, Date.now() + SNOOZE_DURATION_MS);
    writeSnoozed(map);
    notifySnoozed();
  }, []);

  return { missedBlocks, currentMissed, snooze };
}
