"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import {
  fetchExamCalendar,
  fetchStudyPlanWeek,
  updatePlanEntry,
  reschedulePlanEntry,
  aiReschedule,
  applyReschedule,
  createPlanEntry,
  createPlanEntries,
  parseScheduleImage,
  fetchSubjectTopicsList,
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
  Plus,
  Upload,
  Camera,
  Trash2,
} from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

const SUBJECT_OPTIONS = [
  { code: "0620", name: "Chemistry" },
  { code: "0625", name: "Physics" },
  { code: "0610", name: "Biology" },
  { code: "0478", name: "CS" },
  { code: "0520", name: "French" },
  { code: "0504", name: "Portuguese" },
  { code: "0475", name: "Eng. Lit" },
  { code: "0500", name: "English" },
  { code: "ART", name: "Art" },
  { code: "PERSONAL", name: "Personal" },
] as const;

const SUBJECT_NAMES: Record<string, string> = Object.fromEntries(
  SUBJECT_OPTIONS.map((s) => [s.code, s.name])
);

const STUDY_TYPES = ["study", "practice", "exam", "final_prep", "mixed"] as const;

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

  // Manual entry modal
  const [showAddModal, setShowAddModal] = useState(false);
  const [addDate, setAddDate] = useState("");
  const [addSubject, setAddSubject] = useState("0620");
  const [addTitle, setAddTitle] = useState("");
  const [addHours, setAddHours] = useState(1.5);
  const [addType, setAddType] = useState<string>("study");
  const [addStartTime, setAddStartTime] = useState("");
  const [addEndTime, setAddEndTime] = useState("");
  const [addSaving, setAddSaving] = useState(false);
  const [addTopicIds, setAddTopicIds] = useState<string[]>([]);
  const [availableTopics, setAvailableTopics] = useState<Array<{ id: string; topic_code: string; topic_name: string }>>([]);
  const [topicsLoading, setTopicsLoading] = useState(false);

  // Upload/parse modal
  const [showUploadModal, setShowUploadModal] = useState(false);
  const [uploadFile, setUploadFile] = useState<File | null>(null);
  const [uploadPreview, setUploadPreview] = useState<string | null>(null);
  const [uploadParsing, setUploadParsing] = useState(false);
  const [uploadEntries, setUploadEntries] = useState<Array<Record<string, unknown>> | null>(null);
  const [uploadNotes, setUploadNotes] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

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

  // Load topics when subject changes in add modal
  useEffect(() => {
    if (!showAddModal) return;
    // Non-study subjects have no topics
    if (addSubject === "ART" || addSubject === "PERSONAL") {
      setAvailableTopics([]);
      setAddTopicIds([]);
      return;
    }
    setTopicsLoading(true);
    fetchSubjectTopicsList(addSubject)
      .then((result) => {
        // API returns { subject, topics } — extract the topics array
        const raw = Array.isArray(result) ? result : (result as { topics: unknown[] }).topics ?? [];
        const sorted = (raw as Array<{ id: string; topic_code: string; topic_name: string }>)
          .sort((a, b) => a.topic_code.localeCompare(b.topic_code, undefined, { numeric: true }));
        setAvailableTopics(sorted);
      })
      .catch(() => setAvailableTopics([]))
      .finally(() => setTopicsLoading(false));
    setAddTopicIds([]);
  }, [addSubject, showAddModal]);

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

  // --- Manual entry handlers ---
  const openAddModal = (date?: string) => {
    setAddDate(date ?? weekDates[0]);
    setAddSubject("0620");
    setAddTitle("");
    setAddHours(1.5);
    setAddType("study");
    setAddStartTime("");
    setAddEndTime("");
    setShowAddModal(true);
  };

  const handleAddEntry = async () => {
    if (!pin || !addTitle.trim()) return;
    setAddSaving(true);
    try {
      await createPlanEntry(pin, {
        plan_date: addDate,
        subject_code: addSubject,
        title: addTitle.trim(),
        planned_hours: addHours,
        study_type: addType,
        start_time: addStartTime || undefined,
        end_time: addEndTime || undefined,
        syllabus_topic_ids: addTopicIds.length > 0 ? addTopicIds : undefined,
      });
      toast.success("Block added");
      setShowAddModal(false);
      load();
    } catch {
      toast.error("Failed to add block");
    } finally {
      setAddSaving(false);
    }
  };

  // --- Upload/parse handlers ---
  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploadFile(file);
    setUploadEntries(null);
    setUploadNotes(null);

    if (file.type.startsWith("image/")) {
      const reader = new FileReader();
      reader.onload = () => setUploadPreview(reader.result as string);
      reader.readAsDataURL(file);
    } else {
      setUploadPreview(null);
    }
  };

  const handleParseUpload = async () => {
    if (!pin || !uploadFile) return;
    setUploadParsing(true);
    try {
      const result = await parseScheduleImage(pin, uploadFile);
      setUploadEntries(result.entries);
      setUploadNotes(result.notes ?? null);
    } catch {
      toast.error("Failed to parse schedule");
    } finally {
      setUploadParsing(false);
    }
  };

  const handleRemoveUploadEntry = (index: number) => {
    if (!uploadEntries) return;
    setUploadEntries(uploadEntries.filter((_, i) => i !== index));
  };

  const handleApplyUpload = async () => {
    if (!pin || !uploadEntries?.length) return;
    try {
      await createPlanEntries(pin, { entries: uploadEntries });
      toast.success(`${uploadEntries.length} blocks added`);
      setShowUploadModal(false);
      setUploadFile(null);
      setUploadPreview(null);
      setUploadEntries(null);
      setUploadNotes(null);
      load();
    } catch {
      toast.error("Failed to create entries");
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
        <div className="flex items-center gap-2">
          <Button
            variant="ghost"
            size="sm"
            className="gap-1.5 cursor-pointer"
            onClick={() => setShowUploadModal(true)}
          >
            <Camera className="w-4 h-4 text-sky-400" />
            <span className="text-sm">Upload Schedule</span>
          </Button>
          <Button
            variant="ghost"
            size="sm"
            className="gap-1.5 cursor-pointer"
            onClick={() => openAddModal()}
          >
            <Plus className="w-4 h-4 text-emerald-400" />
            <span className="text-sm">Add Block</span>
          </Button>
          <Button
            variant="ghost"
            size="sm"
            className="gap-1.5 cursor-pointer"
            onClick={() => setShowAiModal(true)}
          >
            <Sparkles className="w-4 h-4 text-amber-400" />
            <span className="text-sm">Reorganise AI</span>
          </Button>
        </div>
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

      {/* Add block modal */}
      <Dialog open={showAddModal} onOpenChange={setShowAddModal}>
        <DialogContent className="bg-card border-border">
          <DialogHeader>
            <DialogTitle className="font-heading flex items-center gap-2">
              <Plus className="w-5 h-5 text-emerald-400" />
              Add Study Block
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs text-muted-foreground mb-1 block">Date</label>
                <Input type="date" value={addDate} onChange={(e) => setAddDate(e.target.value)} />
              </div>
              <div>
                <label className="text-xs text-muted-foreground mb-1 block">Subject</label>
                <select
                  value={addSubject}
                  onChange={(e) => setAddSubject(e.target.value)}
                  className="w-full bg-secondary border border-border rounded-lg px-3 py-2 text-sm"
                >
                  {SUBJECT_OPTIONS.map((s) => (
                    <option key={s.code} value={s.code}>{s.name}</option>
                  ))}
                </select>
              </div>
            </div>
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">Title</label>
              <Input
                value={addTitle}
                onChange={(e) => setAddTitle(e.target.value)}
                placeholder="e.g. Stoichiometry revision"
              />
            </div>
            {availableTopics.length > 0 && (
              <div>
                <label className="text-xs text-muted-foreground mb-1 block">
                  Topics {addTopicIds.length > 0 && `(${addTopicIds.length} selected)`}
                </label>
                {topicsLoading ? (
                  <Skeleton className="h-24 rounded-lg" />
                ) : (
                  <div className="max-h-[160px] overflow-y-auto border border-border rounded-lg p-1.5 space-y-0.5">
                    {availableTopics.map((t) => {
                      const checked = addTopicIds.includes(t.id);
                      return (
                        <label
                          key={t.id}
                          className={cn(
                            "flex items-center gap-2 px-2 py-1.5 rounded-md cursor-pointer text-sm transition-colors",
                            checked ? "bg-primary/10 text-foreground" : "hover:bg-secondary text-muted-foreground"
                          )}
                        >
                          <input
                            type="checkbox"
                            checked={checked}
                            onChange={() =>
                              setAddTopicIds((prev) =>
                                checked ? prev.filter((id) => id !== t.id) : [...prev, t.id]
                              )
                            }
                            className="rounded border-border shrink-0"
                          />
                          <span className="text-xs">
                            <span className="text-muted-foreground/60">{t.topic_code.replace(/_/g, " ")}</span>
                            {" — "}
                            {t.topic_name}
                          </span>
                        </label>
                      );
                    })}
                  </div>
                )}
              </div>
            )}
            <div className="grid grid-cols-3 gap-3">
              <div>
                <label className="text-xs text-muted-foreground mb-1 block">Hours</label>
                <Input
                  type="number"
                  step={0.5}
                  min={0.5}
                  max={8}
                  value={addHours}
                  onChange={(e) => setAddHours(Number(e.target.value))}
                />
              </div>
              <div>
                <label className="text-xs text-muted-foreground mb-1 block">Start</label>
                <Input type="time" value={addStartTime} onChange={(e) => setAddStartTime(e.target.value)} />
              </div>
              <div>
                <label className="text-xs text-muted-foreground mb-1 block">End</label>
                <Input type="time" value={addEndTime} onChange={(e) => setAddEndTime(e.target.value)} />
              </div>
            </div>
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">Type</label>
              <select
                value={addType}
                onChange={(e) => setAddType(e.target.value)}
                className="w-full bg-secondary border border-border rounded-lg px-3 py-2 text-sm"
              >
                {STUDY_TYPES.map((t) => (
                  <option key={t} value={t}>{t.replace("_", " ")}</option>
                ))}
              </select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setShowAddModal(false)} className="cursor-pointer">
              Cancel
            </Button>
            <Button onClick={handleAddEntry} disabled={addSaving || !addTitle.trim()} className="cursor-pointer">
              {addSaving ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : <Check className="w-4 h-4 mr-1" />}
              Add Block
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Upload schedule modal */}
      <Dialog
        open={showUploadModal}
        onOpenChange={() => {
          setShowUploadModal(false);
          setUploadFile(null);
          setUploadPreview(null);
          setUploadEntries(null);
          setUploadNotes(null);
        }}
      >
        <DialogContent className="bg-card border-border max-w-2xl">
          <DialogHeader>
            <DialogTitle className="font-heading flex items-center gap-2">
              <Camera className="w-5 h-5 text-sky-400" />
              Upload Schedule
            </DialogTitle>
          </DialogHeader>

          {!uploadEntries ? (
            <div className="space-y-4">
              <p className="text-sm text-muted-foreground">
                Upload a photo of a handwritten schedule, a screenshot, or a PDF. AI will extract the study blocks.
              </p>

              <input
                ref={fileInputRef}
                type="file"
                accept="image/*,.pdf"
                onChange={handleFileSelect}
                className="hidden"
              />

              {!uploadFile ? (
                <button
                  onClick={() => fileInputRef.current?.click()}
                  className="w-full border-2 border-dashed border-border rounded-xl p-8 flex flex-col items-center gap-3 hover:border-primary/40 transition-colors cursor-pointer"
                >
                  <Upload className="w-8 h-8 text-muted-foreground" />
                  <span className="text-sm text-muted-foreground">
                    Click to upload image or PDF
                  </span>
                </button>
              ) : (
                <div className="space-y-3">
                  {uploadPreview && (
                    <img
                      src={uploadPreview}
                      alt="Schedule preview"
                      className="max-h-[300px] rounded-lg border border-border object-contain mx-auto"
                    />
                  )}
                  <div className="flex items-center justify-between bg-secondary rounded-lg px-3 py-2">
                    <span className="text-sm truncate">{uploadFile.name}</span>
                    <button
                      onClick={() => {
                        setUploadFile(null);
                        setUploadPreview(null);
                        if (fileInputRef.current) fileInputRef.current.value = "";
                      }}
                      className="text-muted-foreground hover:text-foreground cursor-pointer"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              )}

              <DialogFooter>
                <Button variant="ghost" onClick={() => setShowUploadModal(false)} className="cursor-pointer">
                  Cancel
                </Button>
                <Button
                  onClick={handleParseUpload}
                  disabled={uploadParsing || !uploadFile}
                  className="cursor-pointer"
                >
                  {uploadParsing ? (
                    <Loader2 className="w-4 h-4 mr-1 animate-spin" />
                  ) : (
                    <Sparkles className="w-4 h-4 mr-1" />
                  )}
                  Parse with AI
                </Button>
              </DialogFooter>
            </div>
          ) : (
            <div className="space-y-4">
              {uploadNotes && (
                <p className="text-sm text-muted-foreground italic">{uploadNotes}</p>
              )}

              <div className="max-h-[400px] overflow-y-auto space-y-1.5">
                {uploadEntries.map((e, i) => (
                  <div
                    key={i}
                    className="flex items-center gap-2 text-sm bg-secondary rounded-lg px-3 py-2"
                  >
                    <span className="text-xs text-muted-foreground tabular-nums w-20 shrink-0">
                      {e.plan_date as string}
                    </span>
                    {typeof e.start_time === "string" && (
                      <span className="text-[10px] text-muted-foreground/70 tabular-nums w-12 shrink-0">
                        {e.start_time}
                      </span>
                    )}
                    <Badge variant="secondary" className="text-[10px] shrink-0">
                      {SUBJECT_NAMES[e.subject_code as string] ?? e.subject_code}
                    </Badge>
                    <span className="flex-1 truncate">{e.title as string}</span>
                    <span className="text-xs text-muted-foreground shrink-0">
                      {e.planned_hours as number}h
                    </span>
                    <button
                      onClick={() => handleRemoveUploadEntry(i)}
                      className="text-muted-foreground hover:text-red-400 cursor-pointer shrink-0"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                ))}
              </div>

              {uploadEntries.length === 0 && (
                <p className="text-sm text-muted-foreground text-center py-4">
                  All entries removed. Go back to try again.
                </p>
              )}

              <DialogFooter>
                <Button
                  variant="ghost"
                  onClick={() => { setUploadEntries(null); setUploadNotes(null); }}
                  className="cursor-pointer"
                >
                  <X className="w-4 h-4 mr-1" /> Back
                </Button>
                <Button
                  onClick={handleApplyUpload}
                  disabled={!uploadEntries.length}
                  className="cursor-pointer"
                >
                  <Check className="w-4 h-4 mr-1" /> Add {uploadEntries.length} blocks
                </Button>
              </DialogFooter>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
