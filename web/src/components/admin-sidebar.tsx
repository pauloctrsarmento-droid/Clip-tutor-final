"use client";

import { useAuth } from "@/lib/auth-context";
import { getSubjectMeta } from "@/lib/subject-meta";
import { GraduationCap, LogOut, BarChart3, CalendarDays, MessageSquare, User, FileText } from "lucide-react";
import { Separator } from "@/components/ui/separator";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

interface Subject {
  id: string;
  code: string;
  name: string;
  topic_count: number;
  fact_count: number;
}

const DASHBOARD_SECTIONS = [
  { key: "progress", label: "Progresso", icon: BarChart3 },
  { key: "study-plan", label: "Study Plan", icon: CalendarDays },
  { key: "prompts", label: "Prompts", icon: MessageSquare },
  { key: "student-profile", label: "Perfil Aluno", icon: User },
  { key: "papers", label: "Past Papers", icon: FileText },
] as const;

interface AdminSidebarProps {
  subjects: Subject[];
  activeSubjectId: string | null;
  activeSection: string | null;
  onSelectSubject: (id: string) => void;
  onSelectSection: (section: string) => void;
}

export function AdminSidebar({
  subjects,
  activeSubjectId,
  activeSection,
  onSelectSubject,
  onSelectSection,
}: AdminSidebarProps) {
  const { logout } = useAuth();

  return (
    <aside className="w-[260px] h-screen flex flex-col bg-sidebar border-r border-sidebar-border shrink-0">
      {/* Header */}
      <div className="p-5 flex items-center gap-3">
        <div className="w-9 h-9 rounded-lg bg-primary/10 flex items-center justify-center">
          <GraduationCap className="w-5 h-5 text-primary" />
        </div>
        <div>
          <h1 className="font-heading text-sm font-bold text-foreground">
            CLIP Tutor
          </h1>
          <p className="text-[11px] text-muted-foreground">Admin</p>
        </div>
      </div>

      <Separator className="bg-sidebar-border" />

      {/* Subject list */}
      <nav className="flex-1 p-3 space-y-1 overflow-y-auto">
        <p className="px-3 py-2 text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
          Subjects
        </p>
        {subjects.map((subject) => {
          const meta = getSubjectMeta(subject.code);
          const Icon = meta.icon;
          const isActive = subject.id === activeSubjectId;

          return (
            <Tooltip key={subject.id}>
              <TooltipTrigger
                onClick={() => onSelectSubject(subject.id)}
                className={cn(
                  "w-full flex items-center gap-3 px-3 py-2.5 rounded-lg cursor-pointer",
                  "transition-all duration-200 group",
                  isActive
                    ? "bg-sidebar-accent text-sidebar-accent-foreground"
                    : "text-sidebar-foreground hover:bg-sidebar-accent/50 hover:text-sidebar-accent-foreground"
                )}
              >
                <Icon
                  className={cn(
                    "w-4 h-4 shrink-0 transition-colors",
                    isActive ? meta.accent : "text-muted-foreground"
                  )}
                />
                <span className="text-sm font-medium truncate flex-1 text-left">
                  {subject.name}
                </span>
                <span
                  className={cn(
                    "text-xs tabular-nums",
                    isActive ? "text-primary" : "text-muted-foreground"
                  )}
                >
                  {subject.topic_count}
                </span>
              </TooltipTrigger>
              <TooltipContent side="right" className="bg-card border-border">
                <p className="font-mono text-xs">{subject.code}</p>
                <p className="text-muted-foreground text-xs">
                  {subject.fact_count} facts
                </p>
              </TooltipContent>
            </Tooltip>
          );
        })}
        {/* Dashboard sections */}
        <Separator className="bg-sidebar-border my-2" />
        <p className="px-3 py-2 text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
          Dashboard
        </p>
        {DASHBOARD_SECTIONS.map((section) => {
          const Icon = section.icon;
          const isActive = activeSection === section.key;

          return (
            <button
              key={section.key}
              onClick={() => onSelectSection(section.key)}
              className={cn(
                "w-full flex items-center gap-3 px-3 py-2.5 rounded-lg cursor-pointer",
                "transition-all duration-200",
                isActive
                  ? "bg-sidebar-accent text-sidebar-accent-foreground"
                  : "text-sidebar-foreground hover:bg-sidebar-accent/50 hover:text-sidebar-accent-foreground"
              )}
            >
              <Icon
                className={cn(
                  "w-4 h-4 shrink-0 transition-colors",
                  isActive ? "text-primary" : "text-muted-foreground"
                )}
              />
              <span className="text-sm font-medium truncate flex-1 text-left">
                {section.label}
              </span>
            </button>
          );
        })}
      </nav>

      <Separator className="bg-sidebar-border" />

      {/* Footer */}
      <div className="p-3">
        <button
          onClick={logout}
          className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg cursor-pointer
                     text-muted-foreground hover:text-destructive hover:bg-destructive/10
                     transition-colors duration-200"
        >
          <LogOut className="w-4 h-4" />
          <span className="text-sm">Sign out</span>
        </button>
      </div>
    </aside>
  );
}
