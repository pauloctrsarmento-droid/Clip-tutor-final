"use client";

import { useEffect, useState, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, ChevronDown, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { getSubjectMeta } from "@/lib/subject-meta";
import { fetchSubjectMasteryDrillDown } from "@/lib/api";

interface TopicData {
  id: string;
  topic_name: string;
  mastery_score: number;
  facts: Array<{
    id: string;
    text: string;
    mastery_score: number;
    status: "mastered" | "in_progress" | "not_started";
  }>;
}

interface DrillDownData {
  subject: { code: string; name: string };
  topics: TopicData[];
}

function getMasteryBarColor(score: number): string {
  const percent = score * 100;
  if (percent > 75) return "bg-emerald-500";
  if (percent >= 50) return "bg-amber-500";
  return "bg-red-500";
}

function getStatusDot(status: string): string {
  switch (status) {
    case "mastered":
      return "bg-emerald-500";
    case "in_progress":
      return "bg-amber-500";
    default:
      return "bg-muted-foreground/30";
  }
}

function MasteryDrillDownInner() {
  const searchParams = useSearchParams();
  const subjectCode = searchParams.get("subject") ?? "";
  const [data, setData] = useState<DrillDownData | null>(null);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (!subjectCode) return;
    let cancelled = false;
    setLoading(true);
    fetchSubjectMasteryDrillDown(subjectCode)
      .then((result) => {
        if (!cancelled) setData(result);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [subjectCode]);

  function toggleExpand(topicId: string) {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(topicId)) {
        next.delete(topicId);
      } else {
        next.add(topicId);
      }
      return next;
    });
  }

  if (!subjectCode) {
    return (
      <div className="text-center py-12">
        <p className="text-muted-foreground">No subject selected.</p>
        <Link href="/study" className="text-primary text-sm mt-2 inline-block">
          Back to home
        </Link>
      </div>
    );
  }

  const meta = getSubjectMeta(subjectCode);
  const Icon = meta.icon;

  if (loading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-10 w-48" />
        <Skeleton className="h-6 w-32" />
        {Array.from({ length: 5 }, (_, i) => (
          <Skeleton key={i} className="h-14 rounded-xl" />
        ))}
      </div>
    );
  }

  if (!data) {
    return (
      <div className="text-center py-12">
        <p className="text-muted-foreground">Error loading data.</p>
        <Link href="/study" className="text-primary text-sm mt-2 inline-block">
          Back to home
        </Link>
      </div>
    );
  }

  const overallMastery =
    data.topics.length > 0
      ? Math.round(
          (data.topics.reduce((sum, t) => sum + t.mastery_score, 0) /
            data.topics.length) *
            100
        )
      : 0;

  return (
    <div className="space-y-6">
      {/* Back + header */}
      <div>
        <Link href="/study">
          <Button variant="ghost" size="sm" className="mb-3">
            <ArrowLeft className="w-4 h-4 mr-1" />
            Back
          </Button>
        </Link>
        <div className="flex items-center gap-3">
          <div
            className={cn(
              "w-12 h-12 rounded-xl flex items-center justify-center bg-gradient-to-br",
              meta.gradient
            )}
          >
            <Icon className={cn("w-6 h-6", meta.accent)} />
          </div>
          <div>
            <h1 className="font-heading text-xl font-bold text-foreground">
              {data.subject.name}
            </h1>
            <p className="text-sm text-muted-foreground">
              Mastery: {overallMastery}%
            </p>
          </div>
        </div>
      </div>

      {/* Topics list */}
      <div className="space-y-2">
        {data.topics.map((topic) => {
          const isExpanded = expanded.has(topic.id);
          const percent = Math.round(topic.mastery_score * 100);

          return (
            <div key={topic.id} className="rounded-xl border border-border overflow-hidden">
              {/* Topic header */}
              <button
                onClick={() => toggleExpand(topic.id)}
                className="w-full flex items-center gap-3 p-3 hover:bg-muted/50 transition-colors cursor-pointer"
              >
                {isExpanded ? (
                  <ChevronDown className="w-4 h-4 text-muted-foreground shrink-0" />
                ) : (
                  <ChevronRight className="w-4 h-4 text-muted-foreground shrink-0" />
                )}
                <div className="flex-1 min-w-0 text-left">
                  <p className="text-sm font-medium text-foreground truncate">
                    {topic.topic_name}
                  </p>
                  <div className="flex items-center gap-2 mt-1">
                    <div className="flex-1 h-1 rounded-full bg-muted overflow-hidden">
                      <div
                        className={cn(
                          "h-full rounded-full",
                          getMasteryBarColor(topic.mastery_score)
                        )}
                        style={{ width: `${Math.min(percent, 100)}%` }}
                      />
                    </div>
                    <span className="text-xs text-muted-foreground w-8 text-right">
                      {percent}%
                    </span>
                  </div>
                </div>
                <span className="text-xs text-muted-foreground shrink-0">
                  {topic.facts.length} facts
                </span>
              </button>

              {/* Expanded facts */}
              {isExpanded && (
                <div className="border-t border-border bg-muted/20 px-4 py-2 space-y-1.5">
                  {topic.facts.map((fact) => (
                    <div key={fact.id} className="flex items-start gap-2 py-1">
                      <div
                        className={cn(
                          "w-2 h-2 rounded-full mt-1.5 shrink-0",
                          getStatusDot(fact.status)
                        )}
                      />
                      <p className="text-xs text-foreground leading-relaxed">
                        {fact.text}
                      </p>
                    </div>
                  ))}
                  {topic.facts.length === 0 && (
                    <p className="text-xs text-muted-foreground py-1">
                      No facts recorded.
                    </p>
                  )}
                </div>
              )}
            </div>
          );
        })}

        {data.topics.length === 0 && (
          <p className="text-sm text-muted-foreground text-center py-8">
            No topics for this subject.
          </p>
        )}
      </div>
    </div>
  );
}

export default function MasteryDrillDownPage() {
  return (
    <Suspense>
      <MasteryDrillDownInner />
    </Suspense>
  );
}
