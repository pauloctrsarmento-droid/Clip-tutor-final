"use client";

import { Button } from "@/components/ui/button";
import { BookOpen, X } from "lucide-react";

interface FreeStudyConfirmProps {
  open: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

export function FreeStudyConfirm({ open, onConfirm, onCancel }: FreeStudyConfirmProps) {
  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
      <div className="bg-card border border-border rounded-2xl p-6 max-w-sm w-full mx-4 shadow-xl">
        <div className="flex items-center gap-3 mb-4">
          <div className="w-10 h-10 rounded-xl bg-blue-500/10 flex items-center justify-center">
            <BookOpen className="w-5 h-5 text-blue-400" />
          </div>
          <h3 className="font-heading text-lg font-semibold text-foreground">
            Leave guided session?
          </h3>
        </div>

        <p className="text-sm text-muted-foreground mb-6 leading-relaxed">
          Remaining study blocks will stay pending. You&apos;ll get free access to Flashcards, Quiz, and Exam Practice.
        </p>

        <div className="flex gap-3">
          <Button variant="outline" className="flex-1" onClick={onCancel}>
            <X className="w-4 h-4 mr-1.5" />
            Stay
          </Button>
          <Button className="flex-1" onClick={onConfirm}>
            <BookOpen className="w-4 h-4 mr-1.5" />
            Free Study
          </Button>
        </div>
      </div>
    </div>
  );
}
