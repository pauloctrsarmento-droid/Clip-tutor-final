"use client";

import { useState } from "react";
import { motion } from "framer-motion";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Check,
  X,
  ChevronDown,
  RotateCcw,
  FileText,
  AlertTriangle,
  PenLine,
  AlertCircle,
  ThumbsUp,
  Lightbulb,
  ArrowRight,
} from "lucide-react";
import { cn } from "@/lib/utils";
import type { ExamResults as ExamResultsType, ExamQuestionResult } from "./types";

interface ExamResultsProps {
  results: ExamResultsType;
  onAnother: () => void;
  onViewMarkScheme: () => void;
}

function extractErrors(errorsRaw: string): string[] {
  if (!errorsRaw || errorsRaw.toLowerCase().includes("aucune") || errorsRaw.toLowerCase() === "none." || errorsRaw.length < 5) return [];

  // Strategy 1: Split by newlines (preferred — one error per line)
  const byNewline = errorsRaw
    .split(/\n/)
    .map((e) => e.trim())
    .filter((e) => e.length > 3 && e.includes("\u2192"));

  if (byNewline.length > 1) return byNewline;

  // Strategy 2: Split by comma/semicolon before a quote mark that starts a new error
  const bySeparator = errorsRaw
    .split(/(?:,\s*'|;\s*')/)
    .map((e, i) => (i > 0 ? "'" + e : e).trim())
    .filter((e) => e.length > 3 && e.includes("\u2192"));

  if (bySeparator.length > 1) return bySeparator;

  // Strategy 3: Split by ), ' pattern (end of explanation, start of next error)
  const byParen = errorsRaw
    .split(/\),\s*'/)
    .map((e, i) => {
      let cleaned = e.trim();
      if (i > 0) cleaned = "'" + cleaned;
      if (i < errorsRaw.split(/\),\s*'/).length - 1 && !cleaned.endsWith(")")) cleaned += ")";
      return cleaned;
    })
    .filter((e) => e.length > 5 && e.includes("\u2192"));

  if (byParen.length > 1) return byParen;

  // Fallback: return as single error if it has an arrow
  if (errorsRaw.includes("\u2192")) return [errorsRaw.trim()];

  return [];
}

/** Parse structured feedback: "ERRORS: ... POSITIVES: ... TIP: ..." */
function parseFeedback(raw: string): { errors: string[]; positives: string; tip: string; plain: string | null } {
  // Normalize: ensure POSITIVES/POSITIFS always starts on its own "line" for reliable splitting
  const normalized = raw
    .replace(/\.\s*POSITI[FV]S?:/gi, ".\nPOSITIFS:")
    .replace(/\)\s*POSITI[FV]S?:/gi, ")\nPOSITIFS:")
    .replace(/\.\s*TIP:/gi, ".\nTIP:")
    .replace(/\.\s*CONSEIL:/gi, ".\nCONSEIL:");

  const errorsMatch = normalized.match(/(?:ERRORS?|ERREURS?):\s*([\s\S]*?)(?=POSITI[FV]S?:|TIP:|CONSEIL:|$)/i);
  const positivesMatch = normalized.match(/(?:POSITI[FV]S?|WELL DONE):\s*([\s\S]*?)(?=TIP:|CONSEIL:|$)/i);
  const tipMatch = normalized.match(/(?:TIP|CONSEIL):\s*([\s\S]*?)$/i);

  if (!errorsMatch && !positivesMatch && !tipMatch) {
    // Also check for abbreviated format: "ERR:" or "PS:"
    const errAbbrev = raw.match(/ERR[^A-Z]*:\s*([\s\S]*?)(?=PS:|POSITIF|TIP:|CONSEIL:|$)/i);
    const psAbbrev = raw.match(/(?:PS|POSITIF)[^:]*:\s*([\s\S]*?)(?=TIP:|CONSEIL:|$)/i);
    const tipAbbrev = raw.match(/(?:TIP|CONSEIL):\s*([\s\S]*?)$/i);
    if (!errAbbrev && !psAbbrev && !tipAbbrev) {
      return { errors: [], positives: "", tip: "", plain: raw };
    }
    // Use abbreviated matches
    return {
      errors: extractErrors(errAbbrev?.[1]?.trim() ?? ""),
      positives: psAbbrev?.[1]?.trim() ?? "",
      tip: tipAbbrev?.[1]?.trim() ?? "",
      plain: null,
    };
  }

  return {
    errors: extractErrors(errorsMatch?.[1]?.trim() ?? ""),
    positives: positivesMatch?.[1]?.trim() ?? "",
    tip: tipMatch?.[1]?.trim() ?? "",
    plain: null,
  };
}

function gradeColor(grade: string | null): string {
  if (!grade) return "bg-secondary text-secondary-foreground";
  const g = grade.toUpperCase();
  if (g === "A" || g === "A*") return "bg-emerald-500/15 text-emerald-400 border-emerald-500/30";
  if (g === "B") return "bg-sky-500/15 text-sky-400 border-sky-500/30";
  if (g === "C") return "bg-amber-500/15 text-amber-400 border-amber-500/30";
  return "bg-red-500/15 text-red-400 border-red-500/30";
}

function marksBarColor(awarded: number, max: number): string {
  const pct = max > 0 ? (awarded / max) * 100 : 0;
  if (pct >= 80) return "bg-emerald-500";
  if (pct >= 50) return "bg-amber-500";
  return "bg-red-500";
}

function QuestionCard({
  question,
  index,
}: {
  question: ExamQuestionResult;
  index: number;
}) {
  const [expanded, setExpanded] = useState(false);
  const pct = question.max_marks > 0 ? (question.awarded_marks / question.max_marks) * 100 : 0;

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.3 + index * 0.05 }}
      className="bg-card border border-border rounded-xl overflow-hidden"
    >
      <button
        type="button"
        onClick={() => setExpanded((e) => !e)}
        className="w-full text-left px-4 py-3 flex items-center gap-3 cursor-pointer hover:bg-secondary/50 transition-colors"
      >
        <span className="font-heading font-semibold text-sm min-w-[3rem]">
          Q{question.question_number}
        </span>

        {/* Marks bar */}
        <div className="flex-1 h-2 rounded-full bg-secondary overflow-hidden">
          <div
            className={cn("h-full rounded-full transition-all", marksBarColor(question.awarded_marks, question.max_marks))}
            style={{ width: `${pct}%` }}
          />
        </div>

        <span className="text-xs tabular-nums text-muted-foreground min-w-[3.5rem] text-right">
          {question.awarded_marks}/{question.max_marks}
        </span>

        {question.confidence === "low" && (
          <AlertTriangle className="w-3.5 h-3.5 text-amber-400 shrink-0" />
        )}

        <ChevronDown
          className={cn(
            "w-4 h-4 text-muted-foreground transition-transform shrink-0",
            expanded && "rotate-180"
          )}
        />
      </button>

      {expanded && (
        <div className="px-4 pb-4 space-y-4 border-t border-border pt-3">
          {/* Student's answer (what AI read from handwriting) */}
          {question.read_text && (
            <div className="space-y-1.5">
              <div className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground uppercase tracking-wider">
                <PenLine className="w-3 h-3" />
                Your answer
              </div>
              <div className="bg-muted/30 border-l-2 border-primary/30 rounded-r-lg px-4 py-3">
                <p className="text-sm text-foreground leading-relaxed italic whitespace-pre-wrap">
                  {question.read_text}
                </p>
              </div>
            </div>
          )}

          {/* Mark breakdown */}
          {question.mark_breakdown.length > 0 && (
            <div className="space-y-1.5">
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                Marking
              </p>
              <div className="space-y-1">
                {question.mark_breakdown.map((point, i) => (
                  <div
                    key={i}
                    className={cn(
                      "flex items-start gap-2 text-sm rounded-lg px-3 py-1.5",
                      point.awarded ? "bg-emerald-500/5" : "bg-red-500/5"
                    )}
                  >
                    {point.awarded ? (
                      <Check className="w-4 h-4 text-emerald-400 mt-0.5 shrink-0" />
                    ) : (
                      <X className="w-4 h-4 text-red-400 mt-0.5 shrink-0" />
                    )}
                    <span className={cn(
                      "leading-relaxed",
                      point.awarded ? "text-foreground" : "text-muted-foreground"
                    )}>
                      {point.point}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Structured Feedback */}
          {question.feedback && (() => {
            const fb = parseFeedback(question.feedback);

            if (fb.plain) {
              return (
                <div className="bg-primary/5 border border-primary/10 rounded-lg px-4 py-3">
                  <p className="text-sm text-foreground leading-relaxed">{fb.plain}</p>
                </div>
              );
            }

            return (
              <div className="space-y-3">
                {/* Errors */}
                {fb.errors.length > 0 && (
                  <div className="space-y-1.5">
                    <div className="flex items-center gap-1.5 text-xs font-medium text-red-400 uppercase tracking-wider">
                      <AlertCircle className="w-3 h-3" />
                      Corrections ({fb.errors.length})
                    </div>
                    <div className="bg-red-500/5 border border-red-500/10 rounded-lg px-4 py-3 space-y-2">
                      {fb.errors.map((err, i) => {
                        const parts = err.split("→").map((s) => s.trim());
                        const explanation = parts[1]?.match(/\(([^)]+)\)$/);
                        const corrected = explanation ? parts[1].replace(explanation[0], "").trim() : parts[1];

                        return (
                          <div key={i} className="flex items-start gap-2 text-sm">
                            <ArrowRight className="w-3.5 h-3.5 text-red-400 mt-0.5 shrink-0" />
                            <div>
                              <span className="text-red-400 line-through">{parts[0]?.replace(/^'|'$/g, "")}</span>
                              {corrected && (
                                <>
                                  {" → "}
                                  <span className="text-emerald-400 font-medium">{corrected.replace(/^'|'$/g, "")}</span>
                                </>
                              )}
                              {explanation?.[1] && (
                                <span className="text-muted-foreground text-xs ml-1.5">({explanation[1]})</span>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}

                {/* Positives */}
                {fb.positives && (
                  <div className="space-y-1.5">
                    <div className="flex items-center gap-1.5 text-xs font-medium text-emerald-400 uppercase tracking-wider">
                      <ThumbsUp className="w-3 h-3" />
                      Well done
                    </div>
                    <div className="bg-emerald-500/5 border border-emerald-500/10 rounded-lg px-4 py-3">
                      <p className="text-sm text-foreground leading-relaxed">{fb.positives}</p>
                    </div>
                  </div>
                )}

                {/* Tip */}
                {fb.tip && (
                  <div className="space-y-1.5">
                    <div className="flex items-center gap-1.5 text-xs font-medium text-amber-400 uppercase tracking-wider">
                      <Lightbulb className="w-3 h-3" />
                      Study tip
                    </div>
                    <div className="bg-amber-500/5 border border-amber-500/10 rounded-lg px-4 py-3">
                      <p className="text-sm text-foreground leading-relaxed">{fb.tip}</p>
                    </div>
                  </div>
                )}
              </div>
            );
          })()}
        </div>
      )}
    </motion.div>
  );
}

export function ExamResults({ results, onAnother, onViewMarkScheme }: ExamResultsProps) {
  return (
    <div className="max-w-2xl mx-auto space-y-8">
      {/* Score header */}
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.4, ease: [0.4, 0, 0.2, 1] }}
        className="text-center space-y-3"
      >
        <motion.p
          initial={{ scale: 0.5, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ delay: 0.1, type: "spring", stiffness: 200, damping: 15 }}
          className="text-5xl font-heading font-bold tabular-nums"
        >
          {results.total_marks}/{results.max_marks}
        </motion.p>

        <div className="flex items-center justify-center gap-3">
          <span className="text-lg text-muted-foreground tabular-nums">
            {results.percentage}%
          </span>
          {results.grade && (
            <Badge
              className={cn(
                "text-sm font-semibold px-3 py-0.5 border",
                gradeColor(results.grade)
              )}
            >
              Grade {results.grade}
            </Badge>
          )}
        </div>

        {/* Grade boundaries */}
        {results.grade_boundaries && (
          <p className="text-xs text-muted-foreground">
            Boundaries:{" "}
            {Object.entries(results.grade_boundaries)
              .filter(([, v]) => v !== null)
              .map(([k, v]) => `${k}: ${v}`)
              .join(" | ")}
          </p>
        )}
      </motion.div>

      {/* Overall feedback */}
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.2 }}
        className="bg-card border border-border rounded-xl p-5"
      >
        <p className="text-sm leading-relaxed text-muted-foreground">
          {results.overall_feedback}
        </p>
      </motion.div>

      {/* Per-question cards */}
      <div className="space-y-2">
        <h3 className="font-heading text-sm font-semibold text-muted-foreground uppercase tracking-wider">
          Question Breakdown
        </h3>
        {results.questions.map((q, i) => (
          <QuestionCard key={q.question_number} question={q} index={i} />
        ))}
      </div>

      {/* Actions */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.5 }}
        className="flex gap-3 justify-center"
      >
        <Button variant="ghost" onClick={onAnother} className="cursor-pointer gap-1.5">
          <RotateCcw className="w-4 h-4" /> Try Another Paper
        </Button>
        <Button onClick={onViewMarkScheme} className="cursor-pointer gap-1.5">
          <FileText className="w-4 h-4" /> View Mark Scheme
        </Button>
      </motion.div>
    </div>
  );
}
