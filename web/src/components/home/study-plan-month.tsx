"use client";

import { useEffect, useState, useCallback } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Popover,
  PopoverTrigger,
  PopoverContent,
} from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import { getSubjectMeta } from "@/lib/subject-meta";
import { fetchMonthPlan } from "@/lib/api";
import type { StudyPlanEntry, ExamCalendarEntry } from "@/lib/types";

interface StudyPlanMonthProps {
  exams: ExamCalendarEntry[];
}

const DAY_HEADERS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const MONTH_NAMES = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];

function toDateStr(d: Date): string {
  return d.toISOString().split("T")[0] ?? "";
}

function getMonthRange(year: number, month: number) {
  const from = `${year}-${String(month + 1).padStart(2, "0")}-01`;
  const lastDay = new Date(year, month + 1, 0).getDate();
  const to = `${year}-${String(month + 1).padStart(2, "0")}-${String(lastDay).padStart(2, "0")}`;
  return { from, to };
}

function getCalendarGrid(year: number, month: number): (Date | null)[][] {
  const firstDay = new Date(year, month, 1);
  let startDay = firstDay.getDay(); // 0=Sun
  startDay = startDay === 0 ? 6 : startDay - 1; // Convert to Mon=0
  const daysInMonth = new Date(year, month + 1, 0).getDate();

  const cells: (Date | null)[] = [];
  for (let i = 0; i < startDay; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(new Date(year, month, d));
  while (cells.length % 7 !== 0) cells.push(null);

  const rows: (Date | null)[][] = [];
  for (let i = 0; i < cells.length; i += 7) {
    rows.push(cells.slice(i, i + 7));
  }
  return rows;
}

export function StudyPlanMonth({ exams }: StudyPlanMonthProps) {
  const now = new Date();
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth());
  const [blocks, setBlocks] = useState<StudyPlanEntry[]>([]);
  const [loading, setLoading] = useState(true);

  const loadMonth = useCallback(
    (y: number, m: number) => {
      setLoading(true);
      const { from, to } = getMonthRange(y, m);
      fetchMonthPlan(from, to)
        .then((data: StudyPlanEntry[]) => setBlocks(data))
        .finally(() => setLoading(false));
    },
    []
  );

  useEffect(() => {
    loadMonth(year, month);
  }, [year, month, loadMonth]);

  const todayStr = toDateStr(new Date());
  const grid = getCalendarGrid(year, month);

  const blocksByDay = new Map<string, StudyPlanEntry[]>();
  for (const block of blocks) {
    const key = block.plan_date;
    const arr = blocksByDay.get(key) ?? [];
    arr.push(block);
    blocksByDay.set(key, arr);
  }

  const examDates = new Map<string, ExamCalendarEntry[]>();
  for (const exam of exams) {
    const key = exam.exam_date?.split("T")[0] ?? "";
    const arr = examDates.get(key) ?? [];
    arr.push(exam);
    examDates.set(key, arr);
  }

  function prevMonth() {
    if (month === 0) {
      setYear((y) => y - 1);
      setMonth(11);
    } else {
      setMonth((m) => m - 1);
    }
  }

  function nextMonth() {
    if (month === 11) {
      setYear((y) => y + 1);
      setMonth(0);
    } else {
      setMonth((m) => m + 1);
    }
  }

  return (
    <div className="space-y-3">
      {/* Month navigation */}
      <div className="flex items-center justify-between">
        <Button variant="ghost" size="icon-sm" onClick={prevMonth}>
          <ChevronLeft className="w-4 h-4" />
        </Button>
        <span className="text-sm font-heading font-semibold">
          {MONTH_NAMES[month]} {year}
        </span>
        <Button variant="ghost" size="icon-sm" onClick={nextMonth}>
          <ChevronRight className="w-4 h-4" />
        </Button>
      </div>

      {loading ? (
        <Skeleton className="h-64 rounded-xl" />
      ) : (
        <div className="grid grid-cols-7 gap-px bg-border rounded-xl overflow-hidden">
          {/* Day headers */}
          {DAY_HEADERS.map((d) => (
            <div
              key={d}
              className="bg-card py-1.5 text-center text-[10px] font-medium text-muted-foreground"
            >
              {d}
            </div>
          ))}

          {/* Calendar cells */}
          {grid.flat().map((date, idx) => {
            if (!date) {
              return <div key={`empty-${idx}`} className="bg-card h-16" />;
            }
            const dateStr = toDateStr(date);
            const isToday = dateStr === todayStr;
            const dayBlocks = blocksByDay.get(dateStr) ?? [];
            const dayExams = examDates.get(dateStr) ?? [];

            return (
              <Popover key={dateStr}>
                <PopoverTrigger
                  className={cn(
                    "bg-card h-16 p-1 text-left hover:bg-muted/50 transition-colors cursor-pointer",
                    isToday && "ring-2 ring-inset ring-primary"
                  )}
                >
                  <span
                    className={cn(
                      "text-[10px]",
                      isToday
                        ? "text-primary font-bold"
                        : "text-muted-foreground"
                    )}
                  >
                    {date.getDate()}
                  </span>
                  <div className="flex flex-wrap gap-0.5 mt-0.5">
                    {dayBlocks.map((block) => {
                      const meta = getSubjectMeta(block.subject_code);
                      return (
                        <div
                          key={block.id}
                          className={cn(
                            "w-1.5 h-1.5 rounded-full bg-gradient-to-br",
                            meta.gradient.replace("/20", "")
                          )}
                        />
                      );
                    })}
                    {dayExams.map((exam) => (
                      <div
                        key={exam.id}
                        className="w-1.5 h-1.5 rounded-full bg-red-500"
                      />
                    ))}
                  </div>
                  {dayExams.length > 0 && (
                    <p className="text-[8px] text-red-400 truncate mt-0.5">
                      {dayExams[0]?.paper_name}
                    </p>
                  )}
                </PopoverTrigger>
                <PopoverContent className="w-60 p-3">
                  <p className="text-xs font-medium text-foreground mb-2">
                    {date.toLocaleDateString("en-GB", {
                      weekday: "long",
                      day: "numeric",
                      month: "long",
                    })}
                  </p>
                  {dayBlocks.length === 0 && dayExams.length === 0 && (
                    <p className="text-xs text-muted-foreground">
                      No activity.
                    </p>
                  )}
                  {dayBlocks.map((block) => {
                    const meta = getSubjectMeta(block.subject_code);
                    const Icon = meta.icon;
                    return (
                      <div
                        key={block.id}
                        className="flex items-center gap-2 py-1"
                      >
                        <Icon className={cn("w-3 h-3", meta.accent)} />
                        <span className="text-xs text-foreground truncate">
                          {block.title}
                        </span>
                        <span className="text-[10px] text-muted-foreground ml-auto">
                          {block.planned_hours}h
                        </span>
                      </div>
                    );
                  })}
                  {dayExams.map((exam) => (
                    <div key={exam.id} className="flex items-center gap-2 py-1">
                      <div className="w-2 h-2 rounded-full bg-red-500 shrink-0" />
                      <span className="text-xs text-red-400">
                        {exam.paper_name}
                      </span>
                    </div>
                  ))}
                </PopoverContent>
              </Popover>
            );
          })}
        </div>
      )}
    </div>
  );
}
