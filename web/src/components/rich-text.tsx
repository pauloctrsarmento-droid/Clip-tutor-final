"use client";

import { useMemo } from "react";
import katex from "katex";

interface RichTextProps {
  content: string;
  className?: string;
}

export function RichText({ content, className }: RichTextProps) {
  const html = useMemo(() => renderRichText(content), [content]);
  return (
    <div className={className} dangerouslySetInnerHTML={{ __html: html }} />
  );
}

function renderLatex(latex: string, displayMode: boolean): string {
  try {
    return katex.renderToString(latex, { displayMode, throwOnError: false, trust: true, strict: false });
  } catch {
    return latex;
  }
}

function processInline(text: string): string {
  // Block LaTeX
  let r = text.replace(/\$\$([^$]+?)\$\$/g, (_, l: string) =>
    `<div class="my-2 text-center">${renderLatex(l.trim(), true)}</div>`
  );
  // Inline LaTeX
  r = r.replace(/\$([^$\n]+?)\$/g, (_, l: string) => renderLatex(l.trim(), false));
  return r;
}

// Labels that get subtle styling
const SUBTLE_LABELS = [
  "What it means", "What this means",
  "Picture it", "Picture this",
  "Exam link",
  "O que significa", "Imagina", "Link para exame",
  "Ce que cela signifie", "Imagine", "Lien examen",
];

// Labels to remove completely (answer stands alone)
const REMOVE_LABELS = [
  "THE FACT", "The fact", "Le fait", "O facto",
];

// Key detail labels (special highlight)
const KEY_LABELS = [
  "KEY DETAIL", "Key detail", "Exam tip", "EXAM TIP",
  "Detalhe chave", "DETALHE CHAVE", "Détail clé",
];

// Exam sentence starters (amber box)
const EXAM_STARTERS = [
  "In the exam", "In exams",
  "They often ask", "They usually ask", "They might ask", "They may ask", "They will ask", "They frequently ask",
  "Examiners want", "Examiners look", "Examiners expect", "Examiners love",
  "Dans l'examen", "No exame", "Ils demandent",
];

const LIGHTBULB = '<svg class="inline w-3.5 h-3.5 mr-1.5 -mt-0.5 text-amber-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M15 14c.2-1 .7-1.7 1.5-2.5 1-.9 1.5-2.2 1.5-3.5A6 6 0 0 0 6 8c0 1 .2 2.2 1.5 3.5.7.7 1.3 1.5 1.5 2.5"/><path d="M9 18h6"/><path d="M10 22h4"/></svg>';

function stripLabel(text: string, label: string): string {
  // Remove "Label:" or "Label —" or "**Label** —" at start
  const escaped = label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const pattern = new RegExp(`^\\*?\\*?${escaped}\\*?\\*?\\s*[:\\u2014\\u2013\\-]+\\s*`, "i");
  let result = text.replace(pattern, "");

  // Also strip repeated label in body text: "Picture it like this:" etc.
  const bodyPattern = new RegExp(`^${escaped}\\s*(?:like this|is that|is|means)?\\s*[:\\u2014\\u2013\\-]*\\s*`, "i");
  result = result.replace(bodyPattern, "");

  return result;
}

function matchesAny(text: string, list: string[]): string | null {
  const lower = text.toLowerCase();
  for (const item of list) {
    if (lower.startsWith(item.toLowerCase())) return item;
  }
  return null;
}

function startsWithAny(text: string, list: string[]): boolean {
  const lower = text.toLowerCase();
  return list.some((s) => lower.startsWith(s.toLowerCase()));
}

function renderRichText(text: string): string {
  if (!text) return "";

  // Escape HTML first
  let escaped = text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");

  // Handle bold: only in first paragraph. Strip all ** markers first, then bold the first paragraph later.
  // Collect all bold segments
  const boldSegments: string[] = [];
  escaped = escaped.replace(/\*\*(.+?)\*\*/g, (_, t: string) => {
    boldSegments.push(t);
    return t; // strip markers, keep text
  });
  // We'll bold the entire first paragraph in the paragraph loop below
  const hasFirstBold = boldSegments.length > 0;

  // Process LaTeX
  escaped = processInline(escaped);

  // Split into paragraphs
  const paragraphs = escaped.split(/\n\n|\n/).filter((p) => p.trim());

  let isFirstParagraph = true;

  const rendered = paragraphs.map((para) => {
    const trimmed = para.trim();
    if (!trimmed) return "";

    // Strip HTML tags for matching (but keep them in output)
    const plainForMatch = trimmed.replace(/<[^>]*>/g, "").trim();

    // 1. Remove "THE FACT" labels — answer stands alone
    if (matchesAny(plainForMatch, REMOVE_LABELS)) {
      let cleaned = stripLabel(trimmed, matchesAny(plainForMatch, REMOVE_LABELS)!);
      if (!cleaned) return "";
      // This is the answer — bold the whole thing
      if (isFirstParagraph && hasFirstBold) {
        isFirstParagraph = false;
        return `<p class="mt-2 font-semibold text-foreground">${cleaned}</p>`;
      }
      isFirstParagraph = false;
      return `<p class="mt-2">${cleaned}</p>`;
    }

    // First paragraph (answer) — bold entirely
    if (isFirstParagraph && hasFirstBold) {
      isFirstParagraph = false;
      return `<p class="mt-2 font-semibold text-foreground">${trimmed}</p>`;
    }
    isFirstParagraph = false;

    // 2. KEY DETAIL — primary highlight
    const keyMatch = matchesAny(plainForMatch, KEY_LABELS);
    if (keyMatch) {
      const rest = stripLabel(trimmed, keyMatch);
      return `<p class="mt-3"><span class="text-xs font-semibold uppercase tracking-wider text-primary">KEY DETAIL:</span> ${rest}</p>`;
    }

    // 3. Exam sentences — amber box
    if (startsWithAny(plainForMatch, EXAM_STARTERS)) {
      return `<div class="mt-3 rounded-lg bg-amber-500/5 border border-amber-500/20 px-3 py-2.5 text-sm text-amber-200/80">${LIGHTBULB}${trimmed}</div>`;
    }

    // 4. Section labels — subtle italic
    const subtleMatch = matchesAny(plainForMatch, SUBTLE_LABELS);
    if (subtleMatch) {
      const rest = stripLabel(trimmed, subtleMatch);
      return `<p class="mt-3"><span class="text-sm font-medium text-muted-foreground">${subtleMatch}:</span> ${rest}</p>`;
    }

    // 5. Normal paragraph
    return `<p class="mt-2">${trimmed}</p>`;
  });

  return rendered.filter(Boolean).join("");
}
