"use client";

import Link from "next/link";
import { Sparkles, ArrowRight } from "lucide-react";
import { cn } from "@/lib/utils";

export function FreeStudy() {
  return (
    <Link
      href="/study/free"
      className={cn(
        "group relative block rounded-2xl overflow-hidden cursor-pointer",
        "border border-border hover:border-primary/40",
        "transition-all duration-300",
        "hover:shadow-xl hover:shadow-primary/10 hover:scale-[1.01]",
      )}
    >
      {/* Gradient background */}
      <div className="absolute inset-0 bg-gradient-to-br from-sky-500/10 via-violet-500/10 to-amber-500/10 opacity-60 group-hover:opacity-100 transition-opacity" />

      <div className="relative p-5 flex items-center gap-4">
        {/* Icon */}
        <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-sky-500/20 to-violet-500/20 flex items-center justify-center shrink-0 group-hover:scale-110 transition-transform duration-300">
          <Sparkles className="w-6 h-6 text-sky-400" />
        </div>

        {/* Text */}
        <div className="flex-1 min-w-0">
          <p className="text-base font-bold text-foreground">
            Free Study
          </p>
          <p className="text-xs text-muted-foreground mt-0.5">
            Chat tutor, flashcards, quiz, note review — pick a subject and go
          </p>
        </div>

        {/* Arrow */}
        <ArrowRight className="w-5 h-5 text-muted-foreground group-hover:text-primary group-hover:translate-x-1 transition-all shrink-0" />
      </div>
    </Link>
  );
}
