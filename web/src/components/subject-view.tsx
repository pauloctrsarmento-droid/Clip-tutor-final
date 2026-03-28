"use client";

import { useEffect, useState, useCallback } from "react";
import { fetchSubjectTopics } from "@/lib/api";
import { getSubjectMeta } from "@/lib/subject-meta";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";

interface Topic {
  id: string;
  topic_code: string;
  topic_name: string;
  description: string | null;
  display_order: number;
  fact_count: number;
}

interface SubjectData {
  subject: { id: string; code: string; name: string };
  topics: Topic[];
}

interface SubjectViewProps {
  subjectId: string;
  onSelectTopic: (topicId: string) => void;
}

export function SubjectView({ subjectId, onSelectTopic }: SubjectViewProps) {
  const [data, setData] = useState<SubjectData | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const result = await fetchSubjectTopics(subjectId);
      setData(result);
    } finally {
      setLoading(false);
    }
  }, [subjectId]);

  useEffect(() => {
    load();
  }, [load]);

  if (loading) {
    return (
      <div className="p-8 space-y-6">
        <Skeleton className="h-10 w-64" />
        <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-4">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-28 rounded-xl" />
          ))}
        </div>
      </div>
    );
  }

  if (!data) return null;

  const meta = getSubjectMeta(data.subject.code);
  const Icon = meta.icon;
  const totalFacts = data.topics.reduce((sum, t) => sum + t.fact_count, 0);

  return (
    <div className="p-8 space-y-8">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div className="space-y-1">
          <div className="flex items-center gap-3">
            <div
              className={cn(
                "w-10 h-10 rounded-xl flex items-center justify-center bg-gradient-to-br",
                meta.gradient
              )}
            >
              <Icon className={cn("w-5 h-5", meta.accent)} />
            </div>
            <div>
              <h2 className="font-heading text-2xl font-bold tracking-tight">
                {data.subject.name}
              </h2>
              <p className="text-muted-foreground text-sm font-mono">
                {data.subject.code}
              </p>
            </div>
          </div>
        </div>
        <div className="flex gap-4 text-sm">
          <div className="text-center">
            <p className="text-2xl font-heading font-bold text-foreground">
              {data.topics.length}
            </p>
            <p className="text-muted-foreground text-xs">topics</p>
          </div>
          <div className="text-center">
            <p className="text-2xl font-heading font-bold text-primary">
              {totalFacts}
            </p>
            <p className="text-muted-foreground text-xs">facts</p>
          </div>
        </div>
      </div>

      {/* Topic grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-4">
        {data.topics.map((topic) => (
          <button
            key={topic.id}
            onClick={() => onSelectTopic(topic.id)}
            className={cn(
              "group relative text-left p-5 rounded-xl cursor-pointer",
              "bg-card border border-border",
              "hover:border-primary/30 hover:bg-secondary",
              "transition-all duration-200"
            )}
          >
            <div className="flex items-start justify-between gap-2">
              <div className="space-y-1.5 flex-1 min-w-0">
                <Badge
                  variant="secondary"
                  className="text-[10px] font-mono tracking-wider"
                >
                  {topic.topic_code}
                </Badge>
                <h3 className="font-heading text-sm font-semibold leading-snug">
                  {topic.topic_name}
                </h3>
                {topic.description && (
                  <p className="text-xs text-muted-foreground line-clamp-2">
                    {topic.description}
                  </p>
                )}
              </div>
              <div className="flex flex-col items-end gap-2 shrink-0">
                <span className="text-xs text-muted-foreground tabular-nums">
                  {topic.fact_count} facts
                </span>
                <ChevronRight
                  className="w-4 h-4 text-muted-foreground opacity-0 group-hover:opacity-100
                             transition-all duration-200 group-hover:translate-x-0.5"
                />
              </div>
            </div>
          </button>
        ))}
      </div>
    </div>
  );
}
