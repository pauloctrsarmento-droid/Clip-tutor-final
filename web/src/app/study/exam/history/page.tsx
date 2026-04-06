"use client";

import { useEffect, useState, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { ArrowLeft, Calendar, Award, ChevronRight, Clock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { fetchExamHistory, fetchExamResults } from "@/lib/api";
import { getSubjectMeta } from "@/lib/subject-meta";
import { ExamResults } from "@/components/exam/exam-results";
import type { ExamResults as ExamResultsType } from "@/components/exam/types";
import Link from "next/link";

const SUBJECT_NAMES: Record<string, string> = {
  "0620": "Chemistry",
  "0625": "Physics",
  "0610": "Biology",
  "0478": "CS",
  "0520": "French",
  "0504": "Portuguese",
  "0500": "English",
  "0475": "Eng. Lit",
};

interface HistoryEntry {
  session_id: string;
  exam_paper_id: string;
  status: string;
  total_marks: number | null;
  max_marks: number | null;
  percentage: number | null;
  started_at: string;
  completed_at: string | null;
}

function gradeFromPercentage(pct: number): string {
  if (pct >= 80) return "A";
  if (pct >= 65) return "B";
  if (pct >= 50) return "C";
  if (pct >= 35) return "D";
  return "E";
}

function gradeColor(grade: string): string {
  if (grade === "A" || grade === "A*") return "bg-emerald-500/15 text-emerald-400 border-emerald-500/30";
  if (grade === "B") return "bg-sky-500/15 text-sky-400 border-sky-500/30";
  if (grade === "C") return "bg-amber-500/15 text-amber-400 border-amber-500/30";
  return "bg-red-500/15 text-red-400 border-red-500/30";
}

function formatDate(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
}

function formatTime(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });
}

function parsePaperId(paperId: string): { subject: string; session: string; variant: string } {
  const parts = paperId.split("_");
  return {
    subject: parts[0] ?? "",
    session: parts[1] ?? "",
    variant: parts[2] ?? "",
  };
}

function formatSession(session: string): string {
  const map: Record<string, string> = { s: "June", w: "November", m: "March" };
  const prefix = session.charAt(0);
  const year = "20" + session.slice(1);
  return `${map[prefix] ?? session} ${year}`;
}

export default function ExamHistoryPage() {
  const [history, setHistory] = useState<HistoryEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedResults, setSelectedResults] = useState<ExamResultsType | null>(null);
  const [loadingResults, setLoadingResults] = useState(false);

  useEffect(() => {
    fetchExamHistory()
      .then((data: HistoryEntry[]) => setHistory(data))
      .finally(() => setLoading(false));
  }, []);

  const viewResults = useCallback(async (sessionId: string) => {
    setLoadingResults(true);
    try {
      const data = await fetchExamResults(sessionId);
      setSelectedResults(data as ExamResultsType);
    } catch {
      // Failed to load results
    } finally {
      setLoadingResults(false);
    }
  }, []);

  const completed = history.filter((h) => h.status === "completed");

  if (selectedResults) {
    return (
      <div className="space-y-6">
        <Button
          variant="ghost"
          size="sm"
          onClick={() => setSelectedResults(null)}
          className="cursor-pointer gap-1.5 -ml-2"
        >
          <ArrowLeft className="w-4 h-4" />
          Back to history
        </Button>
        <ExamResults
          results={selectedResults}
          onAnother={() => setSelectedResults(null)}
          onViewMarkScheme={() => {
            const paperId = selectedResults.paper_info?.id;
            if (paperId) {
              const msUrl = `https://lltcfjmshnhfmavlxpxr.supabase.co/storage/v1/object/public/papers/${paperId}/ms.pdf`;
              window.open(msUrl, "_blank", "noopener,noreferrer");
            }
          }}
        />
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-heading text-3xl font-bold tracking-tight">Exam History</h1>
          <p className="text-muted-foreground mt-1">
            {completed.length > 0
              ? `${completed.length} exam${completed.length > 1 ? "s" : ""} completed`
              : "No exams completed yet"}
          </p>
        </div>
        <Link href="/study/exam">
          <Button variant="outline" className="cursor-pointer gap-1.5">
            <ArrowLeft className="w-4 h-4" />
            Back to Exam Practice
          </Button>
        </Link>
      </div>

      {loading ? (
        <div className="space-y-3">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-20 rounded-xl" />
          ))}
        </div>
      ) : completed.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 text-center">
          <Award className="w-12 h-12 text-muted-foreground/40 mb-4" />
          <p className="text-lg font-medium text-muted-foreground">No completed exams yet</p>
          <p className="text-sm text-muted-foreground/60 mt-1">
            Go to Exam Practice to start your first paper
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          <AnimatePresence>
            {completed.map((entry, i) => {
              const { subject, session, variant } = parsePaperId(entry.exam_paper_id);
              const meta = getSubjectMeta(subject);
              const Icon = meta.icon;
              const subjectName = SUBJECT_NAMES[subject] ?? subject;
              const pct = entry.percentage ?? 0;
              const grade = gradeFromPercentage(pct);

              return (
                <motion.button
                  key={entry.session_id}
                  initial={{ opacity: 0, y: 12 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: i * 0.05 }}
                  onClick={() => viewResults(entry.session_id)}
                  disabled={loadingResults}
                  className={cn(
                    "w-full text-left rounded-xl bg-card border border-border p-4",
                    "flex items-center gap-4 cursor-pointer",
                    "hover:border-primary/20 hover:bg-secondary/50 transition-all",
                    "active:scale-[0.99]"
                  )}
                >
                  {/* Subject icon */}
                  <div className={cn("w-11 h-11 rounded-xl flex items-center justify-center shrink-0 bg-gradient-to-br", meta.gradient)}>
                    <Icon className={cn("w-5 h-5", meta.accent)} />
                  </div>

                  {/* Paper info */}
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-foreground">
                      {subjectName} — {formatSession(session)}
                    </p>
                    <div className="flex items-center gap-3 mt-1">
                      <span className="text-xs text-muted-foreground flex items-center gap-1">
                        <Calendar className="w-3 h-3" />
                        {formatDate(entry.completed_at ?? entry.started_at)}
                      </span>
                      <span className="text-xs text-muted-foreground flex items-center gap-1">
                        <Clock className="w-3 h-3" />
                        {formatTime(entry.started_at)}
                      </span>
                      <Badge variant="outline" className="text-[10px]">
                        Paper {variant}
                      </Badge>
                    </div>
                  </div>

                  {/* Score */}
                  <div className="text-right shrink-0">
                    <p className="text-lg font-bold tabular-nums text-foreground">
                      {entry.total_marks ?? 0}/{entry.max_marks ?? 0}
                    </p>
                    <div className="flex items-center gap-2 justify-end mt-0.5">
                      <span className="text-xs text-muted-foreground tabular-nums">
                        {pct.toFixed(0)}%
                      </span>
                      <Badge className={cn("text-[10px] border px-1.5", gradeColor(grade))}>
                        {grade}
                      </Badge>
                    </div>
                  </div>

                  <ChevronRight className="w-4 h-4 text-muted-foreground shrink-0" />
                </motion.button>
              );
            })}
          </AnimatePresence>
        </div>
      )}
    </div>
  );
}
