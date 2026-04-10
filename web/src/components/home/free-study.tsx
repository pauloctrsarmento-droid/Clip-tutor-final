"use client";

import Link from "next/link";
import { Brain, Target, FileText, MessageCircle } from "lucide-react";
import { cn } from "@/lib/utils";
import type { LucideIcon } from "lucide-react";

interface StudyAction {
  href: string;
  icon: LucideIcon;
  title: string;
  subtitle: string;
  gradient: string;
  iconColor: string;
}

const ACTIONS: StudyAction[] = [
  {
    href: "/study/session?mood=normal",
    icon: MessageCircle,
    title: "Chat Tutor",
    subtitle: "Ask anything, free study",
    gradient: "from-sky-500/15 to-cyan-500/15",
    iconColor: "text-sky-400",
  },
  {
    href: "/study/flashcards",
    icon: Brain,
    title: "Flashcards",
    subtitle: "Practice facts and concepts",
    gradient: "from-violet-500/15 to-fuchsia-500/15",
    iconColor: "text-violet-400",
  },
  {
    href: "/study/quiz",
    icon: Target,
    title: "Quick Quiz",
    subtitle: "Exam questions",
    gradient: "from-amber-500/15 to-orange-500/15",
    iconColor: "text-amber-400",
  },
  {
    href: "/study/exam",
    icon: FileText,
    title: "Exam Practice",
    subtitle: "Full paper",
    gradient: "from-emerald-500/15 to-teal-500/15",
    iconColor: "text-emerald-400",
  },
];

export function FreeStudy() {
  return (
    <div className="grid grid-cols-1 gap-3">
      {ACTIONS.map((action) => {
        const Icon = action.icon;
        return (
          <Link
            key={action.href}
            href={action.href}
            className={cn(
              "bg-card rounded-2xl p-3 border border-border",
              "hover:border-primary/30 hover:shadow-lg hover:shadow-primary/5",
              "transition-all duration-200 group cursor-pointer",
              "flex items-center gap-3"
            )}
          >
            <div
              className={cn(
                "w-8 h-8 rounded-xl flex-shrink-0 flex items-center justify-center",
                "bg-gradient-to-br group-hover:scale-105 transition-transform",
                action.gradient
              )}
            >
              <Icon className={cn("w-4 h-4", action.iconColor)} />
            </div>
            <div>
              <p className="text-sm font-semibold text-foreground">
                {action.title}
              </p>
              <p className="text-xs text-muted-foreground">
                {action.subtitle}
              </p>
            </div>
          </Link>
        );
      })}
    </div>
  );
}
