"use client";

import { useEffect, useState } from "react";
import {
  fetchDashboardOverview,
  fetchDashboardSubjects,
  fetchMisconceptions,
  fetchProgress,
} from "@/lib/api";
import { getSubjectMeta } from "@/lib/subject-meta";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { Flame, Target, HelpCircle, TrendingUp } from "lucide-react";

interface Overview {
  streak: number;
  longest_streak: number;
  mastery_percent: number;
  total_attempts: number;
  accuracy: number;
}

interface SubjectMastery {
  subject_code: string;
  subject_name: string;
  total_facts: number;
  mastered_facts: number;
  mastery_percent: number;
  quiz_attempts: number;
  quiz_accuracy: number;
}

interface Misconception {
  fact_id: string;
  fact_text: string;
  topic_name: string;
  mastery_score: number;
  times_wrong: number;
  last_error: string | null;
}

interface DayProgress {
  date: string;
  cards_reviewed: number;
  correct: number;
  mastery_snapshot: number;
}

function StatCard({
  icon: Icon,
  label,
  value,
  sub,
  accent,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: string | number;
  sub?: string;
  accent?: string;
}) {
  return (
    <div className="bg-card border border-border rounded-xl p-5 space-y-1">
      <div className="flex items-center justify-between">
        <p className={cn("text-2xl font-heading font-bold", accent ?? "text-foreground")}>
          {value}
        </p>
        <Icon className="w-5 h-5 text-muted-foreground/50" />
      </div>
      <p className="text-xs text-muted-foreground">{label}</p>
      {sub && <p className="text-[10px] text-muted-foreground/70">{sub}</p>}
    </div>
  );
}

function masteryColor(pct: number) {
  if (pct >= 70) return "bg-emerald-500";
  if (pct >= 40) return "bg-amber-500";
  return "bg-red-500";
}

function masteryTextColor(pct: number) {
  if (pct >= 70) return "text-emerald-400";
  if (pct >= 40) return "text-amber-400";
  return "text-red-400";
}

export function ProgressView() {
  const [overview, setOverview] = useState<Overview | null>(null);
  const [subjects, setSubjects] = useState<SubjectMastery[]>([]);
  const [misconceptions, setMisconceptions] = useState<Misconception[]>([]);
  const [progress, setProgress] = useState<DayProgress[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      fetchDashboardOverview().catch(() => null),
      fetchDashboardSubjects().catch(() => []),
      fetchMisconceptions().catch(() => []),
      fetchProgress(14).catch(() => []),
    ])
      .then(([ov, sub, mis, prog]) => {
        setOverview(ov);
        setSubjects(Array.isArray(sub) ? sub : []);
        setMisconceptions(Array.isArray(mis) ? mis : []);
        setProgress(Array.isArray(prog) ? prog : []);
      })
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div className="p-8 space-y-6">
        <Skeleton className="h-10 w-48" />
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-24 rounded-xl" />
          ))}
        </div>
        <Skeleton className="h-64 rounded-xl" />
      </div>
    );
  }

  return (
    <div className="p-8 space-y-8">
      <h2 className="font-heading text-2xl font-bold tracking-tight">
        Progresso da Luísa
      </h2>

      {/* Stats cards */}
      {overview && (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <StatCard
            icon={Flame}
            label="Streak"
            value={`${overview.streak}d`}
            sub={`Record: ${overview.longest_streak}d`}
            accent="text-amber-400"
          />
          <StatCard
            icon={Target}
            label="Mastery"
            value={`${overview.mastery_percent}%`}
            accent={masteryTextColor(overview.mastery_percent)}
          />
          <StatCard
            icon={HelpCircle}
            label="Questões"
            value={overview.total_attempts}
          />
          <StatCard
            icon={TrendingUp}
            label="Accuracy"
            value={`${overview.accuracy}%`}
            accent={masteryTextColor(overview.accuracy)}
          />
        </div>
      )}

      {/* Subject mastery */}
      <div className="space-y-4">
        <h3 className="font-heading text-lg font-semibold">Mastery por Subject</h3>
        {subjects.length === 0 ? (
          <p className="text-sm text-muted-foreground py-8 text-center">
            Sem dados de mastery ainda — começa a estudar!
          </p>
        ) : (
          <div className="space-y-3">
            {subjects.map((s) => {
              const meta = getSubjectMeta(s.subject_code);
              const Icon = meta.icon;
              return (
                <div
                  key={s.subject_code}
                  className="bg-card border border-border rounded-xl p-4 space-y-2"
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Icon className={cn("w-4 h-4", meta.accent)} />
                      <span className="text-sm font-medium">{s.subject_name}</span>
                    </div>
                    <span
                      className={cn(
                        "text-sm font-bold tabular-nums",
                        masteryTextColor(s.mastery_percent)
                      )}
                    >
                      {s.mastery_percent}%
                    </span>
                  </div>
                  <div className="h-2 rounded-full bg-muted overflow-hidden">
                    <div
                      className={cn("h-full rounded-full transition-all", masteryColor(s.mastery_percent))}
                      style={{ width: `${Math.min(s.mastery_percent, 100)}%` }}
                    />
                  </div>
                  <div className="flex gap-4 text-[10px] text-muted-foreground">
                    <span>{s.mastered_facts}/{s.total_facts} facts mastered</span>
                    <span>{s.quiz_attempts} quiz attempts</span>
                    {s.quiz_attempts > 0 && <span>{s.quiz_accuracy}% accuracy</span>}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Weak topics */}
      {misconceptions.length > 0 && (
        <div className="space-y-4">
          <h3 className="font-heading text-lg font-semibold">Tópicos Fracos</h3>
          <div className="space-y-2">
            {misconceptions.slice(0, 10).map((m) => (
              <div
                key={m.fact_id}
                className="bg-card border border-border border-l-4 border-l-red-500/40 rounded-xl p-4"
              >
                <p className="text-sm">{m.fact_text}</p>
                <div className="flex items-center gap-3 mt-2 text-[10px] text-muted-foreground">
                  <Badge variant="secondary" className="text-[10px]">
                    {m.topic_name}
                  </Badge>
                  <span className="text-red-400 font-semibold">
                    {m.times_wrong}x errado
                  </span>
                  <span>{Math.round(m.mastery_score * 100)}% mastery</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Progress timeline */}
      {progress.length > 0 && (
        <div className="space-y-4">
          <h3 className="font-heading text-lg font-semibold">Últimos 14 dias</h3>
          <div className="space-y-1">
            {progress.map((day) => (
              <div key={day.date} className="flex items-center gap-3 text-sm">
                <span className="text-xs text-muted-foreground w-20 tabular-nums shrink-0">
                  {day.date}
                </span>
                <div className="flex-1 h-4 rounded bg-muted overflow-hidden">
                  <div
                    className="h-full rounded bg-primary transition-all"
                    style={{ width: `${Math.min(day.mastery_snapshot, 100)}%` }}
                  />
                </div>
                <span className="text-xs text-muted-foreground tabular-nums w-16 text-right">
                  {day.correct}/{day.cards_reviewed}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
