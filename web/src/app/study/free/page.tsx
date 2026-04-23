"use client";

import { useState, useEffect, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { motion } from "framer-motion";
import {
  MessageCircle,
  Brain,
  Target,
  FileEdit,
  FileText,
  ArrowRight,
  Sparkles,
  type LucideIcon,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { SUBJECT_META, getSubjectMeta } from "@/lib/subject-meta";
import { STUDY_SUBJECTS } from "@/lib/constants";
import { fetchSubjectTopicsList } from "@/lib/api";
import { cn } from "@/lib/utils";

// ── Mode definitions ────────────────────────────────────

type StudyMode = "tutor" | "flashcards" | "quiz" | "review" | "exam";

interface ModeOption {
  key: StudyMode;
  icon: LucideIcon;
  title: string;
  subtitle: string;
  gradient: string;
  iconColor: string;
}

const MODES: ModeOption[] = [
  {
    key: "tutor",
    icon: MessageCircle,
    title: "Ask Tutor",
    subtitle: "Chat freely about any topic",
    gradient: "from-sky-500/20 to-cyan-500/20",
    iconColor: "text-sky-400",
  },
  {
    key: "flashcards",
    icon: Brain,
    title: "Flashcards",
    subtitle: "Practice facts and concepts",
    gradient: "from-violet-500/20 to-fuchsia-500/20",
    iconColor: "text-violet-400",
  },
  {
    key: "quiz",
    icon: Target,
    title: "Quiz Me",
    subtitle: "Exam-style questions",
    gradient: "from-amber-500/20 to-orange-500/20",
    iconColor: "text-amber-400",
  },
  {
    key: "review",
    icon: FileEdit,
    title: "Review Notes",
    subtitle: "Check and improve your notes",
    gradient: "from-emerald-500/20 to-teal-500/20",
    iconColor: "text-emerald-400",
  },
  {
    key: "exam",
    icon: FileText,
    title: "Past Papers",
    subtitle: "Full exam practice",
    gradient: "from-rose-500/20 to-pink-500/20",
    iconColor: "text-rose-400",
  },
];

// ── Subject display names ───────────────────────────────

const SUBJECT_NAMES: Record<string, string> = {
  "0620": "Chemistry",
  "0625": "Physics",
  "0610": "Biology",
  "0478": "CS",
  "0520": "French",
  "0504": "Portuguese",
};

// ── Component ───────────────────────────────────────────

interface TopicItem {
  id: string;
  topic_code: string;
  topic_name: string;
}

function FreeStudyPageInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const initialMode = (searchParams.get("mode") as StudyMode | null) ?? "tutor";
  const [mode, setMode] = useState<StudyMode>(
    (["tutor", "flashcards", "quiz", "review", "exam"] as const).includes(initialMode)
      ? initialMode
      : "tutor",
  );
  const [subjectCode, setSubjectCode] = useState<string | null>(null);
  const [topicId, setTopicId] = useState<string | null>(null);
  const [topics, setTopics] = useState<TopicItem[]>([]);
  const [topicsLoading, setTopicsLoading] = useState(false);

  // Load topics when subject changes
  useEffect(() => {
    if (!subjectCode) {
      setTopics([]);
      setTopicId(null);
      return;
    }
    setTopicId(null);
    setTopicsLoading(true);
    fetchSubjectTopicsList(subjectCode)
      .then((result) => {
        const raw = Array.isArray(result) ? result : (result as { topics: unknown[] }).topics ?? [];
        const sorted = (raw as TopicItem[]).sort((a, b) =>
          a.topic_code.localeCompare(b.topic_code, undefined, { numeric: true }),
        );
        setTopics(sorted);
      })
      .catch(() => setTopics([]))
      .finally(() => setTopicsLoading(false));
  }, [subjectCode]);

  // Tutor mode allows starting with no subject (fully free chat).
  // Every other mode (except exam which has its own picker) still requires a subject.
  const subjectRequired = mode !== "exam" && mode !== "tutor";
  const canStart = mode === "exam" || Boolean(subjectCode) || mode === "tutor";

  const handleStart = () => {
    if (!canStart) return;

    const parts: string[] = [];
    if (subjectCode) parts.push(`subject=${subjectCode}`);
    if (topicId) parts.push(`topic=${topicId}`);

    switch (mode) {
      case "tutor":
      case "review": {
        parts.push(`mode=${mode}`);
        const qs = parts.join("&");
        router.push(`/study/free/session${qs ? `?${qs}` : ""}`);
        break;
      }
      case "flashcards": {
        const qs = parts.join("&");
        router.push(`/study/flashcards/session${qs ? `?${qs}` : ""}`);
        break;
      }
      case "quiz": {
        parts.push("count=10", "type=all");
        router.push(`/study/quiz/session?${parts.join("&")}`);
        break;
      }
      case "exam":
        router.push("/study/exam");
        break;
    }
  };

  return (
    <div className="max-w-2xl mx-auto py-8 space-y-8">
      {/* Header */}
      <motion.div
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
        className="text-center space-y-2"
      >
        <div className="inline-flex items-center gap-2 bg-primary/10 rounded-full px-4 py-1.5 mb-2">
          <Sparkles className="w-4 h-4 text-primary" />
          <span className="text-sm font-medium text-primary">Free Study</span>
        </div>
        <h1 className="font-heading text-2xl font-bold text-foreground">
          What would you like to work on?
        </h1>
      </motion.div>

      {/* Mode selection */}
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.1 }}
        className="space-y-3"
      >
        <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
          Choose a mode
        </p>
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
          {MODES.map((m) => {
            const Icon = m.icon;
            const selected = mode === m.key;
            return (
              <button
                key={m.key}
                onClick={() => setMode(m.key)}
                className={cn(
                  "relative rounded-xl p-4 text-left transition-all duration-200 cursor-pointer",
                  "border bg-gradient-to-br",
                  m.gradient,
                  selected
                    ? "border-primary ring-2 ring-primary/30 scale-[1.02]"
                    : "border-border/50 hover:border-border hover:scale-[1.01]",
                )}
              >
                <Icon className={cn("w-6 h-6 mb-2", m.iconColor)} />
                <p className="text-sm font-semibold text-foreground">{m.title}</p>
                <p className="text-[11px] text-muted-foreground leading-tight mt-0.5">
                  {m.subtitle}
                </p>
              </button>
            );
          })}
        </div>
      </motion.div>

      {/* Subject selection (hidden for exam — exam page has its own picker) */}
      {mode !== "exam" && (
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.2 }}
        className="space-y-3"
      >
        <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
          Pick a subject{subjectRequired ? "" : <span className="text-muted-foreground/60"> (optional)</span>}
        </p>
        <div className="grid grid-cols-3 sm:grid-cols-6 gap-2">
          {STUDY_SUBJECTS.map((code) => {
            const meta = getSubjectMeta(code);
            const Icon = meta.icon;
            const selected = subjectCode === code;
            return (
              <button
                key={code}
                onClick={() => setSubjectCode(code)}
                className={cn(
                  "rounded-xl p-3 flex flex-col items-center gap-1.5 transition-all duration-200 cursor-pointer",
                  "border bg-gradient-to-br",
                  meta.gradient,
                  selected
                    ? "border-primary ring-2 ring-primary/30 scale-[1.03]"
                    : "border-border/50 hover:border-border hover:scale-[1.01]",
                )}
              >
                <Icon className={cn("w-5 h-5", meta.accent)} />
                <span className="text-xs font-medium text-foreground">
                  {SUBJECT_NAMES[code] ?? code}
                </span>
              </button>
            );
          })}
        </div>
      </motion.div>
      )}

      {/* Topic selection (optional — hidden for exam mode) */}
      {subjectCode && mode !== "exam" && (
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          className="space-y-3"
        >
          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
            Pick a topic <span className="text-muted-foreground/60">(optional)</span>
          </p>
          {topicsLoading ? (
            <div className="h-32 rounded-xl bg-card border border-border animate-pulse" />
          ) : topics.length > 0 ? (
            <div className="max-h-[200px] overflow-y-auto rounded-xl border border-border bg-card/50 p-1.5 space-y-0.5">
              <button
                onClick={() => setTopicId(null)}
                className={cn(
                  "w-full text-left px-3 py-2 rounded-lg text-sm transition-colors cursor-pointer",
                  topicId === null
                    ? "bg-primary/10 text-primary font-medium"
                    : "text-muted-foreground hover:bg-secondary",
                )}
              >
                All topics
              </button>
              {topics.map((t) => (
                <button
                  key={t.id}
                  onClick={() => setTopicId(t.id)}
                  className={cn(
                    "w-full text-left px-3 py-2 rounded-lg text-sm transition-colors cursor-pointer",
                    topicId === t.id
                      ? "bg-primary/10 text-primary font-medium"
                      : "text-muted-foreground hover:bg-secondary",
                  )}
                >
                  <span className="text-muted-foreground/60 mr-1.5">
                    {t.topic_code.replace(/_/g, " ")}
                  </span>
                  {t.topic_name}
                </button>
              ))}
            </div>
          ) : null}
        </motion.div>
      )}

      {/* Start button */}
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.3 }}
        className="flex justify-center pt-2"
      >
        <Button
          size="lg"
          disabled={!canStart}
          onClick={handleStart}
          className="px-8 gap-2 cursor-pointer text-base"
        >
          Start Free Study
          <ArrowRight className="w-4 h-4" />
        </Button>
      </motion.div>
    </div>
  );
}

export default function FreeStudyPage() {
  return (
    <Suspense>
      <FreeStudyPageInner />
    </Suspense>
  );
}
