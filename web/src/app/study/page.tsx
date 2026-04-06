"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import { AlertCircle } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { fetchHomeData } from "@/lib/api";
import { HomeHeader } from "@/components/home/header";
import { HeroCta } from "@/components/home/hero-cta";
import { MoodCheck } from "@/components/home/mood-check";
import { ExamTimeline } from "@/components/home/exam-timeline";
import { StudyPlan } from "@/components/home/study-plan";
import { MasteryGrid } from "@/components/home/mastery-grid";
import { FreeStudy } from "@/components/home/free-study";
import { WeeklySummary } from "@/components/home/weekly-summary";
import type {
  DashboardOverview,
  SubjectMastery,
  StudyPlanEntry,
  ExamCalendarEntry,
} from "@/lib/types";

interface HomeData {
  overview: DashboardOverview;
  subjects: SubjectMastery[];
  today: { today: StudyPlanEntry[]; overdue: StudyPlanEntry[] };
  exams: ExamCalendarEntry[];
}

function LoadingSkeleton() {
  return (
    <div className="space-y-5">
      {/* Header skeleton */}
      <div className="flex items-center justify-between">
        <div className="space-y-2">
          <Skeleton className="h-9 w-48" />
          <Skeleton className="h-4 w-64" />
        </div>
        <Skeleton className="h-9 w-52 rounded-xl" />
      </div>

      {/* CTA skeleton */}
      <Skeleton className="h-24 w-full rounded-2xl" />

      {/* Timeline skeleton */}
      <Skeleton className="h-28 w-full rounded-2xl" />

      {/* Three column skeleton */}
      <div className="grid grid-cols-1 lg:grid-cols-[5fr_4fr_3fr] gap-5">
        <Skeleton className="h-72 rounded-2xl" />
        <Skeleton className="h-56 rounded-2xl" />
        <Skeleton className="h-40 rounded-2xl" />
      </div>
    </div>
  );
}

function ErrorState({ message }: { message: string }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      className="flex flex-col items-center justify-center py-20 text-center"
    >
      <div className="w-14 h-14 rounded-2xl bg-red-500/10 flex items-center justify-center mb-4">
        <AlertCircle className="w-7 h-7 text-red-400" />
      </div>
      <h2 className="font-heading text-lg font-bold text-foreground mb-1">
        Something went wrong
      </h2>
      <p className="text-sm text-muted-foreground max-w-md">
        {message}
      </p>
    </motion.div>
  );
}

export default function StudyHomePage() {
  const router = useRouter();
  const [data, setData] = useState<HomeData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showMoodCheck, setShowMoodCheck] = useState(false);

  useEffect(() => {
    let cancelled = false;
    fetchHomeData()
      .then((result) => {
        if (!cancelled) setData(result);
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          const message = err instanceof Error ? err.message : "Unknown error";
          setError(message);
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  if (loading) {
    return <LoadingSkeleton />;
  }

  if (error || !data) {
    return (
      <ErrorState
        message={error ?? "Could not load data. Please try again."}
      />
    );
  }

  const { overview, subjects, today, exams } = data;
  const hasBlocks = today.today.length > 0;

  const startBlock = useCallback((block: StudyPlanEntry) => {
    if (block.title.toLowerCase().includes("past paper")) {
      const title = block.title.toLowerCase();
      let url = `/study/exam?subject=${block.subject_code}`;
      if (title.includes("writing")) url += "&component=writing";
      else if (title.includes("reading")) url += "&component=reading";
      else if (title.includes("listening")) url += "&component=listening";
      router.push(url);
    } else {
      setShowMoodCheck(true);
    }
  }, [router]);

  return (
    <div className="space-y-5">
      {/* Header */}
      <HomeHeader
        overview={overview}
        todayBlocks={today.today}
        subjects={subjects}
      />

      {/* CTA */}
      <HeroCta
        blocks={today.today}
        overview={overview}
        exams={exams}
        onStartSession={() => {
          const NON_STUDY = new Set(["PERSONAL", "ART"]);
          const nextBlock = today.today.find(
            (b) => b.status === "pending" && !NON_STUDY.has(b.subject_code)
          );
          if (nextBlock) {
            startBlock(nextBlock);
          } else {
            setShowMoodCheck(true);
          }
        }}
        onStartBlock={startBlock}
      />

      {/* Exam Timeline — full width */}
      <ExamTimeline exams={exams} subjectMastery={subjects} />

      {/* Bottom grid — 2 or 3 columns depending on whether there are blocks */}
      {hasBlocks ? (
        <div className="grid grid-cols-1 lg:grid-cols-[5fr_4fr_3fr] gap-5">
          <StudyPlan
            todayBlocks={today.today}
            overdueBlocks={today.overdue}
            exams={exams}
            onStartBlock={startBlock}
          />
          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.4 }}
            className="rounded-2xl bg-card border border-border p-4"
          >
            <h3 className="font-heading text-sm font-semibold text-foreground mb-3">
              Mastery by subject
            </h3>
            <MasteryGrid subjects={subjects} />
          </motion.div>
          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.5 }}
          >
            <h3 className="font-heading text-sm font-semibold text-foreground mb-3">
              Free study
            </h3>
            <FreeStudy />
          </motion.div>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-[5fr_4fr_3fr] gap-5">
          <StudyPlan
            todayBlocks={today.today}
            overdueBlocks={today.overdue}
            exams={exams}
            onStartBlock={startBlock}
          />
          <WeeklySummary overview={overview} subjects={subjects} exams={exams} />
          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.4 }}
            className="rounded-2xl bg-card border border-border p-4"
          >
            <h3 className="font-heading text-sm font-semibold text-foreground mb-3">
              Mastery by subject
            </h3>
            <MasteryGrid subjects={subjects} />
          </motion.div>
        </div>
      )}

      {/* Mood Check Modal */}
      <MoodCheck
        open={showMoodCheck}
        onClose={() => setShowMoodCheck(false)}
        onSelect={(mood) => {
          setShowMoodCheck(false);
          router.push(`/study/session?mood=${mood}`);
        }}
      />
    </div>
  );
}
