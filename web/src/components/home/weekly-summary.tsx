"use client";

import { useEffect, useState } from "react";
import { Sparkles, Loader2 } from "lucide-react";
import { motion } from "framer-motion";
import type { DashboardOverview, SubjectMastery, ExamCalendarEntry } from "@/lib/types";

interface WeeklySummaryProps {
  overview: DashboardOverview;
  subjects: SubjectMastery[];
  exams: ExamCalendarEntry[];
}

export function WeeklySummary({ overview, subjects, exams }: WeeklySummaryProps) {
  const [summary, setSummary] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    fetch("/api/weekly-summary")
      .then((r) => r.json())
      .then((data: { summary: string }) => {
        if (!cancelled) setSummary(data.summary);
      })
      .catch(() => {
        if (!cancelled) setSummary(null);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, delay: 0.45 }}
      className="rounded-2xl bg-card border border-border p-4"
    >
      <div className="flex items-center gap-2 mb-3">
        <Sparkles className="w-4 h-4 text-primary" />
        <h3 className="font-heading text-sm font-semibold text-foreground">
          Weekly overview
        </h3>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-8">
          <Loader2 className="w-5 h-5 text-muted-foreground animate-spin" />
        </div>
      ) : summary ? (
        <p className="text-sm text-muted-foreground leading-relaxed">
          {summary}
        </p>
      ) : (
        <p className="text-sm text-muted-foreground/60 italic">
          Could not generate summary.
        </p>
      )}
    </motion.div>
  );
}
