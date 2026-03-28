"use client";

import { Frown, Minus, Smile, Flame } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import type { LucideIcon } from "lucide-react";

interface MoodCheckProps {
  open: boolean;
  onSelect: (mood: string) => void;
  onClose: () => void;
}

interface MoodOption {
  key: string;
  icon: LucideIcon;
  label: string;
  iconColor: string;
  bgColor: string;
  borderHover: string;
}

const MOODS: MoodOption[] = [
  {
    key: "unmotivated",
    icon: Frown,
    label: "Not feeling it",
    iconColor: "text-red-400",
    bgColor: "bg-red-500/10",
    borderHover: "hover:border-red-500/40",
  },
  {
    key: "normal",
    icon: Minus,
    label: "Normal",
    iconColor: "text-amber-400",
    bgColor: "bg-amber-500/10",
    borderHover: "hover:border-amber-500/40",
  },
  {
    key: "good",
    icon: Smile,
    label: "Feeling good",
    iconColor: "text-sky-400",
    bgColor: "bg-sky-500/10",
    borderHover: "hover:border-sky-500/40",
  },
  {
    key: "motivated",
    icon: Flame,
    label: "Motivated!",
    iconColor: "text-emerald-400",
    bgColor: "bg-emerald-500/10",
    borderHover: "hover:border-emerald-500/40",
  },
];

export function MoodCheck({ open, onSelect, onClose }: MoodCheckProps) {
  return (
    <Dialog
      open={open}
      onOpenChange={(isOpen) => {
        if (!isOpen) onClose();
      }}
    >
      <DialogContent className="sm:max-w-md" showCloseButton>
        <DialogHeader>
          <DialogTitle className="font-heading text-lg">
            How are you feeling today?
          </DialogTitle>
        </DialogHeader>
        <div className="grid grid-cols-2 gap-4 pt-3">
          {MOODS.map((mood) => {
            const Icon = mood.icon;
            return (
              <button
                key={mood.key}
                onClick={() => onSelect(mood.key)}
                className={cn(
                  "flex flex-col items-center gap-3 rounded-2xl bg-card p-6",
                  "border border-border transition-all duration-200 cursor-pointer",
                  "hover:bg-secondary active:scale-95",
                  mood.borderHover
                )}
              >
                <div
                  className={cn(
                    "w-12 h-12 rounded-xl flex items-center justify-center",
                    mood.bgColor
                  )}
                >
                  <Icon className={cn("w-6 h-6", mood.iconColor)} />
                </div>
                <span className="text-sm font-medium text-foreground">
                  {mood.label}
                </span>
              </button>
            );
          })}
        </div>
      </DialogContent>
    </Dialog>
  );
}
