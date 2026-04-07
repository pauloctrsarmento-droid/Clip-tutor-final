"use client";

import { useState } from "react";
import { CheckCircle2, XCircle, AlertTriangle, ChevronDown, ChevronUp, FileText } from "lucide-react";
import { cn } from "@/lib/utils";
import { ChatRichText } from "./ChatRichText";
import type { SummaryReview, SummaryReviewItem } from "@/lib/types";

interface ActivitySummaryReviewProps {
  review: SummaryReview;
}

function ScoreBadge({ score, grade }: { score: number; grade: string }) {
  const color =
    score >= 80
      ? "text-emerald-400 bg-emerald-500/10 border-emerald-500/30"
      : score >= 60
        ? "text-amber-400 bg-amber-500/10 border-amber-500/30"
        : "text-red-400 bg-red-500/10 border-red-500/30";

  return (
    <div className={cn("inline-flex items-center gap-2 rounded-xl border px-4 py-2", color)}>
      <span className="text-2xl font-bold">{score}</span>
      <div className="flex flex-col">
        <span className="text-xs opacity-70">/ 100</span>
        <span className="text-sm font-semibold">{grade}</span>
      </div>
    </div>
  );
}

function ReviewItem({ item }: { item: SummaryReviewItem }) {
  if (item.type === "correct") {
    return (
      <div className="flex gap-2.5 rounded-xl border border-emerald-500/20 bg-emerald-500/5 p-3">
        <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
        <div className="text-sm space-y-1">
          <p className="text-emerald-300 font-medium">{item.corrected}</p>
          <p className="text-muted-foreground text-xs">{item.explanation}</p>
        </div>
      </div>
    );
  }

  if (item.type === "error") {
    return (
      <div className="flex gap-2.5 rounded-xl border border-red-500/20 bg-red-500/5 p-3">
        <XCircle className="w-4 h-4 text-red-400 shrink-0 mt-0.5" />
        <div className="text-sm space-y-1.5">
          {item.original && (
            <p className="text-red-300/80 line-through">{item.original}</p>
          )}
          <p className="text-emerald-300">{item.corrected}</p>
          <p className="text-muted-foreground text-xs">{item.explanation}</p>
        </div>
      </div>
    );
  }

  // missing
  return (
    <div className="flex gap-2.5 rounded-xl border border-amber-500/20 bg-amber-500/5 p-3">
      <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
      <div className="text-sm space-y-1">
        <p className="text-amber-300 font-medium">{item.corrected}</p>
        <p className="text-muted-foreground text-xs">{item.explanation}</p>
      </div>
    </div>
  );
}

export function ActivitySummaryReview({ review }: ActivitySummaryReviewProps) {
  const [showCorrected, setShowCorrected] = useState(false);

  const correct = review.items.filter((i) => i.type === "correct");
  const errors = review.items.filter((i) => i.type === "error");
  const missing = review.items.filter((i) => i.type === "missing");

  return (
    <div className="h-full overflow-y-auto p-5 space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <FileText className="w-4 h-4 text-primary" />
            <h2 className="text-sm font-bold text-foreground">Summary Review</h2>
          </div>
          <p className="text-xs text-muted-foreground">{review.topic}</p>
        </div>
        <ScoreBadge score={review.score} grade={review.grade} />
      </div>

      {/* What you got right */}
      {correct.length > 0 && (
        <section className="space-y-2">
          <h3 className="text-xs font-semibold text-emerald-400 uppercase tracking-wider">
            What You Got Right ({correct.length})
          </h3>
          {correct.map((item, i) => (
            <ReviewItem key={`c-${i}`} item={item} />
          ))}
        </section>
      )}

      {/* Corrections needed */}
      {errors.length > 0 && (
        <section className="space-y-2">
          <h3 className="text-xs font-semibold text-red-400 uppercase tracking-wider">
            Corrections Needed ({errors.length})
          </h3>
          {errors.map((item, i) => (
            <ReviewItem key={`e-${i}`} item={item} />
          ))}
        </section>
      )}

      {/* Missing key points */}
      {missing.length > 0 && (
        <section className="space-y-2">
          <h3 className="text-xs font-semibold text-amber-400 uppercase tracking-wider">
            Key Points You Missed ({missing.length})
          </h3>
          {missing.map((item, i) => (
            <ReviewItem key={`m-${i}`} item={item} />
          ))}
        </section>
      )}

      {/* Corrected version (collapsible) */}
      {review.corrected_version && (
        <section>
          <button
            type="button"
            onClick={() => setShowCorrected((v) => !v)}
            className="flex items-center gap-1.5 text-xs font-semibold text-primary uppercase tracking-wider hover:text-primary/80 cursor-pointer"
          >
            {showCorrected ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
            Corrected Version
          </button>
          {showCorrected && (
            <div className="mt-2 rounded-xl border border-border/50 bg-card p-4 text-sm leading-relaxed">
              <ChatRichText content={review.corrected_version} />
            </div>
          )}
        </section>
      )}
    </div>
  );
}
