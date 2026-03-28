"use client";

import { useEffect, useState, useCallback } from "react";
import {
  fetchPrompts,
  updatePromptContent,
  fetchPromptVersions,
  revertPrompt,
  aiRewritePrompt,
} from "@/lib/api";
import { useAuth } from "@/lib/auth-context";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  ArrowLeft,
  Save,
  History,
  Sparkles,
  RotateCcw,
  Loader2,
  Check,
} from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

interface Prompt {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  content: string;
  version: number;
  is_active: boolean;
}

interface PromptVersion {
  id: string;
  prompt_id: string;
  content: string;
  version: number;
  change_note: string | null;
  created_at: string;
}

export function PromptsView() {
  const { pin } = useAuth();
  const [prompts, setPrompts] = useState<Prompt[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<Prompt | null>(null);
  const [editContent, setEditContent] = useState("");
  const [changeNote, setChangeNote] = useState("");
  const [saving, setSaving] = useState(false);
  const [versions, setVersions] = useState<PromptVersion[]>([]);
  const [showVersions, setShowVersions] = useState(false);
  const [aiDescription, setAiDescription] = useState("");
  const [aiPreview, setAiPreview] = useState<string | null>(null);
  const [aiLoading, setAiLoading] = useState(false);

  const loadPrompts = useCallback(async () => {
    setLoading(true);
    try {
      const data = await fetchPrompts();
      setPrompts(Array.isArray(data) ? data : []);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadPrompts();
  }, [loadPrompts]);

  const selectPrompt = (p: Prompt) => {
    setSelected(p);
    setEditContent(p.content);
    setChangeNote("");
    setShowVersions(false);
    setAiPreview(null);
    setAiDescription("");
  };

  const handleSave = async () => {
    if (!selected || !pin || !changeNote.trim()) {
      toast.error("Nota da alteração é obrigatória");
      return;
    }
    setSaving(true);
    try {
      const updated = await updatePromptContent(selected.id, pin, {
        content: editContent,
        change_note: changeNote,
      });
      setSelected(updated);
      setPrompts((prev) => prev.map((p) => (p.id === updated.id ? updated : p)));
      setChangeNote("");
      toast.success(`Prompt v${updated.version} guardado`);
    } catch {
      toast.error("Falhou a guardar");
    } finally {
      setSaving(false);
    }
  };

  const loadVersions = async () => {
    if (!selected) return;
    setShowVersions(!showVersions);
    if (!showVersions) {
      try {
        const data = await fetchPromptVersions(selected.id);
        setVersions(Array.isArray(data) ? data : []);
      } catch {
        toast.error("Falhou a carregar versões");
      }
    }
  };

  const handleRevert = async (versionId: string) => {
    if (!selected || !pin) return;
    try {
      const updated = await revertPrompt(selected.id, pin, versionId);
      setSelected(updated);
      setEditContent(updated.content);
      setPrompts((prev) => prev.map((p) => (p.id === updated.id ? updated : p)));
      toast.success(`Revertido para v${updated.version}`);
    } catch {
      toast.error("Falhou a reverter");
    }
  };

  const handleAiRewrite = async () => {
    if (!selected || !pin || !aiDescription.trim()) return;
    setAiLoading(true);
    try {
      const result = await aiRewritePrompt(selected.id, pin, aiDescription);
      setAiPreview(result.content);
    } catch {
      toast.error("Falhou a gerar com AI");
    } finally {
      setAiLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="p-8 space-y-6">
        <Skeleton className="h-10 w-48" />
        <div className="space-y-3">
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="h-20 rounded-xl" />
          ))}
        </div>
      </div>
    );
  }

  // Prompt list
  if (!selected) {
    return (
      <div className="p-8 space-y-6">
        <h2 className="font-heading text-2xl font-bold tracking-tight">
          Prompts
        </h2>
        <div className="space-y-3">
          {prompts.map((p) => (
            <button
              key={p.id}
              onClick={() => selectPrompt(p)}
              className={cn(
                "w-full text-left p-5 rounded-xl cursor-pointer",
                "bg-card border border-border",
                "hover:border-primary/30 hover:bg-secondary",
                "transition-all duration-200"
              )}
            >
              <div className="flex items-center justify-between mb-1">
                <div className="flex items-center gap-2">
                  <Badge variant="secondary" className="text-[10px] font-mono">
                    {p.slug}
                  </Badge>
                  <span className="text-sm font-semibold">{p.name}</span>
                </div>
                <span className="text-xs text-muted-foreground tabular-nums">
                  v{p.version}
                </span>
              </div>
              {p.description && (
                <p className="text-xs text-muted-foreground">{p.description}</p>
              )}
              <p className="text-[10px] text-muted-foreground/60 mt-1">
                {p.content.length} chars
              </p>
            </button>
          ))}
        </div>
      </div>
    );
  }

  // Editor
  return (
    <div className="p-8 space-y-6">
      {/* Header */}
      <div className="space-y-2">
        <button
          onClick={() => setSelected(null)}
          className="flex items-center gap-1.5 text-muted-foreground hover:text-foreground transition-colors cursor-pointer text-sm"
        >
          <ArrowLeft className="w-4 h-4" />
          Voltar
        </button>
        <div className="flex items-center gap-3">
          <Badge variant="secondary" className="font-mono text-xs">
            {selected.slug}
          </Badge>
          <h2 className="font-heading text-2xl font-bold tracking-tight">
            {selected.name}
          </h2>
          <span className="text-xs text-muted-foreground">v{selected.version}</span>
        </div>
      </div>

      {/* Textarea */}
      <textarea
        value={editContent}
        onChange={(e) => setEditContent(e.target.value)}
        className="w-full bg-secondary border border-border rounded-xl px-4 py-3 text-sm font-mono leading-relaxed min-h-[300px] resize-y"
      />

      {/* Save bar */}
      <div className="flex items-center gap-3">
        <Input
          value={changeNote}
          onChange={(e) => setChangeNote(e.target.value)}
          placeholder="Nota da alteração (obrigatório)..."
          className="flex-1"
          onKeyDown={(e) => {
            if (e.key === "Enter") handleSave();
          }}
        />
        <Button onClick={handleSave} disabled={saving || !changeNote.trim()} className="cursor-pointer">
          {saving ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : <Save className="w-4 h-4 mr-1" />}
          Guardar
        </Button>
        <Button variant="ghost" onClick={loadVersions} className="cursor-pointer">
          <History className="w-4 h-4 mr-1" />
          {showVersions ? "Esconder" : "Histórico"}
        </Button>
      </div>

      {/* Versions */}
      {showVersions && (
        <div className="space-y-2">
          <h3 className="text-sm font-semibold">Versões anteriores</h3>
          {versions.length === 0 ? (
            <p className="text-xs text-muted-foreground">Sem versões anteriores</p>
          ) : (
            versions.map((v) => (
              <div
                key={v.id}
                className="bg-card border border-border rounded-lg p-3 flex items-center justify-between"
              >
                <div>
                  <span className="text-xs font-mono text-muted-foreground">
                    v{v.version}
                  </span>
                  <span className="text-xs text-muted-foreground mx-2">—</span>
                  <span className="text-xs">{v.change_note ?? "—"}</span>
                  <span className="text-xs text-muted-foreground mx-2">
                    {new Date(v.created_at).toLocaleDateString()}
                  </span>
                </div>
                <Button
                  size="sm"
                  variant="ghost"
                  className="cursor-pointer"
                  onClick={() => handleRevert(v.id)}
                >
                  <RotateCcw className="w-3 h-3 mr-1" /> Reverter
                </Button>
              </div>
            ))
          )}
        </div>
      )}

      {/* AI Rewrite */}
      <div className="border-t border-border pt-6 space-y-3">
        <h3 className="text-sm font-semibold flex items-center gap-2">
          <Sparkles className="w-4 h-4 text-amber-400" />
          AI Rewrite
        </h3>
        <div className="flex items-center gap-2">
          <Input
            value={aiDescription}
            onChange={(e) => setAiDescription(e.target.value)}
            placeholder="Descreve o que queres mudar..."
            className="flex-1"
          />
          <Button
            onClick={handleAiRewrite}
            disabled={aiLoading || !aiDescription.trim()}
            className="cursor-pointer"
          >
            {aiLoading ? (
              <Loader2 className="w-4 h-4 mr-1 animate-spin" />
            ) : (
              <Sparkles className="w-4 h-4 mr-1" />
            )}
            Gerar
          </Button>
        </div>

        {aiPreview && (
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <p className="text-[10px] text-muted-foreground mb-1">ACTUAL</p>
                <pre className="bg-secondary border border-border rounded-lg p-3 text-xs font-mono whitespace-pre-wrap max-h-[200px] overflow-y-auto">
                  {editContent.slice(0, 500)}...
                </pre>
              </div>
              <div>
                <p className="text-[10px] text-amber-400 mb-1">PROPOSTA AI</p>
                <pre className="bg-amber-950/10 border border-amber-800/20 rounded-lg p-3 text-xs font-mono whitespace-pre-wrap max-h-[200px] overflow-y-auto">
                  {aiPreview.slice(0, 500)}...
                </pre>
              </div>
            </div>
            <Button
              variant="ghost"
              className="cursor-pointer"
              onClick={() => {
                setEditContent(aiPreview);
                setAiPreview(null);
                setAiDescription("");
                toast.success("Copiado para o editor — revê e guarda");
              }}
            >
              <Check className="w-4 h-4 mr-1" /> Aplicar ao editor
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}
