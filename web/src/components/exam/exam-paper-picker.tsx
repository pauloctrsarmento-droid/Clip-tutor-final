"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { fetchSubjects, fetchExamPapers, fetchPaperExposure } from "@/lib/api";
import type { PaperExposure } from "@/lib/api";
import { getSubjectMeta } from "@/lib/subject-meta";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { motion, AnimatePresence } from "framer-motion";
import { ArrowLeft, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";
import { STUDY_SUBJECTS } from "@/lib/constants";
import type { ExamPaper } from "./types";

interface Subject {
  id: string;
  code: string;
  name: string;
  topic_count: number;
  fact_count: number;
}

interface ExamPaperPickerProps {
  onSelect: (paper: ExamPaper) => void;
  initialSubjectCode?: string | null;
  initialComponentFilter?: string | null;
}

const EXCLUDED_TYPES = ["mc", "listening", "oral"];

function formatSession(session: string): string {
  const map: Record<string, string> = { s: "June", w: "November", m: "March" };
  const prefix = session.charAt(0);
  const year = "20" + session.slice(1);
  return `${map[prefix] ?? session} ${year}`;
}

function formatComponentType(ct: string): string {
  const map: Record<string, string> = {
    theory_extended: "Theory (Extended)",
    theory_core: "Theory (Core)",
    theory: "Theory",
    atp: "Alternative to Practical",
    practical: "Practical",
    reading: "Reading",
    writing: "Writing",
    reading_writing: "Reading & Writing",
    programming: "Problem Solving & Programming",
    poetry_prose: "Poetry & Prose",
  };
  return map[ct] ?? ct;
}

export function ExamPaperPicker({ onSelect, initialSubjectCode, initialComponentFilter }: ExamPaperPickerProps) {
  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedSubjectCode, setSelectedSubjectCode] = useState<string | null>(null);
  const [papers, setPapers] = useState<ExamPaper[]>([]);
  const [papersLoading, setPapersLoading] = useState(false);
  const [exposure, setExposure] = useState<Map<string, PaperExposure>>(new Map());
  const initialAppliedRef = useRef(false);

  const selectedSubject = subjects.find((s) => s.code === selectedSubjectCode) ?? null;

  useEffect(() => {
    fetchSubjects()
      .then((data: Subject[]) => {
        setSubjects(data.filter((s) => STUDY_SUBJECTS.includes(s.code)));
      })
      .finally(() => setLoading(false));
  }, []);

  // Auto-select subject from study plan
  useEffect(() => {
    if (initialSubjectCode && !loading && subjects.length > 0 && !initialAppliedRef.current) {
      initialAppliedRef.current = true;
      handleSelectSubject(initialSubjectCode);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialSubjectCode, loading, subjects]);

  const handleSelectSubject = useCallback(async (code: string) => {
    setSelectedSubjectCode(code);
    setPapersLoading(true);
    try {
      const [data, exposureData] = await Promise.all([
        fetchExamPapers(code) as Promise<ExamPaper[]>,
        fetchPaperExposure(code),
      ]);
      let filtered = data.filter(
        (p) => !p.component_type || !EXCLUDED_TYPES.includes(p.component_type)
      );
      if (initialComponentFilter) {
        filtered = filtered.filter(
          (p) => p.component_type === initialComponentFilter
        );
      }
      // Sort by year descending, then session, then variant
      filtered.sort((a, b) => {
        if (b.year !== a.year) return b.year - a.year;
        if (a.session !== b.session) return a.session.localeCompare(b.session);
        return a.variant.localeCompare(b.variant);
      });
      setPapers(filtered);

      // Build exposure lookup
      const expMap = new Map<string, PaperExposure>();
      for (const e of exposureData) {
        expMap.set(e.paper_id, e);
      }
      setExposure(expMap);
    } finally {
      setPapersLoading(false);
    }
  }, []);

  if (loading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-10 w-64" />
        <div className="grid grid-cols-2 lg:grid-cols-3 gap-4">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-32 rounded-2xl" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <div>
        <h1 className="font-heading text-3xl font-bold tracking-tight">
          Exam Practice
        </h1>
        <p className="text-muted-foreground mt-1">
          {selectedSubject
            ? `Choose a paper for ${selectedSubject.name}`
            : "Choose a subject to start"}
        </p>
      </div>

      <AnimatePresence mode="wait">
        {!selectedSubjectCode ? (
          <motion.div
            key="subjects"
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -12 }}
            transition={{ duration: 0.2 }}
            className="grid grid-cols-2 lg:grid-cols-3 gap-4"
          >
            {subjects.map((subject, i) => {
              const meta = getSubjectMeta(subject.code);
              const Icon = meta.icon;

              return (
                <motion.button
                  key={subject.id}
                  initial={{ opacity: 0, y: 16 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: i * 0.05, duration: 0.3 }}
                  onClick={() => handleSelectSubject(subject.code)}
                  className={cn(
                    "group relative text-left p-6 rounded-2xl cursor-pointer",
                    "bg-card border border-border",
                    "hover:border-primary/30 hover:shadow-lg hover:shadow-primary/5",
                    "active:scale-[0.98]",
                    "transition-all duration-200"
                  )}
                >
                  <div className="space-y-3">
                    <div
                      className={cn(
                        "w-10 h-10 rounded-xl flex items-center justify-center bg-gradient-to-br",
                        meta.gradient
                      )}
                    >
                      <Icon className={cn("w-5 h-5", meta.accent)} />
                    </div>
                    <div>
                      <h3 className="font-heading text-base font-semibold">
                        {subject.name}
                      </h3>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        {subject.code}
                      </p>
                    </div>
                  </div>
                  <ChevronRight
                    className="absolute right-4 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground
                               opacity-0 group-hover:opacity-100 group-hover:translate-x-0.5
                               transition-all duration-200"
                  />
                </motion.button>
              );
            })}
          </motion.div>
        ) : (
          <motion.div
            key="papers"
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -12 }}
            transition={{ duration: 0.2 }}
            className="space-y-4"
          >
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                setSelectedSubjectCode(null);
                setPapers([]);
              }}
              className="cursor-pointer gap-1.5 -ml-2"
            >
              <ArrowLeft className="w-4 h-4" />
              Back to subjects
            </Button>

            {papersLoading ? (
              <div className="space-y-2">
                {Array.from({ length: 6 }).map((_, i) => (
                  <Skeleton key={i} className="h-14 rounded-xl" />
                ))}
              </div>
            ) : papers.length === 0 ? (
              <p className="text-sm text-muted-foreground py-8 text-center">
                No exam papers available for this subject.
              </p>
            ) : (
              <div className="space-y-2">
                {papers.map((paper, i) => {
                  const exp = exposure.get(paper.id);
                  const seenCount = exp?.seen_in_quiz ?? 0;
                  const totalQ = exp?.total_questions ?? 0;
                  const isVirgin = seenCount === 0;

                  return (
                    <motion.button
                      key={paper.id}
                      initial={{ opacity: 0, y: 8 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: i * 0.03 }}
                      onClick={() => onSelect(paper)}
                      className={cn(
                        "w-full text-left px-4 py-3 rounded-xl cursor-pointer",
                        "bg-card border",
                        isVirgin
                          ? "border-emerald-500/20 hover:border-emerald-500/40"
                          : "border-border hover:border-primary/20",
                        "hover:bg-secondary",
                        "active:scale-[0.99]",
                        "transition-all duration-200",
                        "flex items-center gap-3"
                      )}
                    >
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium truncate">
                          {formatSession(paper.session)}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          Variant {paper.variant}
                        </p>
                      </div>
                      {paper.component_type && (
                        <Badge variant="secondary" className="text-[10px] shrink-0">
                          {formatComponentType(paper.component_type)}
                        </Badge>
                      )}
                      {/* Exposure indicator */}
                      {totalQ > 0 && seenCount > 0 ? (
                        <Badge
                          variant="secondary"
                          className={cn(
                            "text-[10px] shrink-0",
                            seenCount >= totalQ
                              ? "bg-amber-500/10 text-amber-400 border-amber-500/20"
                              : "bg-muted text-muted-foreground"
                          )}
                        >
                          {seenCount}/{totalQ} seen
                        </Badge>
                      ) : totalQ > 0 ? (
                        <Badge
                          variant="secondary"
                          className="text-[10px] shrink-0 bg-emerald-500/10 text-emerald-400 border-emerald-500/20"
                        >
                          Fresh
                        </Badge>
                      ) : null}
                      <span className="text-xs tabular-nums text-muted-foreground shrink-0">
                        {paper.total_marks} marks
                      </span>
                      <ChevronRight className="w-4 h-4 text-muted-foreground shrink-0" />
                    </motion.button>
                  );
                })}
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
