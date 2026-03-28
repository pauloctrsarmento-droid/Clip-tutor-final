import {
  FlaskConical,
  Zap,
  Leaf,
  Cpu,
  PenTool,
  BookOpen,
  Languages,
  FileText,
  type LucideIcon,
} from "lucide-react";

interface SubjectMeta {
  icon: LucideIcon;
  gradient: string;
  accent: string;
}

export const SUBJECT_META: Record<string, SubjectMeta> = {
  "0620": {
    icon: FlaskConical,
    gradient: "from-violet-500/20 to-fuchsia-500/20",
    accent: "text-violet-400",
  },
  "0625": {
    icon: Zap,
    gradient: "from-amber-500/20 to-orange-500/20",
    accent: "text-amber-400",
  },
  "0610": {
    icon: Leaf,
    gradient: "from-emerald-500/20 to-teal-500/20",
    accent: "text-emerald-400",
  },
  "0478": {
    icon: Cpu,
    gradient: "from-cyan-500/20 to-blue-500/20",
    accent: "text-cyan-400",
  },
  "0500": {
    icon: PenTool,
    gradient: "from-rose-500/20 to-pink-500/20",
    accent: "text-rose-400",
  },
  "0475": {
    icon: BookOpen,
    gradient: "from-indigo-500/20 to-purple-500/20",
    accent: "text-indigo-400",
  },
  "0520": {
    icon: Languages,
    gradient: "from-sky-500/20 to-indigo-500/20",
    accent: "text-sky-400",
  },
  "0504": {
    icon: FileText,
    gradient: "from-lime-500/20 to-green-500/20",
    accent: "text-lime-400",
  },
};

export function getSubjectMeta(code: string): SubjectMeta {
  return (
    SUBJECT_META[code] ?? {
      icon: FileText,
      gradient: "from-gray-500/20 to-gray-600/20",
      accent: "text-gray-400",
    }
  );
}
