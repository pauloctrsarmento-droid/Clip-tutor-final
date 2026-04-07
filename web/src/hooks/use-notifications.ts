"use client";

import { useEffect, useRef, useCallback, useState } from "react";
import { timeToDate } from "@/lib/block-time";
import type { StudyPlanEntry } from "@/lib/types";

type Permission = "default" | "granted" | "denied";

function getServiceWorker(): Promise<ServiceWorkerRegistration | null> {
  if (!("serviceWorker" in navigator)) return Promise.resolve(null);
  return navigator.serviceWorker.ready.catch(() => null);
}

async function showNotification(title: string, body: string, tag: string) {
  const sw = await getServiceWorker();
  if (sw) {
    sw.active?.postMessage({ type: "SHOW_NOTIFICATION", title, body, tag });
  } else if ("Notification" in window && Notification.permission === "granted") {
    new Notification(title, { body, tag });
  }
}

export function useNotifications(blocks: StudyPlanEntry[]) {
  const timersRef = useRef<ReturnType<typeof setTimeout>[]>([]);
  const [permission, setPermission] = useState<Permission>("default");

  // Track permission state
  useEffect(() => {
    if ("Notification" in window) {
      setPermission(Notification.permission as Permission);
    }
  }, []);

  const requestPermission = useCallback(async () => {
    if (!("Notification" in window)) return;
    const result = await Notification.requestPermission();
    setPermission(result as Permission);
  }, []);

  // Register service worker once
  useEffect(() => {
    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.register("/sw.js").catch(() => {
        // Service worker registration failed — notifications still work via Notification API
      });
    }
  }, []);

  // Schedule notifications for today's blocks
  useEffect(() => {
    // Clear previous timers
    for (const t of timersRef.current) clearTimeout(t);
    timersRef.current = [];

    if (permission !== "granted") return;

    const now = Date.now();
    const pendingBlocks = blocks.filter(
      (b) => b.status === "pending" && b.start_time && b.end_time
    );

    for (let i = 0; i < pendingBlocks.length; i++) {
      const block = pendingBlocks[i]!;
      const startTime = timeToDate(block.start_time!);
      const endTime = timeToDate(block.end_time!);
      const nextBlock = pendingBlocks[i + 1];

      // 5 minutes before start
      const reminderMs = startTime.getTime() - 5 * 60 * 1000 - now;
      if (reminderMs > 0) {
        const timer = setTimeout(() => {
          showNotification(
            `${block.title} starts in 5 minutes`,
            `${block.start_time!.slice(0, 5)} – ${block.end_time!.slice(0, 5)}`,
            `start-${block.id}`
          );
        }, reminderMs);
        timersRef.current.push(timer);
      }

      // At end time
      const endMs = endTime.getTime() - now;
      if (endMs > 0) {
        const timer = setTimeout(() => {
          const nextMsg = nextBlock
            ? `Next up: ${nextBlock.title} at ${nextBlock.start_time!.slice(0, 5)}`
            : "No more blocks today!";
          showNotification(
            `${block.title} finished`,
            nextMsg,
            `end-${block.id}`
          );
        }, endMs);
        timersRef.current.push(timer);
      }
    }

    return () => {
      for (const t of timersRef.current) clearTimeout(t);
      timersRef.current = [];
    };
  }, [blocks, permission]);

  return { permission, requestPermission };
}
