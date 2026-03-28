"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { fetchTopicFacts, updateFact, deleteFact, createFact, updateTopic } from "@/lib/api";
import { useAuth } from "@/lib/auth-context";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { ArrowLeft, Plus, Trash2, Check, X, Pencil, Search } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

interface Fact {
  id: string;
  fact_text: string;
  is_active: boolean;
  difficulty: number;
  topic_name: string;
}

interface TopicInfo {
  id: string;
  topic_code: string;
  topic_name: string;
  description: string | null;
}

interface TopicViewProps {
  topicId: string;
  topicInfo?: TopicInfo;
  onBack: () => void;
}

export function TopicView({ topicId, topicInfo, onBack }: TopicViewProps) {
  const { pin } = useAuth();
  const [facts, setFacts] = useState<Fact[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editText, setEditText] = useState("");
  const [newFactText, setNewFactText] = useState("");
  const [showNewFact, setShowNewFact] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<Fact | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [editingDescription, setEditingDescription] = useState(false);
  const [descriptionText, setDescriptionText] = useState(topicInfo?.description ?? "");
  const newFactRef = useRef<HTMLInputElement>(null);
  const editRef = useRef<HTMLInputElement>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const result = await fetchTopicFacts(topicId);
      setFacts(result.filter((f: Fact) => f.is_active));
    } finally {
      setLoading(false);
    }
  }, [topicId]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    if (showNewFact) newFactRef.current?.focus();
  }, [showNewFact]);

  useEffect(() => {
    if (editingId) editRef.current?.focus();
  }, [editingId]);

  const startEdit = (fact: Fact) => {
    setEditingId(fact.id);
    setEditText(fact.fact_text);
  };

  const saveEdit = async () => {
    if (!editingId || !pin || !editText.trim()) return;
    try {
      await updateFact(editingId, pin, { fact_text: editText.trim() });
      setFacts((prev) =>
        prev.map((f) => (f.id === editingId ? { ...f, fact_text: editText.trim() } : f))
      );
      toast.success("Fact updated");
    } catch {
      toast.error("Failed to update");
    }
    setEditingId(null);
  };

  const cancelEdit = () => {
    setEditingId(null);
    setEditText("");
  };

  const handleDelete = async () => {
    if (!deleteTarget || !pin) return;
    try {
      await deleteFact(deleteTarget.id, pin);
      setFacts((prev) => prev.filter((f) => f.id !== deleteTarget.id));
      toast.success("Fact deleted");
    } catch {
      toast.error("Failed to delete");
    }
    setDeleteTarget(null);
  };

  const handleAddFact = async () => {
    if (!pin || !newFactText.trim()) return;
    try {
      const created = await createFact(topicId, pin, newFactText.trim());
      setFacts((prev) => [...prev, created]);
      setNewFactText("");
      setShowNewFact(false);
      toast.success("Fact created");
    } catch {
      toast.error("Failed to create");
    }
  };

  const saveDescription = async () => {
    if (!pin || !topicInfo) return;
    try {
      await updateTopic(topicId, pin, {
        description: descriptionText.trim() || null,
      });
      toast.success("Description updated");
    } catch {
      toast.error("Failed to update description");
    }
    setEditingDescription(false);
  };

  const filtered = facts.filter((f) =>
    f.fact_text.toLowerCase().includes(searchQuery.toLowerCase())
  );

  if (loading) {
    return (
      <div className="p-8 space-y-6">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-6 w-64" />
        <div className="space-y-3">
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="h-16 rounded-xl" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="p-8 space-y-6">
      {/* Header */}
      <div className="space-y-4">
        <button
          onClick={onBack}
          className="flex items-center gap-1.5 text-muted-foreground hover:text-foreground
                     transition-colors duration-200 cursor-pointer text-sm"
        >
          <ArrowLeft className="w-4 h-4" />
          Back to topics
        </button>

        <div className="space-y-2">
          <div className="flex items-center gap-3">
            <Badge variant="secondary" className="font-mono text-xs">
              {topicInfo?.topic_code}
            </Badge>
            <h2 className="font-heading text-2xl font-bold tracking-tight">
              {topicInfo?.topic_name}
            </h2>
          </div>

          {/* Editable description */}
          {editingDescription ? (
            <div className="flex items-center gap-2 max-w-xl">
              <Input
                value={descriptionText}
                onChange={(e) => setDescriptionText(e.target.value)}
                placeholder="Add a description..."
                className="text-sm"
                onKeyDown={(e) => {
                  if (e.key === "Enter") saveDescription();
                  if (e.key === "Escape") setEditingDescription(false);
                }}
              />
              <Button size="sm" variant="ghost" onClick={saveDescription}>
                <Check className="w-4 h-4" />
              </Button>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => setEditingDescription(false)}
              >
                <X className="w-4 h-4" />
              </Button>
            </div>
          ) : (
            <p
              onClick={() => setEditingDescription(true)}
              className={cn(
                "text-sm max-w-xl cursor-pointer transition-colors duration-200 group flex items-center gap-2",
                topicInfo?.description
                  ? "text-muted-foreground hover:text-foreground"
                  : "text-muted-foreground/50 hover:text-muted-foreground italic"
              )}
            >
              {topicInfo?.description ?? "Click to add description..."}
              <Pencil className="w-3 h-3 opacity-0 group-hover:opacity-100 transition-opacity" />
            </p>
          )}
        </div>

        {/* Stats bar */}
        <div className="flex items-center gap-6 text-sm">
          <span className="text-muted-foreground">
            <span className="font-heading font-bold text-foreground">{facts.length}</span> facts
          </span>
        </div>
      </div>

      {/* Search + Add */}
      <div className="flex items-center gap-3">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            placeholder="Search facts..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-9"
          />
        </div>
      </div>

      {/* Facts list */}
      <div className="space-y-2">
        {filtered.map((fact, index) => (
          <div
            key={fact.id}
            className={cn(
              "group flex items-start gap-3 p-4 rounded-xl",
              "bg-card border border-border",
              "hover:border-primary/20 transition-all duration-200",
              editingId === fact.id && "border-primary/40 bg-secondary"
            )}
          >
            <span className="text-xs font-mono text-muted-foreground mt-0.5 w-6 text-right shrink-0 tabular-nums">
              {index + 1}
            </span>

            {editingId === fact.id ? (
              <div className="flex-1 flex items-center gap-2">
                <Input
                  ref={editRef}
                  value={editText}
                  onChange={(e) => setEditText(e.target.value)}
                  className="flex-1 text-sm"
                  onKeyDown={(e) => {
                    if (e.key === "Enter") saveEdit();
                    if (e.key === "Escape") cancelEdit();
                  }}
                />
                <Button size="sm" variant="ghost" onClick={saveEdit}>
                  <Check className="w-4 h-4 text-green-400" />
                </Button>
                <Button size="sm" variant="ghost" onClick={cancelEdit}>
                  <X className="w-4 h-4" />
                </Button>
              </div>
            ) : (
              <>
                <p
                  className="flex-1 text-sm leading-relaxed cursor-pointer hover:text-foreground transition-colors"
                  onClick={() => startEdit(fact)}
                >
                  {fact.fact_text}
                </p>
                <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-7 w-7 p-0 cursor-pointer"
                    onClick={() => startEdit(fact)}
                  >
                    <Pencil className="w-3.5 h-3.5 text-muted-foreground" />
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-7 w-7 p-0 cursor-pointer hover:text-destructive"
                    onClick={() => setDeleteTarget(fact)}
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </Button>
                </div>
              </>
            )}
          </div>
        ))}

        {filtered.length === 0 && !loading && (
          <div className="text-center py-12 text-muted-foreground text-sm">
            {searchQuery ? "No facts match your search" : "No facts yet"}
          </div>
        )}
      </div>

      {/* Add fact */}
      {showNewFact ? (
        <div className="flex items-center gap-2 p-4 rounded-xl bg-card border border-primary/30">
          <Input
            ref={newFactRef}
            value={newFactText}
            onChange={(e) => setNewFactText(e.target.value)}
            placeholder="Type the new fact..."
            className="flex-1 text-sm"
            onKeyDown={(e) => {
              if (e.key === "Enter") handleAddFact();
              if (e.key === "Escape") {
                setShowNewFact(false);
                setNewFactText("");
              }
            }}
          />
          <Button size="sm" onClick={handleAddFact} className="cursor-pointer">
            <Check className="w-4 h-4 mr-1" /> Save
          </Button>
          <Button
            size="sm"
            variant="ghost"
            className="cursor-pointer"
            onClick={() => {
              setShowNewFact(false);
              setNewFactText("");
            }}
          >
            <X className="w-4 h-4" />
          </Button>
        </div>
      ) : (
        <button
          onClick={() => setShowNewFact(true)}
          className="flex items-center gap-2 px-4 py-3 rounded-xl cursor-pointer
                     border border-dashed border-border text-muted-foreground
                     hover:border-primary/30 hover:text-primary
                     transition-all duration-200 w-full text-sm"
        >
          <Plus className="w-4 h-4" />
          Add fact
        </button>
      )}

      {/* Delete confirmation dialog */}
      <Dialog open={!!deleteTarget} onOpenChange={() => setDeleteTarget(null)}>
        <DialogContent className="bg-card border-border">
          <DialogHeader>
            <DialogTitle className="font-heading">Delete fact?</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground leading-relaxed">
            {deleteTarget?.fact_text}
          </p>
          <DialogFooter>
            <Button
              variant="ghost"
              onClick={() => setDeleteTarget(null)}
              className="cursor-pointer"
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={handleDelete}
              className="cursor-pointer"
            >
              Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
