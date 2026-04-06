"use client";

import { useEffect, useState } from "react";
import { Clock } from "lucide-react";

export function LiveClock() {
  const [now, setNow] = useState<Date | null>(null);

  useEffect(() => {
    setNow(new Date());
    const interval = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(interval);
  }, []);

  if (!now) return null;

  const time = now.toLocaleTimeString("en-GB", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });

  const date = now.toLocaleDateString("en-GB", {
    weekday: "short",
    day: "numeric",
    month: "short",
  });

  return (
    <div className="flex items-center gap-2 rounded-xl bg-card border border-border px-3 py-1.5">
      <Clock className="w-4 h-4 text-primary" />
      <div className="flex flex-col items-end">
        <span className="text-sm font-mono font-bold text-foreground tabular-nums leading-tight">
          {time}
        </span>
        <span className="text-[10px] text-muted-foreground leading-tight">
          {date}
        </span>
      </div>
    </div>
  );
}
