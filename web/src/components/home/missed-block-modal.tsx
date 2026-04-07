"use client";

import { useState } from "react";
import { CheckCircle, Play, CalendarClock, Clock, ChevronRight, ArrowRight } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import { getSubjectMeta } from "@/lib/subject-meta";
import type { StudyPlanEntry } from "@/lib/types";

export type MissedBlockAction =
  | { type: "done" }
  | { type: "start_now" }
  | { type: "snooze" }
  | { type: "reschedule"; date: string };

interface MissedBlockModalProps {
  block: StudyPlanEntry | null;
  onAction: (action: MissedBlockAction) => void;
  onClose: () => void;
}

function getTodayStr(): string {
  return new Date().toLocaleDateString("en-CA", { timeZone: "Europe/Lisbon" });
}

function getTomorrowStr(): string {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  return d.toLocaleDateString("en-CA", { timeZone: "Europe/Lisbon" });
}

function getLaterTodayTime(): string {
  const d = new Date();
  d.setHours(d.getHours() + 2, 0, 0, 0);
  return `${String(d.getHours()).padStart(2, "0")}:00`;
}

export function MissedBlockModal({ block, onAction, onClose }: MissedBlockModalProps) {
  const [showReschedule, setShowReschedule] = useState(false);
  const [customDate, setCustomDate] = useState("");

  if (!block) return null;

  const meta = getSubjectMeta(block.subject_code);

  return (
    <Dialog
      open={!!block}
      onOpenChange={(isOpen) => {
        if (!isOpen) onClose();
      }}
    >
      <DialogContent className="sm:max-w-md" showCloseButton>
        <DialogHeader>
          <DialogTitle className="font-heading text-lg">
            Block ended
          </DialogTitle>
        </DialogHeader>

        {/* Block info */}
        <div className="flex items-center gap-3 rounded-xl bg-muted/50 p-3 mt-1">
          <div className={cn("w-9 h-9 rounded-lg flex items-center justify-center bg-gradient-to-br shrink-0", meta.gradient)}>
            <meta.icon className={cn("w-4 h-4", meta.accent)} />
          </div>
          <div className="min-w-0">
            <p className="text-sm font-medium text-foreground truncate">{block.title}</p>
            {block.start_time && block.end_time && (
              <p className="text-xs text-muted-foreground">
                Was scheduled for {block.start_time.slice(0, 5)} – {block.end_time.slice(0, 5)}
              </p>
            )}
          </div>
        </div>

        {!showReschedule ? (
          /* Main actions */
          <div className="grid grid-cols-2 gap-3 pt-2">
            <button
              onClick={() => onAction({ type: "done" })}
              className={cn(
                "flex flex-col items-center gap-2.5 rounded-2xl bg-card p-5",
                "border border-border transition-all duration-200 cursor-pointer",
                "hover:bg-secondary hover:border-emerald-500/40 active:scale-95"
              )}
            >
              <div className="w-11 h-11 rounded-xl flex items-center justify-center bg-emerald-500/10">
                <CheckCircle className="w-5 h-5 text-emerald-400" />
              </div>
              <span className="text-sm font-medium text-foreground">Mark done</span>
            </button>

            <button
              onClick={() => onAction({ type: "start_now" })}
              className={cn(
                "flex flex-col items-center gap-2.5 rounded-2xl bg-card p-5",
                "border border-border transition-all duration-200 cursor-pointer",
                "hover:bg-secondary hover:border-blue-500/40 active:scale-95"
              )}
            >
              <div className="w-11 h-11 rounded-xl flex items-center justify-center bg-blue-500/10">
                <Play className="w-5 h-5 text-blue-400" />
              </div>
              <span className="text-sm font-medium text-foreground">Start now</span>
            </button>

            <button
              onClick={() => setShowReschedule(true)}
              className={cn(
                "flex flex-col items-center gap-2.5 rounded-2xl bg-card p-5",
                "border border-border transition-all duration-200 cursor-pointer",
                "hover:bg-secondary hover:border-amber-500/40 active:scale-95"
              )}
            >
              <div className="w-11 h-11 rounded-xl flex items-center justify-center bg-amber-500/10">
                <CalendarClock className="w-5 h-5 text-amber-400" />
              </div>
              <span className="text-sm font-medium text-foreground">Reschedule</span>
            </button>

            <button
              onClick={() => onAction({ type: "snooze" })}
              className={cn(
                "flex flex-col items-center gap-2.5 rounded-2xl bg-card p-5",
                "border border-border transition-all duration-200 cursor-pointer",
                "hover:bg-secondary hover:border-gray-500/40 active:scale-95"
              )}
            >
              <div className="w-11 h-11 rounded-xl flex items-center justify-center bg-gray-500/10">
                <Clock className="w-5 h-5 text-gray-400" />
              </div>
              <span className="text-sm font-medium text-foreground">Snooze 30m</span>
            </button>
          </div>
        ) : (
          /* Reschedule sub-options */
          <div className="space-y-2 pt-2">
            <button
              onClick={() => onAction({ type: "reschedule", date: getTodayStr() })}
              className={cn(
                "flex items-center justify-between w-full rounded-xl bg-card border border-border p-4",
                "transition-all duration-200 cursor-pointer hover:bg-secondary hover:border-amber-500/30 active:scale-[0.99]"
              )}
            >
              <div className="flex items-center gap-3">
                <Clock className="w-4 h-4 text-amber-400" />
                <div className="text-left">
                  <p className="text-sm font-medium text-foreground">Later today</p>
                  <p className="text-xs text-muted-foreground">Around {getLaterTodayTime()}</p>
                </div>
              </div>
              <ChevronRight className="w-4 h-4 text-muted-foreground" />
            </button>

            <button
              onClick={() => onAction({ type: "reschedule", date: getTomorrowStr() })}
              className={cn(
                "flex items-center justify-between w-full rounded-xl bg-card border border-border p-4",
                "transition-all duration-200 cursor-pointer hover:bg-secondary hover:border-amber-500/30 active:scale-[0.99]"
              )}
            >
              <div className="flex items-center gap-3">
                <ArrowRight className="w-4 h-4 text-amber-400" />
                <div className="text-left">
                  <p className="text-sm font-medium text-foreground">Tomorrow</p>
                  <p className="text-xs text-muted-foreground">{getTomorrowStr()}</p>
                </div>
              </div>
              <ChevronRight className="w-4 h-4 text-muted-foreground" />
            </button>

            <div className="flex items-center gap-2">
              <input
                type="date"
                value={customDate}
                onChange={(e) => setCustomDate(e.target.value)}
                min={getTodayStr()}
                className="flex-1 rounded-xl bg-card border border-border px-4 py-3 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/30"
              />
              <button
                onClick={() => {
                  if (customDate) onAction({ type: "reschedule", date: customDate });
                }}
                disabled={!customDate}
                className={cn(
                  "rounded-xl px-4 py-3 text-sm font-medium transition-all",
                  customDate
                    ? "bg-amber-500 text-white hover:bg-amber-600 cursor-pointer"
                    : "bg-muted text-muted-foreground cursor-not-allowed"
                )}
              >
                Go
              </button>
            </div>

            <button
              onClick={() => setShowReschedule(false)}
              className="w-full text-center text-xs text-muted-foreground hover:text-foreground transition-colors py-2 cursor-pointer"
            >
              Back
            </button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
