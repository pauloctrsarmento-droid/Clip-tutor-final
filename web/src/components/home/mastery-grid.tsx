"use client";

import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import { cn } from "@/lib/utils";
import { getSubjectMeta } from "@/lib/subject-meta";
import { STUDY_SUBJECTS } from "@/lib/constants";
import type { SubjectMastery } from "@/lib/types";

interface MasteryGridProps {
  subjects: SubjectMastery[];
}

function getMasteryBarColor(percent: number): string {
  if (percent > 75) return "bg-emerald-500";
  if (percent >= 50) return "bg-amber-500";
  return "bg-red-500";
}

export function MasteryGrid({ subjects }: MasteryGridProps) {
  const router = useRouter();
  const filtered = subjects.filter((s) =>
    STUDY_SUBJECTS.includes(s.subject_code)
  );

  return (
    <div className="grid grid-cols-2 gap-3">
      {filtered.map((subject, index) => {
        const meta = getSubjectMeta(subject.subject_code);
        const Icon = meta.icon;

        return (
          <motion.button
            key={subject.subject_code}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.3, delay: index * 0.05 }}
            onClick={() =>
              router.push(`/study/mastery?subject=${subject.subject_code}`)
            }
            className={cn(
              "bg-card rounded-2xl p-3 border border-border text-left",
              "hover:border-primary/30 hover:shadow-lg hover:shadow-primary/5",
              "transition-all duration-200 cursor-pointer group"
            )}
          >
            {/* Icon */}
            <div
              className={cn(
                "w-8 h-8 rounded-lg flex items-center justify-center bg-gradient-to-br mb-2",
                "group-hover:scale-105 transition-transform",
                meta.gradient
              )}
            >
              <Icon className={cn("w-5 h-5", meta.accent)} />
            </div>

            {/* Name + code */}
            <p className="text-sm font-semibold text-foreground leading-tight">
              {subject.subject_name}
            </p>
            <p className="text-[10px] text-muted-foreground mt-0.5">
              {subject.subject_code}
            </p>

            {/* Progress bar */}
            <div className="h-2 rounded-full bg-muted overflow-hidden mt-3 mb-2">
              <div
                className={cn(
                  "h-full rounded-full transition-all duration-500",
                  getMasteryBarColor(subject.mastery_percent)
                )}
                style={{ width: `${Math.min(subject.mastery_percent, 100)}%` }}
              />
            </div>

            {/* Stats */}
            <div className="flex items-end justify-between">
              <p className="text-[11px] text-muted-foreground">
                {subject.mastered_facts}/{subject.total_facts} mastered
              </p>
              <span className="text-lg font-heading font-bold text-foreground">
                {subject.mastery_percent}%
              </span>
            </div>
          </motion.button>
        );
      })}
    </div>
  );
}
