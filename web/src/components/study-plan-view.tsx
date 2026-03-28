"use client";

import { useEffect, useState, useCallback } from "react";
import {
  fetchExamCalendar,
  fetchStudyPlanWeek,
  updatePlanEntry,
  reschedulePlanEntry,
  aiReschedule,
  applyReschedule,
} from "@/lib/api";
import { useAuth } from "@/lib/auth-context";
import { getSubjectMeta } from "@/lib/subject-meta";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  ChevronLeft,
  ChevronRight,
  Clock,
  AlertTriangle,
  Sparkles,
  Check,
  X,
  Loader2,
} from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

interface ExamEntry {
  subject_code: string;
  paper_name: string;
  exam_date: string;
  days_remaining: number;
}

interface PlanEntry {
  id: string;
  plan_date: string;
  subject_code: string;
  title: string;
  planned_hours: number;
  study_type: string;
  status: string;
  notes: string | null;
  sort_order: number;
}

const STATUS_STYLES: Record<string, { bg: string; text: string; label: string }> = {
  pending: { bg: "bg-card", text: "text-muted-foreground", label: "Pending" },
  done: { bg: "bg-emerald-950/20", text: "text-emerald-400", label: "Done" },
  skipped: { bg: "bg-zinc-800/50", text: "text-zinc-500", label: "Skipped" },
  rescheduled: { bg: "bg-amber-950/20", text: "text-amber-400", label: "Moved" },
};

const DAY_LABELS = ["Seg", "Ter", "Qua", "Qui", "Sex", "Sáb", "Dom"];

function getWeekDates(offset: number): string[] {
  const now = new Date();
  const day = now.getDay();
  const monday = new Date(now);
  monday.setDate(now.getDate() - (day === 0 ? 6 : day - 1) + offset * 7);
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(monday);
    d.setDate(monday.getDate() + i);
    return d.toISOString().split("T")[0];
  });
}

export function StudyPlanView() {
  const { pin } = useAuth();
  const [exams, setExams] = useState<ExamEntry[]>([]);
  const [entries, setEntries] = useState<PlanEntry[]>([]);
  const [weekOffset, setWeekOffset] = useState(0);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<PlanEntry | null>(null);
  const [editStatus, setEditStatus] = useState("");
  const [editDate, setEditDate] = useState("");
  const [editNotes, setEditNotes] = useState("");
  const [showAiModal, setShowAiModal] = useState(false);
  const [aiReason, setAiReason] = useState("");
  const [aiHours, setAiHours] = useState(6);
  const [aiLoading, setAiLoading] = useState(false);
  const [aiProposal, setAiProposal] = useState<{ entries: Array<Record<string, unknown>>; reasoning: string } | null>(null);

  const weekDates = getWeekDates(weekOffset);
  const weekLabel = `${weekDates[0]} — ${weekDates[6]}`;

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [cal, plan] = await Promise.all([
        fetchExamCalendar().catch(() => []),
        fetchStudyPlanWeek(weekOffset).catch(() => []),
      ]);
      setExams(Array.isArray(cal) ? cal : []);
      setEntries(Array.isArray(plan) ? plan : []);
    } finally {
      setLoading(false);
    }
  }, [weekOffset]);

  useEffect(() => {
    load();
  }, [load]);

  const nextExam = exams.find((e) => e.days_remaining >= 0);

  const openEdit = (entry: PlanEntry) => {
    setSelected(entry);
    setEditStatus(entry.status);
    setEditDate(entry.plan_date);
    setEditNotes(entry.notes ?? "");
  };

  const saveEdit = async () => {
    if (!selected || !pin) return;
    try {
      if (editDate !== selected.plan_date) {
        await reschedulePlanEntry(pin, {
          entry_id: selected.id,
          new_date: editDate,
          notes: editNotes || undefined,
        });
      } else {
        await updatePlanEntry(selected.id, pin, {
          status: editStatus,
          notes: editNotes || undefined,
        });
      }
      toast.success("Bloco actualizado");
      setSelected(null);
      load();
    } catch {
      toast.error("Falhou a actualizar");
    }
  };

  const handleAiGenerate = async () => {
    if (!pin || !aiReason.trim()) return;
    setAiLoading(true);
    try {
      const result = await aiReschedule(pin, {
        reason: aiReason,
        available_hours_per_day: aiHours,
      });
      setAiProposal(result);
    } catch {
      toast.error("Falhou a gerar proposta AI");
    } finally {
      setAiLoading(false);
    }
  };

  const handleAiApply = async () => {
    if (!pin || !aiProposal) return;
    try {
      await applyReschedule(pin, { entries: aiProposal.entries });
      toast.success("Plano reorganizado");
      setShowAiModal(false);
      setAiProposal(null);
      setAiReason("");
      load();
    } catch {
      toast.error("Falhou a aplicar");
    }
  };

  if (loading) {
    return (
      <div className="p-8 space-y-6">
        <Skeleton className="h-10 w-64" />
        <Skeleton className="h-16 rounded-xl" />
        <div className="grid grid-cols-7 gap-2">
          {Array.from({ length: 7 }).map((_, i) => (
            <Skeleton key={i} className="h-40 rounded-xl" />
          ))}
        </div>
      </div>
    );
  }

  // Group entries by date
  const byDate = new Map<string, PlanEntry[]>();
  for (const e of entries) {
    const existing = byDate.get(e.plan_date) ?? [];
    existing.push(e);
    byDate.set(e.plan_date, existing);
  }

  const today = new Date().toISOString().split("T")[0];
  const overdue = entries.filter(
    (e) => e.status === "pending" && e.plan_date < today
  );

  return (
    <div className="p-8 space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="font-heading text-2xl font-bold tracking-tight">
          Study Plan
        </h2>
        <Button
          variant="ghost"
          className="gap-2 cursor-pointer"
          onClick={() => setShowAiModal(true)}
        >
          <Sparkles className="w-4 h-4 text-amber-400" />
          <span className="text-sm">Reorganizar com AI</span>
        </Button>
      </div>

      {/* Next exam countdown */}
      {nextExam && (
        <div className="bg-card border border-border rounded-xl p-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Clock className="w-5 h-5 text-primary" />
            <div>
              <p className="text-sm font-medium">Próximo exame</p>
              <p className="text-xs text-muted-foreground">
                {nextExam.paper_name} — {nextExam.exam_date}
              </p>
            </div>
          </div>
          <Badge
            variant="secondary"
            className={cn(
              "text-sm font-bold",
              nextExam.days_remaining <= 7
                ? "text-red-400"
                : nextExam.days_remaining <= 14
                  ? "text-amber-400"
                  : "text-emerald-400"
            )}
          >
            {nextExam.days_remaining}d
          </Badge>
        </div>
      )}

      {/* Overdue banner */}
      {overdue.length > 0 && (
        <div className="bg-red-950/20 border border-red-800/30 rounded-xl p-4 flex items-center gap-3">
          <AlertTriangle className="w-5 h-5 text-red-400 shrink-0" />
          <p className="text-sm text-red-300">
            {overdue.length} bloco{overdue.length > 1 ? "s" : ""} atrasado
            {overdue.length > 1 ? "s" : ""}
          </p>
        </div>
      )}

      {/* Week navigation */}
      <div className="flex items-center justify-between">
        <Button
          variant="ghost"
          size="sm"
          className="cursor-pointer"
          onClick={() => setWeekOffset((w) => w - 1)}
        >
          <ChevronLeft className="w-4 h-4" />
        </Button>
        <div className="text-center">
          <p className="text-sm font-medium">{weekLabel}</p>
          {weekOffset !== 0 && (
            <button
              onClick={() => setWeekOffset(0)}
              className="text-[10px] text-primary hover:underline cursor-pointer"
            >
              Voltar a esta semana
            </button>
          )}
        </div>
        <Button
          variant="ghost"
          size="sm"
          className="cursor-pointer"
          onClick={() => setWeekOffset((w) => w + 1)}
        >
          <ChevronRight className="w-4 h-4" />
        </Button>
      </div>

      {/* Day grid */}
      <div className="grid grid-cols-7 gap-2">
        {weekDates.map((date, i) => {
          const dayEntries = byDate.get(date) ?? [];
          const isToday = date === today;
          const isPast = date < today;

          return (
            <div
              key={date}
              className={cn(
                "min-h-[160px] rounded-xl border p-2 space-y-1.5",
                isToday
                  ? "border-primary/40 bg-primary/5"
                  : isPast
                    ? "border-border/50 bg-muted/30"
                    : "border-border bg-card"
              )}
            >
              <div className="flex items-center justify-between px-1">
                <span className="text-[10px] font-medium text-muted-foreground">
                  {DAY_LABELS[i]}
                </span>
                <span
                  className={cn(
                    "text-[10px] tabular-nums",
                    isToday ? "text-primary font-bold" : "text-muted-foreground"
                  )}
                >
                  {date.slice(5)}
                </span>
              </div>

              {dayEntries.map((entry) => {
                const meta = getSubjectMeta(entry.subject_code);
                const status = STATUS_STYLES[entry.status] ?? STATUS_STYLES.pending;
                const isExam = entry.study_type === "exam";

                return (
                  <button
                    key={entry.id}
                    onClick={() => openEdit(entry)}
                    className={cn(
                      "w-full text-left p-1.5 rounded-lg cursor-pointer transition-all",
                      "hover:ring-1 hover:ring-primary/30",
                      status.bg,
                      isExam && "border border-red-800/40 bg-red-950/20"
                    )}
                  >
                    <div className="flex items-center gap-1">
                      <div
                        className={cn("w-1.5 h-1.5 rounded-full shrink-0", meta.accent.replace("text-", "bg-"))}
                      />
                      <span
                        className={cn(
                          "text-[10px] font-medium truncate",
                          entry.status === "skipped" && "line-through",
                          entry.status === "done" ? "text-emerald-400" : status.text
                        )}
                      >
                        {isExam ? "EXAME" : entry.title.split(":")[0]}
                      </span>
                    </div>
                    {entry.planned_hours > 0 && (
                      <span className="text-[9px] text-muted-foreground/70 pl-2.5">
                        {entry.planned_hours}h
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          );
        })}
      </div>

      {/* Edit modal */}
      <Dialog open={!!selected} onOpenChange={() => setSelected(null)}>
        <DialogContent className="bg-card border-border">
          <DialogHeader>
            <DialogTitle className="font-heading">{selected?.title}</DialogTitle>
          </DialogHeader>
          {selected && (
            <div className="space-y-4">
              <div>
                <label className="text-xs text-muted-foreground mb-1 block">Status</label>
                <select
                  value={editStatus}
                  onChange={(e) => setEditStatus(e.target.value)}
                  className="w-full bg-secondary border border-border rounded-lg px-3 py-2 text-sm"
                >
                  <option value="pending">Pending</option>
                  <option value="done">Done</option>
                  <option value="skipped">Skipped</option>
                </select>
              </div>
              <div>
                <label className="text-xs text-muted-foreground mb-1 block">Data</label>
                <Input
                  type="date"
                  value={editDate}
                  onChange={(e) => setEditDate(e.target.value)}
                />
              </div>
              <div>
                <label className="text-xs text-muted-foreground mb-1 block">Notas</label>
                <textarea
                  value={editNotes}
                  onChange={(e) => setEditNotes(e.target.value)}
                  placeholder="Notas opcionais..."
                  className="w-full bg-secondary border border-border rounded-lg px-3 py-2 text-sm min-h-[80px] resize-none"
                />
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="ghost" onClick={() => setSelected(null)} className="cursor-pointer">
              Cancelar
            </Button>
            <Button onClick={saveEdit} className="cursor-pointer">
              <Check className="w-4 h-4 mr-1" /> Guardar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* AI Reschedule modal */}
      <Dialog open={showAiModal} onOpenChange={() => { setShowAiModal(false); setAiProposal(null); }}>
        <DialogContent className="bg-card border-border max-w-2xl">
          <DialogHeader>
            <DialogTitle className="font-heading flex items-center gap-2">
              <Sparkles className="w-5 h-5 text-amber-400" />
              Reorganizar com AI
            </DialogTitle>
          </DialogHeader>

          {!aiProposal ? (
            <div className="space-y-4">
              <div>
                <label className="text-xs text-muted-foreground mb-1 block">
                  Porquê reorganizar?
                </label>
                <textarea
                  value={aiReason}
                  onChange={(e) => setAiReason(e.target.value)}
                  placeholder="Ex: estive doente 2 dias, preciso de recuperar..."
                  className="w-full bg-secondary border border-border rounded-lg px-3 py-2 text-sm min-h-[80px] resize-none"
                />
              </div>
              <div>
                <label className="text-xs text-muted-foreground mb-1 block">
                  Horas disponíveis por dia: {aiHours}h
                </label>
                <input
                  type="range"
                  min={1}
                  max={10}
                  value={aiHours}
                  onChange={(e) => setAiHours(Number(e.target.value))}
                  className="w-full"
                />
              </div>
              <DialogFooter>
                <Button variant="ghost" onClick={() => setShowAiModal(false)} className="cursor-pointer">
                  Cancelar
                </Button>
                <Button
                  onClick={handleAiGenerate}
                  disabled={aiLoading || !aiReason.trim()}
                  className="cursor-pointer"
                >
                  {aiLoading ? (
                    <Loader2 className="w-4 h-4 mr-1 animate-spin" />
                  ) : (
                    <Sparkles className="w-4 h-4 mr-1" />
                  )}
                  Gerar proposta
                </Button>
              </DialogFooter>
            </div>
          ) : (
            <div className="space-y-4">
              <p className="text-sm text-muted-foreground">{aiProposal.reasoning}</p>
              <div className="max-h-[300px] overflow-y-auto space-y-1">
                {aiProposal.entries.map((e, i) => (
                  <div
                    key={i}
                    className="flex items-center gap-2 text-sm bg-secondary rounded-lg px-3 py-2"
                  >
                    <span className="text-xs text-muted-foreground tabular-nums w-20">
                      {e.plan_date as string}
                    </span>
                    <Badge variant="secondary" className="text-[10px]">
                      {e.subject_code as string}
                    </Badge>
                    <span className="flex-1 truncate">{e.title as string}</span>
                    <span className="text-xs text-muted-foreground">
                      {e.planned_hours as number}h
                    </span>
                  </div>
                ))}
              </div>
              <DialogFooter>
                <Button
                  variant="ghost"
                  onClick={() => setAiProposal(null)}
                  className="cursor-pointer"
                >
                  <X className="w-4 h-4 mr-1" /> Voltar
                </Button>
                <Button onClick={handleAiApply} className="cursor-pointer">
                  <Check className="w-4 h-4 mr-1" /> Aprovar e aplicar
                </Button>
              </DialogFooter>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
