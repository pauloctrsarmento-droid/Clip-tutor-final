"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { fetchStudent, updateStudentProfile, generateStudentProfile } from "@/lib/api";
import { useAuth } from "@/lib/auth-context";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import {
  Pencil,
  Save,
  X,
  Upload,
  Sparkles,
  Loader2,
  Check,
  GraduationCap,
} from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

interface Student {
  id: string;
  name: string;
  tutor_prompt: string | null;
  current_streak: number;
  longest_streak: number;
}

export function StudentProfileView() {
  const { pin } = useAuth();
  const [student, setStudent] = useState<Student | null>(null);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(false);
  const [editText, setEditText] = useState("");
  const [saving, setSaving] = useState(false);
  const [pdfFile, setPdfFile] = useState<File | null>(null);
  const [aiLoading, setAiLoading] = useState(false);
  const [aiProposal, setAiProposal] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await fetchStudent();
      setStudent(data);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const startEdit = () => {
    setEditing(true);
    setEditText(student?.tutor_prompt ?? "");
  };

  const handleSave = async () => {
    if (!student || !pin) return;
    setSaving(true);
    try {
      const updated = await updateStudentProfile(student.id, pin, editText);
      setStudent(updated);
      setEditing(false);
      toast.success("Perfil actualizado");
    } catch {
      toast.error("Falhou a guardar");
    } finally {
      setSaving(false);
    }
  };

  const handleFileSelect = (file: File) => {
    if (file.type !== "application/pdf") {
      toast.error("Apenas ficheiros PDF");
      return;
    }
    setPdfFile(file);
    setAiProposal(null);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer.files[0];
    if (file) handleFileSelect(file);
  };

  const handleGenerateProfile = async () => {
    if (!student || !pin || !pdfFile) return;
    setAiLoading(true);
    try {
      const result = await generateStudentProfile(student.id, pin, pdfFile);
      setAiProposal(result.profile);
    } catch {
      toast.error("Falhou a gerar perfil");
    } finally {
      setAiLoading(false);
    }
  };

  const handleApplyProposal = async () => {
    if (!student || !pin || !aiProposal) return;
    setSaving(true);
    try {
      const updated = await updateStudentProfile(student.id, pin, aiProposal);
      setStudent(updated);
      setAiProposal(null);
      setPdfFile(null);
      toast.success("Novo perfil aplicado");
    } catch {
      toast.error("Falhou a aplicar");
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="p-8 space-y-6">
        <Skeleton className="h-10 w-48" />
        <Skeleton className="h-24 rounded-xl" />
        <Skeleton className="h-64 rounded-xl" />
      </div>
    );
  }

  if (!student) return null;

  return (
    <div className="p-8 space-y-8">
      <h2 className="font-heading text-2xl font-bold tracking-tight">
        Perfil do Aluno
      </h2>

      {/* Student info card */}
      <div className="bg-card border border-border rounded-xl p-6 flex items-center gap-5">
        <div className="w-14 h-14 rounded-xl bg-primary/10 flex items-center justify-center">
          <GraduationCap className="w-7 h-7 text-primary" />
        </div>
        <div>
          <h3 className="font-heading text-xl font-bold">{student.name}</h3>
          <p className="text-sm text-muted-foreground">
            CLIP — Oporto International School
          </p>
          <p className="text-xs text-muted-foreground">
            Cambridge IGCSE 2026 · Candidate 0256
          </p>
        </div>
      </div>

      {/* Profile display / editor */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="font-heading text-lg font-semibold">
            Perfil Pedagógico
          </h3>
          {!editing && (
            <Button
              variant="ghost"
              size="sm"
              onClick={startEdit}
              className="cursor-pointer"
            >
              <Pencil className="w-4 h-4 mr-1" /> Editar
            </Button>
          )}
        </div>

        {editing ? (
          <div className="space-y-3">
            <textarea
              value={editText}
              onChange={(e) => setEditText(e.target.value)}
              className="w-full bg-secondary border border-border rounded-xl px-4 py-3 text-sm font-mono leading-relaxed min-h-[400px] resize-y"
            />
            <div className="flex gap-2">
              <Button onClick={handleSave} disabled={saving} className="cursor-pointer">
                {saving ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : <Save className="w-4 h-4 mr-1" />}
                Guardar
              </Button>
              <Button variant="ghost" onClick={() => setEditing(false)} className="cursor-pointer">
                <X className="w-4 h-4 mr-1" /> Cancelar
              </Button>
            </div>
          </div>
        ) : (
          <div className="bg-card border border-border rounded-xl p-5">
            {student.tutor_prompt ? (
              <pre className="text-sm font-mono whitespace-pre-wrap leading-relaxed text-muted-foreground">
                {student.tutor_prompt}
              </pre>
            ) : (
              <p className="text-sm text-muted-foreground italic">
                Sem perfil pedagógico definido
              </p>
            )}
          </div>
        )}
      </div>

      {/* PDF Upload */}
      <div className="space-y-3 border-t border-border pt-6">
        <h3 className="font-heading text-lg font-semibold flex items-center gap-2">
          <Sparkles className="w-5 h-5 text-amber-400" />
          Gerar Perfil a partir de Teste Psicotécnico
        </h3>

        <div
          onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
          onDragLeave={() => setDragOver(false)}
          onDrop={handleDrop}
          onClick={() => fileRef.current?.click()}
          className={cn(
            "border-2 border-dashed rounded-xl p-8 text-center cursor-pointer transition-all",
            dragOver
              ? "border-primary bg-primary/5"
              : "border-border hover:border-primary/30"
          )}
        >
          <Upload className="w-8 h-8 text-muted-foreground/40 mx-auto mb-2" />
          {pdfFile ? (
            <p className="text-sm">
              <span className="font-medium text-foreground">{pdfFile.name}</span>
              <span className="text-muted-foreground"> ({(pdfFile.size / 1024).toFixed(0)} KB)</span>
            </p>
          ) : (
            <p className="text-sm text-muted-foreground">
              Arrasta o PDF aqui ou clica para escolher
            </p>
          )}
          <input
            ref={fileRef}
            type="file"
            accept=".pdf"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) handleFileSelect(file);
            }}
          />
        </div>

        {pdfFile && !aiProposal && (
          <Button onClick={handleGenerateProfile} disabled={aiLoading} className="cursor-pointer">
            {aiLoading ? (
              <Loader2 className="w-4 h-4 mr-1 animate-spin" />
            ) : (
              <Sparkles className="w-4 h-4 mr-1" />
            )}
            Gerar perfil com AI
          </Button>
        )}

        {/* AI Proposal preview */}
        {aiProposal && (
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <p className="text-[10px] text-muted-foreground mb-1">ACTUAL</p>
                <pre className="bg-secondary border border-border rounded-lg p-3 text-xs font-mono whitespace-pre-wrap max-h-[300px] overflow-y-auto">
                  {(student.tutor_prompt ?? "Sem perfil").slice(0, 800)}
                  {(student.tutor_prompt?.length ?? 0) > 800 ? "..." : ""}
                </pre>
              </div>
              <div>
                <p className="text-[10px] text-amber-400 mb-1">PROPOSTA AI</p>
                <pre className="bg-amber-950/10 border border-amber-800/20 rounded-lg p-3 text-xs font-mono whitespace-pre-wrap max-h-[300px] overflow-y-auto">
                  {aiProposal.slice(0, 800)}
                  {aiProposal.length > 800 ? "..." : ""}
                </pre>
              </div>
            </div>
            <div className="flex gap-2">
              <Button onClick={handleApplyProposal} disabled={saving} className="cursor-pointer">
                {saving ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : <Check className="w-4 h-4 mr-1" />}
                Aplicar novo perfil
              </Button>
              <Button
                variant="ghost"
                onClick={() => { setAiProposal(null); setPdfFile(null); }}
                className="cursor-pointer"
              >
                <X className="w-4 h-4 mr-1" /> Descartar
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
