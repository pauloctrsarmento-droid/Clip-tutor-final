"use client";

import { Target, Settings } from "lucide-react";
import Link from "next/link";
import { motion } from "framer-motion";
import { cn } from "@/lib/utils";
import { LiveClock } from "@/components/home/live-clock";
import type { StudyPlanEntry, DashboardOverview, SubjectMastery } from "@/lib/types";
import { STUDY_SUBJECTS } from "@/lib/constants";

interface HomeHeaderProps {
  overview: DashboardOverview;
  todayBlocks: StudyPlanEntry[];
  subjects: SubjectMastery[];
}

function getGreeting(): string {
  const hour = new Date().getHours();
  if (hour < 12) return "Good morning";
  if (hour < 18) return "Good afternoon";
  return "Good evening";
}

export function HomeHeader({ overview, todayBlocks, subjects }: HomeHeaderProps) {
  const totalFacts = subjects
    .filter((s) => STUDY_SUBJECTS.includes(s.subject_code))
    .reduce((sum, s) => sum + s.total_facts, 0);
  const masteredFacts = subjects
    .filter((s) => STUDY_SUBJECTS.includes(s.subject_code))
    .reduce((sum, s) => sum + s.mastered_facts, 0);

  const greeting = getGreeting();
  const blockCount = todayBlocks.length;

  return (
    <motion.div
      initial={{ opacity: 0, y: -8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4 }}
      className="flex items-center justify-between"
    >
      {/* Left: greeting */}
      <div>
        <h1 className="font-heading text-xl sm:text-2xl font-bold text-foreground">
          {greeting}, Luísa
        </h1>
        <p className="text-sm text-muted-foreground mt-0.5">
          {blockCount > 0
            ? `You have ${blockCount} study block${blockCount > 1 ? "s" : ""} today`
            : "Free day today!"}
        </p>
      </div>

      {/* Center: daily meta circles (only show when there are blocks) */}
      {todayBlocks.length > 0 && (
        <div className="hidden md:flex items-center gap-2">
          {todayBlocks.map((block) => (
            <div
              key={block.id}
              className={cn(
                "w-3 h-3 rounded-full transition-all duration-300",
                block.status === "done"
                  ? "bg-emerald-500 shadow-sm shadow-emerald-500/40"
                  : "border-2 border-muted-foreground/30 bg-transparent"
              )}
            />
          ))}
        </div>
      )}

      {/* Right: clock + mastery counter + settings */}
      <div className="flex items-center gap-3">
        <LiveClock />
        <div className="flex items-center gap-2 rounded-xl bg-card border border-border px-3 py-1.5">
          <Target className="w-4 h-4 text-emerald-400" />
          <span className="text-sm font-medium text-foreground">
            {masteredFacts}
            <span className="text-muted-foreground">/{totalFacts}</span>
          </span>
          <span className="text-xs text-muted-foreground hidden sm:inline">
            mastered
          </span>
        </div>
        <Link
          href="/"
          className="p-2 rounded-lg hover:bg-muted transition-colors cursor-pointer"
        >
          <Settings className="w-4 h-4 text-muted-foreground" />
        </Link>
      </div>
    </motion.div>
  );
}
