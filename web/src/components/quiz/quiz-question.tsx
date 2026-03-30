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

const LONG_PASSAGE_THRESHOLD = 200;

export function QuizQuestion({
  questionText,
  marks,
  parentContext,
  diagramUrls,
}: QuizQuestionProps) {
  const hasDiagram = diagramUrls.length > 0;

  const cleaned = useMemo(
    () => cleanForDisplay(questionText, parentContext),
    [questionText, parentContext],
  );

  const isLongPassage =
    cleaned.parentContext && cleaned.parentContext.length > LONG_PASSAGE_THRESHOLD;

  // Split layout for reading comprehension (long passages)
  if (isLongPassage) {
    return (
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Left: scrollable reading passage */}
        <div className="overflow-y-auto max-h-[450px] bg-muted/15 border border-border/30 rounded-xl p-4">
          <p className="text-[10px] font-semibold text-muted-foreground/60 uppercase tracking-widest mb-3">
            Reading Passage
          </p>
          <div className="text-[13px] leading-[1.8] text-foreground/80 space-y-3">
            <PassageText content={cleaned.parentContext!} />
          </div>
        </div>

        {/* Right: question + marks */}
        <div className="space-y-4">
          <div className="flex items-start justify-between gap-3">
            <RichText
              content={cleaned.questionText}
              className="text-base leading-relaxed font-medium flex-1"
            />
            <Badge variant="secondary" className="shrink-0 tabular-nums text-xs">
              {marks} {marks === 1 ? "mark" : "marks"}
            </Badge>
          </div>

          {hasDiagram && (
            <DiagramViewer urls={diagramUrls} className="max-w-full" />
          )}
        </div>
      </div>
    );
  }

  // Standard layout (short/no parent context)
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

// Instruction patterns — these are exam instructions, not part of the reading passage
const INSTRUCTION_PATTERN = /^(lisez|répondez|read|answer|look at|regardez|cochez|écrivez|choisissez|complétez|remplissez|tick|choose|complete|fill in)/i;

/** Format passage text: separate instructions from reading content */
function PassageText({ content }: { content: string }) {
  // Step 1: Normalize line breaks
  const normalized = content
    .replace(/\n\n+/g, "\u0000PARA\u0000")
    .replace(/\n/g, " ")
    .replace(/\u0000PARA\u0000/g, "\n\n")
    .replace(/  +/g, " ");

  const paragraphs = normalized.split(/\n\n/).filter((p) => p.trim());

  // Step 2: Extract instruction from the beginning of text
  // Instructions like "Lisez le texte. Répondez aux questions..." may be
  // joined into the first paragraph. Split them out.
  let instruction = "";
  const passageParas: string[] = [];

  for (const para of paragraphs) {
    const trimmed = para.trim();
    if (!trimmed) continue;

    if (!instruction && INSTRUCTION_PATTERN.test(trimmed)) {
      // Check if instruction is glued to passage text (no \n\n separator)
      // Look for instruction ending followed by passage start (e.g. "...français. Salut !")
      const splitPoint = trimmed.match(
        /^(.+?(?:français|English|below|suivantes|appropriée|correcte|cases?)\s*[.!])\s+([A-ZÀ-ÖØ-Ý«""])/,
      );
      if (splitPoint) {
        instruction = splitPoint[1];
        passageParas.push(splitPoint[2] + trimmed.slice(splitPoint.index! + splitPoint[0].length - 1));
      } else {
        instruction = trimmed;
      }
    } else {
      passageParas.push(trimmed);
    }
  }

  const instructions = instruction ? [instruction] : [];

  return (
    <>
      {/* Instructions — visually distinct */}
      {instructions.length > 0 && (
        <div className="bg-primary/5 border border-primary/10 rounded-lg px-3 py-2 mb-3">
          {instructions.map((inst, i) => (
            <p key={`inst-${i}`} className="text-xs text-primary/70 font-medium">
              {inst}
            </p>
          ))}
        </div>
      )}

      {/* Reading passage — flowing text */}
      {passageParas.map((para, i) => {
        const trimmed = para.trim();

        // Detect dialogue (contains « » or starts with quote)
        const isDialogue = /[«»]/.test(trimmed) || /^[""]/.test(trimmed);
        // Detect title/header (short line at start)
        const isTitle = trimmed.length < 60 && i === 0 && passageParas.length > 2;

        if (isTitle) {
          return (
            <p key={i} className="font-semibold text-foreground text-sm">
              {trimmed}
            </p>
          );
        }

        if (isDialogue) {
          return (
            <p key={i} className="pl-3 border-l-2 border-primary/20 italic">
              {trimmed}
            </p>
          );
        }

        return <p key={i}>{trimmed}</p>;
      })}
    </>
  );
}
