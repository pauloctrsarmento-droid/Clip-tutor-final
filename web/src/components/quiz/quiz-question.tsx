"use client";

import { useMemo } from "react";
import { RichText } from "@/components/rich-text";
import { DiagramViewer } from "./diagram-viewer";
import { Badge } from "@/components/ui/badge";
import { cleanForDisplay } from "@/lib/clean-question-text";

interface QuizQuestionProps {
  questionText: string;
  marks: number;
  parentContext: string | null;
  diagramUrls: string[];
}

export function QuizQuestion({
  questionText,
  marks,
  parentContext,
  diagramUrls,
}: QuizQuestionProps) {
  const hasDiagram = diagramUrls.length > 0;

  const cleaned = useMemo(
    () => cleanForDisplay(questionText, parentContext),
    [questionText, parentContext]
  );

  return (
    <div className={hasDiagram ? "grid grid-cols-1 lg:grid-cols-[1fr_auto] gap-6" : ""}>
      <div className="space-y-4">
        {/* Parent context */}
        {cleaned.parentContext && (
          <div className="bg-muted/30 border-l-2 border-muted-foreground/20 pl-4 py-3 rounded-r-lg">
            <RichText
              content={cleaned.parentContext}
              className="text-sm text-muted-foreground leading-relaxed"
            />
          </div>
        )}

        {/* Question */}
        <div className="space-y-3">
          <div className="flex items-start justify-between gap-4">
            <RichText
              content={cleaned.questionText}
              className="text-lg leading-relaxed font-medium flex-1"
            />
            <Badge variant="secondary" className="shrink-0 tabular-nums text-xs">
              {marks} {marks === 1 ? "mark" : "marks"}
            </Badge>
          </div>
        </div>
      </div>

      {/* Diagram (right side on desktop) */}
      {hasDiagram && (
        <DiagramViewer urls={diagramUrls} className="lg:max-w-[400px]" />
      )}
    </div>
  );
}
