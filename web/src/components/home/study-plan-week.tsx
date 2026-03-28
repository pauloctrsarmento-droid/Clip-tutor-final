"use client";

import { useEffect, useState } from "react";
import { AlertTriangle } from "lucide-react";
import { cn } from "@/lib/utils";
import { getSubjectMeta } from "@/lib/subject-meta";
import { fetchWeekPlan } from "@/lib/api";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Tooltip,
  TooltipTrigger,
  TooltipContent,
  TooltipProvider,
} from "@/components/ui/tooltip";
import type { StudyPlanEntry, ExamCalendarEntry } from "@/lib/types";

interface StudyPlanWeekProps {
  exams: ExamCalendarEntry[];
}

const DAY_NAMES = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

function getWeekDates(): Date[] {
  const now = new Date();
  const day = now.getDay();
  const monday = new Date(now);
  monday.setDate(now.getDate() - (day === 0 ? 6 : day - 1));
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(monday);
    d.setDate(monday.getDate() + i);
    return d;
  });
}

function toDateStr(d: Date): string {
  return d.toISOString().split("T")[0] ?? "";
}

export function StudyPlanWeek({ exams }: StudyPlanWeekProps) {
  const [blocks, setBlocks] = useState<StudyPlanEntry[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    fetchWeekPlan()
      .then((data: StudyPlanEntry[]) => {
        if (!cancelled) setBlocks(data);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const weekDates = getWeekDates();
  const todayStr = toDateStr(new Date());

  const examDates = new Set(
    exams.map((e) => e.exam_date?.split("T")[0]).filter(Boolean)
  );

  const blocksByDay = new Map<string, StudyPlanEntry[]>();
  for (const block of blocks) {
    const key = block.plan_date;
    const arr = blocksByDay.get(key) ?? [];
    arr.push(block);
    blocksByDay.set(key, arr);
  }

  if (loading) {
    return (
      <div className="grid grid-cols-7 gap-2">
        {Array.from({ length: 7 }, (_, i) => (
          <Skeleton key={i} className="h-32 rounded-xl" />
        ))}
      </div>
    );
  }

  return (
    <TooltipProvider>
      <div className="grid grid-cols-7 gap-2">
        {weekDates.map((date, idx) => {
          const dateStr = toDateStr(date);
          const isToday = dateStr === todayStr;
          const dayBlocks = blocksByDay.get(dateStr) ?? [];
          const hasExam = examDates.has(dateStr);

          return (
            <div
              key={dateStr}
              className={cn(
                "rounded-xl border border-border p-2 min-h-[120px]",
                isToday && "bg-primary/5 border-primary/30"
              )}
            >
              {/* Header */}
              <div className="flex items-center justify-between mb-2">
                <div className="text-xs font-medium text-muted-foreground">
                  <span>{DAY_NAMES[idx]}</span>{" "}
                  <span className={cn(isToday && "text-primary font-bold")}>
                    {date.getDate()}
                  </span>
                </div>
                {hasExam && (
                  <AlertTriangle className="w-3 h-3 text-red-400" />
                )}
              </div>

              {/* Blocks */}
              <div className="space-y-1">
                {dayBlocks.map((block) => {
                  const meta = getSubjectMeta(block.subject_code);
                  return (
                    <Tooltip key={block.id}>
                      <TooltipTrigger className="w-full">
                        <div className="flex items-center gap-1 rounded-md bg-card border border-border/50 p-1">
                          <div
                            className={cn(
                              "w-1 h-5 rounded-full shrink-0 bg-gradient-to-b",
                              meta.gradient.replace("/20", "")
                            )}
                          />
                          <span className="text-[10px] text-foreground truncate">
                            {block.title}
                          </span>
                        </div>
                      </TooltipTrigger>
                      <TooltipContent>
                        <p className="font-medium">{block.title}</p>
                        <p className="text-muted-foreground">
                          {block.planned_hours}h · {block.study_type}
                        </p>
                      </TooltipContent>
                    </Tooltip>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
    </TooltipProvider>
  );
}
