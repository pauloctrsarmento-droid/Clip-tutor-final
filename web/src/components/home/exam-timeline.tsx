"use client";

import { useMemo, useRef, useState, useEffect } from "react";
import { ChevronLeft, ChevronRight, CalendarClock } from "lucide-react";
import { motion } from "framer-motion";
import { cn } from "@/lib/utils";
import { getSubjectMeta } from "@/lib/subject-meta";
import { STUDY_SUBJECTS } from "@/lib/constants";
import type { ExamCalendarEntry, SubjectMastery } from "@/lib/types";

interface ExamTimelineProps {
  exams: ExamCalendarEntry[];
  subjectMastery: SubjectMastery[];
}

function getMasteryDotColor(percent: number): string {
  if (percent > 75) return "bg-emerald-500";
  if (percent >= 50) return "bg-amber-500";
  return "bg-red-500";
}

const SUBJECT_NAMES: Record<string, string> = {
  "0620": "Chemistry",
  "0625": "Physics",
  "0610": "Biology",
  "0478": "CS",
  "0520": "French",
  "0504": "Portuguese",
  "0500": "English",
  "0475": "Eng. Lit",
  ART: "Art",
  PERSONAL: "Personal",
};

function formatDate(dateStr: string): string {
  const date = new Date(dateStr);
  const day = date.getDate();
  const months = [
    "Jan", "Feb", "Mar", "Apr", "May", "Jun",
    "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
  ];
  return `${day} ${months[date.getMonth()]}`;
}

export function ExamTimeline({ exams, subjectMastery }: ExamTimelineProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [canScrollLeft, setCanScrollLeft] = useState(false);
  const [canScrollRight, setCanScrollRight] = useState(false);

  const filteredExams = useMemo(
    () =>
      exams
        .filter(
          (e) =>
            STUDY_SUBJECTS.includes(e.subject_code) &&
            (e.days_remaining ?? 0) >= 0
        )
        .sort((a, b) => (a.days_remaining ?? 0) - (b.days_remaining ?? 0)),
    [exams]
  );

  const masteryMap = useMemo(() => {
    const map = new Map<string, number>();
    for (const s of subjectMastery) {
      map.set(s.subject_code, s.mastery_percent);
    }
    return map;
  }, [subjectMastery]);

  const nextExamId = filteredExams[0]?.id;

  function updateScrollState() {
    const el = scrollRef.current;
    if (!el) return;
    setCanScrollLeft(el.scrollLeft > 4);
    setCanScrollRight(el.scrollLeft + el.clientWidth < el.scrollWidth - 4);
  }

  useEffect(() => {
    updateScrollState();
    const el = scrollRef.current;
    if (!el) return;
    el.addEventListener("scroll", updateScrollState, { passive: true });
    return () => el.removeEventListener("scroll", updateScrollState);
  }, [filteredExams]);

  function scroll(direction: "left" | "right") {
    const el = scrollRef.current;
    if (!el) return;
    const amount = direction === "left" ? -240 : 240;
    el.scrollBy({ left: amount, behavior: "smooth" });
  }

  if (filteredExams.length === 0) return null;

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, delay: 0.2 }}
      className="rounded-2xl bg-card border border-border p-4"
    >
      {/* Header */}
      <div className="flex items-center justify-between mb-2.5">
        <div className="flex items-center gap-2">
          <CalendarClock className="w-4 h-4 text-muted-foreground" />
          <h3 className="font-heading text-sm font-semibold text-foreground">
            Upcoming exams
          </h3>
        </div>
        <div className="flex items-center gap-1">
          <button
            onClick={() => scroll("left")}
            className={cn(
              "p-1 rounded-md transition-colors cursor-pointer",
              canScrollLeft
                ? "hover:bg-muted text-muted-foreground"
                : "text-muted-foreground/20 cursor-default"
            )}
            disabled={!canScrollLeft}
            aria-label="Scroll left"
          >
            <ChevronLeft className="w-4 h-4" />
          </button>
          <button
            onClick={() => scroll("right")}
            className={cn(
              "p-1 rounded-md transition-colors cursor-pointer",
              canScrollRight
                ? "hover:bg-muted text-muted-foreground"
                : "text-muted-foreground/20 cursor-default"
            )}
            disabled={!canScrollRight}
            aria-label="Scroll right"
          >
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Scrollable cards */}
      <div
        ref={scrollRef}
        className="flex gap-3 overflow-x-auto snap-x snap-mandatory scrollbar-hide pb-1"
      >
        {filteredExams.map((exam) => {
          const meta = getSubjectMeta(exam.subject_code);
          const mastery = masteryMap.get(exam.subject_code) ?? 0;
          const isNext = exam.id === nextExamId;
          const days = exam.days_remaining ?? 0;

          return (
            <div
              key={exam.id}
              className={cn(
                "flex-shrink-0 w-[130px] snap-start rounded-xl border overflow-hidden transition-all",
                isNext
                  ? "ring-2 ring-primary border-primary/30"
                  : "border-border hover:border-muted-foreground/30"
              )}
            >
              {/* Subject color strip */}
              <div
                className={cn(
                  "h-1.5 w-full bg-gradient-to-r",
                  meta.gradient.replace(/\/20/g, "")
                )}
              />

              <div className="p-3 space-y-1.5">
                {/* Subject name */}
                <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground truncate">
                  {SUBJECT_NAMES[exam.subject_code] ?? exam.subject_code}
                </p>

                {/* Paper name */}
                <p className="text-xs font-medium text-foreground truncate">
                  {exam.paper_name}
                </p>

                {/* Date */}
                <p className="text-[11px] text-muted-foreground">
                  {formatDate(exam.exam_date)}
                </p>

                {/* Days countdown */}
                <p
                  className={cn(
                    "text-lg font-heading font-bold",
                    days <= 7
                      ? "text-red-400"
                      : days <= 21
                        ? "text-amber-400"
                        : "text-foreground"
                  )}
                >
                  {days}
                  <span className="text-xs font-normal text-muted-foreground ml-0.5">
                    days
                  </span>
                </p>

                {/* Mastery dot */}
                <div className="flex items-center gap-1.5">
                  <div
                    className={cn(
                      "w-2 h-2 rounded-full",
                      getMasteryDotColor(mastery)
                    )}
                  />
                  <span className="text-[10px] text-muted-foreground">
                    {mastery}%
                  </span>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </motion.div>
  );
}
