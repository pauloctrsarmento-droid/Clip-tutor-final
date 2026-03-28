"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { fetchPapers, createPaper, deletePaper } from "@/lib/api";
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
  FileText,
  BookOpen,
  Plus,
  Trash2,
  ExternalLink,
  Upload,
  Loader2,
} from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

interface Paper {
  id: string;
  subject_code: string;
  session: string;
  variant: string;
  year: number;
  total_questions: number;
  total_marks: number;
  qp_url: string | null;
  ms_url: string | null;
}

const SUBJECT_FILTER = [
  { code: "", label: "All" },
  { code: "0620", label: "Chemistry" },
  { code: "0625", label: "Physics" },
  { code: "0610", label: "Biology" },
  { code: "0478", label: "CS" },
  { code: "0520", label: "French" },
  { code: "0504", label: "Portuguese" },
];

export function PapersView() {
  const { pin } = useAuth();
  const [papers, setPapers] = useState<Paper[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState("");
  const [showAdd, setShowAdd] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<Paper | null>(null);
  const [addLoading, setAddLoading] = useState(false);

  // Add form state
  const [addSubject, setAddSubject] = useState("0620");
  const [addSession, setAddSession] = useState("");
  const [addVariant, setAddVariant] = useState("");
  const [addYear, setAddYear] = useState("");
  const qpRef = useRef<HTMLInputElement>(null);
  const msRef = useRef<HTMLInputElement>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await fetchPapers(filter || undefined);
      setPapers(Array.isArray(data) ? data : []);
    } finally {
      setLoading(false);
    }
  }, [filter]);

  useEffect(() => {
    load();
  }, [load]);

  const handleAdd = async () => {
    if (!pin || !addSession || !addVariant || !addYear) {
      toast.error("Fill all fields");
      return;
    }
    const paperId = `${addSubject}_${addSession}_${addVariant}`;
    setAddLoading(true);
    try {
      const qpFile = qpRef.current?.files?.[0];
      const msFile = msRef.current?.files?.[0];
      await createPaper(
        pin,
        {
          id: paperId,
          subject_code: addSubject,
          session: addSession,
          variant: addVariant,
          year: parseInt(addYear),
        },
        qpFile,
        msFile
      );
      toast.success(`Paper ${paperId} added`);
      setShowAdd(false);
      setAddSession("");
      setAddVariant("");
      setAddYear("");
      load();
    } catch {
      toast.error("Failed to add paper");
    } finally {
      setAddLoading(false);
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget || !pin) return;
    try {
      await deletePaper(deleteTarget.id, pin);
      toast.success(`Paper ${deleteTarget.id} deleted`);
      setDeleteTarget(null);
      load();
    } catch {
      toast.error("Failed to delete");
    }
  };

  if (loading) {
    return (
      <div className="p-8 space-y-6">
        <Skeleton className="h-10 w-48" />
        <Skeleton className="h-10 w-full max-w-md" />
        <div className="space-y-2">
          {Array.from({ length: 8 }).map((_, i) => (
            <Skeleton key={i} className="h-14 rounded-xl" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="p-8 space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="font-heading text-2xl font-bold tracking-tight">
          Past Papers
        </h2>
        <Button
          onClick={() => setShowAdd(true)}
          className="cursor-pointer gap-1"
        >
          <Plus className="w-4 h-4" /> Add Paper
        </Button>
      </div>

      {/* Filter */}
      <div className="flex gap-2">
        {SUBJECT_FILTER.map((s) => (
          <button
            key={s.code}
            onClick={() => setFilter(s.code)}
            className={cn(
              "px-3 py-1.5 rounded-lg text-xs font-medium transition-all cursor-pointer",
              filter === s.code
                ? "bg-primary text-primary-foreground"
                : "bg-secondary text-muted-foreground hover:text-foreground"
            )}
          >
            {s.label}
          </button>
        ))}
      </div>

      {/* Stats */}
      <p className="text-sm text-muted-foreground">
        {papers.length} papers
        {filter && ` for ${SUBJECT_FILTER.find((s) => s.code === filter)?.label}`}
      </p>

      {/* Paper list */}
      <div className="space-y-1.5">
        {papers.map((paper) => {
          const meta = getSubjectMeta(paper.subject_code);
          const Icon = meta.icon;

          return (
            <div
              key={paper.id}
              className="group flex items-center gap-3 p-3 rounded-xl bg-card border border-border hover:border-primary/20 transition-all"
            >
              <Icon className={cn("w-4 h-4 shrink-0", meta.accent)} />
              <div className="flex-1 min-w-0">
                <span className="text-sm font-medium">{paper.id}</span>
                <span className="text-xs text-muted-foreground ml-2">
                  {paper.total_questions}q / {paper.total_marks}m
                </span>
              </div>
              <Badge variant="secondary" className="text-[10px] tabular-nums">
                {paper.year}
              </Badge>

              {/* QP + MS buttons */}
              <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                {paper.qp_url && (
                  <a
                    href={paper.qp_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-1 px-2 py-1 rounded-md bg-primary/10 text-primary text-[10px] font-medium hover:bg-primary/20 transition-colors"
                  >
                    <FileText className="w-3 h-3" /> QP
                    <ExternalLink className="w-2.5 h-2.5" />
                  </a>
                )}
                {paper.ms_url && (
                  <a
                    href={paper.ms_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-1 px-2 py-1 rounded-md bg-emerald-500/10 text-emerald-400 text-[10px] font-medium hover:bg-emerald-500/20 transition-colors"
                  >
                    <BookOpen className="w-3 h-3" /> MS
                    <ExternalLink className="w-2.5 h-2.5" />
                  </a>
                )}
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-7 w-7 p-0 cursor-pointer opacity-0 group-hover:opacity-100 hover:text-destructive"
                  onClick={() => setDeleteTarget(paper)}
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </Button>
              </div>
            </div>
          );
        })}

        {papers.length === 0 && (
          <p className="text-sm text-muted-foreground text-center py-12">
            No papers found
          </p>
        )}
      </div>

      {/* Add Paper Modal */}
      <Dialog open={showAdd} onOpenChange={setShowAdd}>
        <DialogContent className="bg-card border-border">
          <DialogHeader>
            <DialogTitle className="font-heading">Add Paper</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">Subject</label>
              <select
                value={addSubject}
                onChange={(e) => setAddSubject(e.target.value)}
                className="w-full bg-secondary border border-border rounded-lg px-3 py-2 text-sm"
              >
                {SUBJECT_FILTER.filter((s) => s.code).map((s) => (
                  <option key={s.code} value={s.code}>{s.label} ({s.code})</option>
                ))}
              </select>
            </div>
            <div className="grid grid-cols-3 gap-3">
              <div>
                <label className="text-xs text-muted-foreground mb-1 block">Session</label>
                <Input
                  value={addSession}
                  onChange={(e) => setAddSession(e.target.value)}
                  placeholder="s23"
                />
              </div>
              <div>
                <label className="text-xs text-muted-foreground mb-1 block">Variant</label>
                <Input
                  value={addVariant}
                  onChange={(e) => setAddVariant(e.target.value)}
                  placeholder="41"
                />
              </div>
              <div>
                <label className="text-xs text-muted-foreground mb-1 block">Year</label>
                <Input
                  value={addYear}
                  onChange={(e) => setAddYear(e.target.value)}
                  placeholder="2023"
                  type="number"
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs text-muted-foreground mb-1 flex items-center gap-1">
                  <Upload className="w-3 h-3" /> Question Paper (PDF)
                </label>
                <input ref={qpRef} type="file" accept=".pdf" className="text-xs w-full" />
              </div>
              <div>
                <label className="text-xs text-muted-foreground mb-1 flex items-center gap-1">
                  <Upload className="w-3 h-3" /> Mark Scheme (PDF)
                </label>
                <input ref={msRef} type="file" accept=".pdf" className="text-xs w-full" />
              </div>
            </div>
            <p className="text-[10px] text-muted-foreground">
              Paper ID: {addSubject}_{addSession}_{addVariant}
            </p>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setShowAdd(false)} className="cursor-pointer">
              Cancel
            </Button>
            <Button onClick={handleAdd} disabled={addLoading} className="cursor-pointer">
              {addLoading ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : <Plus className="w-4 h-4 mr-1" />}
              Add
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete confirmation */}
      <Dialog open={!!deleteTarget} onOpenChange={() => setDeleteTarget(null)}>
        <DialogContent className="bg-card border-border">
          <DialogHeader>
            <DialogTitle className="font-heading">Delete paper?</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            This will delete <strong>{deleteTarget?.id}</strong> and all its questions from the database.
          </p>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setDeleteTarget(null)} className="cursor-pointer">
              Cancel
            </Button>
            <Button variant="destructive" onClick={handleDelete} className="cursor-pointer">
              Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
