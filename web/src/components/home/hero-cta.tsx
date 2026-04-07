"use client";

import { Play, CheckCircle, Flame, CalendarClock, BarChart3, Brain, Target, FileText } from "lucide-react";
import { motion } from "framer-motion";
import Link from "next/link";
import { cn } from "@/lib/utils";
import { getSubjectMeta } from "@/lib/subject-meta";
import { NON_STUDY_SUBJECTS, getBlockTimeStatus, useNow } from "@/lib/block-time";
import type { StudyPlanEntry, DashboardOverview, ExamCalendarEntry } from "@/lib/types";

/** Map subject codes to display names (short) */
const SUBJECT_NAMES: Record<string, string> = {
  "0620": "Chemistry",
  "0625": "Physics",
  "0610": "Biology",
  "0478": "CS",
  "0520": "French",
  "0504": "Portuguese",
  "0475": "Eng. Lit",
  "0500": "English",
  ART: "Art",
  PERSONAL: "Personal",
};

interface HeroCtaProps {
  blocks: StudyPlanEntry[];
  overview: DashboardOverview;
  exams: ExamCalendarEntry[];
  onStartSession: () => void;
  onStartBlock?: (block: StudyPlanEntry) => void;
  pausedSessionId?: string | null;
  onResumeSession?: () => void;
}

export function HeroCta({ blocks, overview, exams, onStartSession, onStartBlock, pausedSessionId, onResumeSession }: HeroCtaProps) {
  const now = useNow();
  const studyBlocks = blocks.filter((b) => !NON_STUDY_SUBJECTS.has(b.subject_code));
  const totalHours = studyBlocks.reduce((sum, b) => sum + b.planned_hours, 0);

  // Time-aware block selection: in_progress > upcoming > no_time
  const activeBlock = studyBlocks.find(
    (b) => b.status === "pending" && getBlockTimeStatus(b, now).kind === "in_progress"
  );
  const upcomingBlock = studyBlocks.find(
    (b) => b.status === "pending" && getBlockTimeStatus(b, now).kind === "upcoming"
  );
  const noTimeBlock = studyBlocks.find(
    (b) => b.status === "pending" && getBlockTimeStatus(b, now).kind === "no_time"
  );
  const nextBlock = activeBlock ?? upcomingBlock ?? noTimeBlock;

  // All blocks are done or missed (finished + pending = missed, not actionable)
  const actionableBlocks = studyBlocks.filter((b) => {
    if (b.status !== "pending") return false;
    const ts = getBlockTimeStatus(b, now).kind;
    return ts !== "finished"; // exclude missed blocks from "actionable"
  });
  const allDone = studyBlocks.length > 0 && studyBlocks.every((b) => b.status === "done");
  const allFinished = studyBlocks.length > 0 && !allDone && actionableBlocks.length === 0;
  const noBlocks = studyBlocks.length === 0;

  // Remaining actionable blocks for "Up next" tags (exclude missed)
  const pendingStudyBlocks = studyBlocks.filter((b) => {
    if (b.status !== "pending") return false;
    const ts = getBlockTimeStatus(b, now).kind;
    return ts !== "finished";
  });

  if (allDone) {
    return (
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, delay: 0.1 }}
        className="rounded-2xl bg-gradient-to-br from-emerald-500/10 via-emerald-500/5 to-transparent border border-emerald-500/20 p-8 text-center"
      >
        <div className="flex flex-col items-center gap-3">
          <div className="w-14 h-14 rounded-2xl bg-emerald-500/15 flex items-center justify-center">
            <CheckCircle className="w-7 h-7 text-emerald-400" />
          </div>
          <div>
            <p className="font-heading text-xl font-bold text-emerald-400">
              Day complete!
            </p>
            <p className="text-sm text-emerald-400/60 mt-1">
              Rest up, we continue tomorrow.
            </p>
          </div>
        </div>
      </motion.div>
    );
  }

  if (allFinished) {
    return (
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, delay: 0.1 }}
        className="rounded-2xl bg-card border border-border p-5 space-y-4"
      >
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-muted flex items-center justify-center">
            <CalendarClock className="w-5 h-5 text-muted-foreground" />
          </div>
          <div>
            <p className="text-sm font-semibold text-foreground">
              No more blocks today
            </p>
            <p className="text-xs text-muted-foreground">
              All scheduled blocks have ended — try some free study
            </p>
          </div>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          {[
            { href: "/study/flashcards", icon: Brain, label: "Flashcards", sub: "Practice facts", gradient: "from-violet-500/20 to-fuchsia-500/20" },
            { href: "/study/quiz", icon: Target, label: "Quick Quiz", sub: "Exam questions", gradient: "from-amber-500/20 to-orange-500/20" },
            { href: "/study/exam", icon: FileText, label: "Exam Practice", sub: "Full paper", gradient: "from-emerald-500/20 to-teal-500/20" },
          ].map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "flex items-center gap-3 rounded-xl border border-border p-3",
                "hover:border-primary/30 hover:shadow-lg hover:shadow-primary/5",
                "transition-all duration-200 cursor-pointer group"
              )}
            >
              <div className={cn("w-9 h-9 rounded-lg bg-gradient-to-br flex items-center justify-center shrink-0", item.gradient)}>
                <item.icon className="w-4.5 h-4.5 text-foreground" />
              </div>
              <div>
                <p className="text-sm font-semibold text-foreground">{item.label}</p>
                <p className="text-xs text-muted-foreground">{item.sub}</p>
              </div>
            </Link>
          ))}
        </div>
      </motion.div>
    );
  }

  if (noBlocks) {
    const nextExam = exams.find((e) => (e.days_remaining ?? 0) > 0);
    const nextSubject = nextExam ? (SUBJECT_NAMES[nextExam.subject_code] ?? nextExam.subject_code) : null;

    return (
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, delay: 0.1 }}
        className="rounded-2xl bg-card border border-border p-5 space-y-4"
      >
        {/* Stats row */}
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-2 rounded-xl bg-muted/50 px-3 py-2">
            <Flame className={cn("w-4 h-4", overview.streak > 0 ? "text-amber-400" : "text-muted-foreground/40")} />
            <span className="text-sm font-medium text-foreground">
              {overview.streak > 0 ? `${overview.streak} day streak` : "Start a streak!"}
            </span>
          </div>

          {nextExam && (
            <div className="flex items-center gap-2 rounded-xl bg-muted/50 px-3 py-2">
              <CalendarClock className="w-4 h-4 text-primary" />
              <span className="text-sm text-foreground">
                Next: <span className="font-medium">{nextSubject}</span> in{" "}
                <span className="font-semibold">{nextExam.days_remaining} days</span>
              </span>
            </div>
          )}

          {overview.total_attempts > 0 && (
            <div className="flex items-center gap-2 rounded-xl bg-muted/50 px-3 py-2">
              <BarChart3 className="w-4 h-4 text-emerald-400" />
              <span className="text-sm text-foreground">
                {overview.total_attempts} questions answered
              </span>
            </div>
          )}
        </div>

        {/* Free study buttons */}
        <div>
          <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground mb-3">
            Free study
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            {[
              { href: "/study/flashcards", icon: Brain, label: "Flashcards", sub: "Practice facts", gradient: "from-violet-500/20 to-fuchsia-500/20" },
              { href: "/study/quiz", icon: Target, label: "Quick Quiz", sub: "Exam questions", gradient: "from-amber-500/20 to-orange-500/20" },
              { href: "/study/exam", icon: FileText, label: "Exam Practice", sub: "Full paper", gradient: "from-emerald-500/20 to-teal-500/20" },
            ].map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  "flex items-center gap-3 rounded-xl border border-border p-3",
                  "hover:border-primary/30 hover:shadow-lg hover:shadow-primary/5",
                  "transition-all duration-200 cursor-pointer group"
                )}
              >
                <div className={cn("w-9 h-9 rounded-lg bg-gradient-to-br flex items-center justify-center shrink-0", item.gradient)}>
                  <item.icon className="w-4.5 h-4.5 text-foreground" />
                </div>
                <div>
                  <p className="text-sm font-semibold text-foreground">{item.label}</p>
                  <p className="text-xs text-muted-foreground">{item.sub}</p>
                </div>
              </Link>
            ))}
          </div>
        </div>
      </motion.div>
    );
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, delay: 0.1 }}
      className="space-y-2"
    >
      {/* Resume paused session */}
      {pausedSessionId && onResumeSession && (
        <button
          onClick={onResumeSession}
          className={cn(
            "w-full rounded-2xl bg-gradient-to-r from-amber-500 to-amber-600",
            "p-4 text-left transition-all duration-200 mb-2",
            "hover:shadow-xl hover:shadow-amber-500/20 hover:scale-[1.01]",
            "active:scale-[0.99] cursor-pointer group"
          )}
        >
          <div className="flex items-center justify-between">
            <div>
              <span className="font-heading text-xl sm:text-2xl font-bold text-white">
                Continue session
              </span>
              <p className="text-amber-100/70 text-sm mt-1">
                Pick up where you left off
              </p>
            </div>
            <div className="w-11 h-11 rounded-2xl bg-white/20 flex items-center justify-center group-hover:bg-white/30 transition-colors">
              <Play className="w-6 h-6 text-white fill-white" />
            </div>
          </div>
        </button>
      )}

      {/* Main CTA button — time-aware block selection */}
      <button
        onClick={onStartSession}
        className={cn(
          "w-full rounded-2xl p-4 text-left transition-all duration-200",
          "active:scale-[0.99] cursor-pointer group",
          activeBlock
            ? "bg-gradient-to-r from-amber-500 to-amber-600 hover:shadow-xl hover:shadow-amber-500/20 hover:scale-[1.01]"
            : "bg-gradient-to-r from-emerald-500 to-emerald-600 hover:shadow-xl hover:shadow-emerald-500/20 hover:scale-[1.01]"
        )}
      >
        <div className="flex items-center justify-between">
          <div>
            <span className="font-heading text-xl sm:text-2xl font-bold text-white">
              {pausedSessionId
                ? "Continue session"
                : activeBlock
                  ? `Continue: ${activeBlock.title}`
                  : upcomingBlock
                    ? `Next: ${upcomingBlock.title}`
                    : nextBlock
                      ? `Start: ${nextBlock.title}`
                      : "Start study session"}
            </span>
            <p className={cn("text-sm mt-1", activeBlock ? "text-amber-100/70" : "text-emerald-100/70")}>
              {activeBlock
                ? (() => {
                    const ts = getBlockTimeStatus(activeBlock, now);
                    return ts.kind === "in_progress"
                      ? `${activeBlock.start_time!.slice(0, 5)} – ${activeBlock.end_time!.slice(0, 5)} · ${ts.label}`
                      : `${activeBlock.planned_hours}h`;
                  })()
                : upcomingBlock
                  ? (() => {
                      const ts = getBlockTimeStatus(upcomingBlock, now);
                      return ts.kind === "upcoming"
                        ? `Starts ${ts.label} · ${upcomingBlock.start_time!.slice(0, 5)} – ${upcomingBlock.end_time!.slice(0, 5)}`
                        : `${upcomingBlock.planned_hours}h`;
                    })()
                  : nextBlock?.start_time && nextBlock?.end_time
                    ? `${nextBlock.start_time.slice(0, 5)} – ${nextBlock.end_time.slice(0, 5)} · ${nextBlock.planned_hours}h`
                    : `~${totalHours}h of planned study`}
            </p>
          </div>
          <div className="w-11 h-11 rounded-2xl bg-white/20 flex items-center justify-center group-hover:bg-white/30 transition-colors">
            <Play className="w-6 h-6 text-white fill-white" />
          </div>
        </div>
      </button>

      {/* Remaining actionable study blocks */}
      {pendingStudyBlocks.length > 1 && (
        <div className="flex flex-wrap items-center gap-2 px-1">
          <span className="text-[10px] text-muted-foreground/60 mr-1">Up next:</span>
          {pendingStudyBlocks.filter((b) => b.id !== nextBlock?.id).map((block) => {
            const meta = getSubjectMeta(block.subject_code);
            const name = SUBJECT_NAMES[block.subject_code] ?? block.subject_code;
            const isPastPaper = block.title.toLowerCase().includes("past paper");
            const Tag = isPastPaper ? "button" : "span";
            return (
              <Tag
                key={block.id}
                onClick={isPastPaper ? () => onStartBlock?.(block) : undefined}
                className={cn(
                  "inline-flex items-center gap-1.5 rounded-full bg-card border border-border px-3 py-1 text-xs text-muted-foreground",
                  isPastPaper && "cursor-pointer hover:border-primary/30 hover:bg-primary/5 transition-colors"
                )}
              >
                <span
                  className={cn("w-2 h-2 rounded-full bg-gradient-to-br", meta.gradient)}
                  style={{ opacity: 1 }}
                />
                <span className="font-medium text-foreground">{name}</span>
                <span className="text-muted-foreground/60">{block.title}</span>
              </Tag>
            );
          })}
        </div>
      )}
    </motion.div>
  );
}
