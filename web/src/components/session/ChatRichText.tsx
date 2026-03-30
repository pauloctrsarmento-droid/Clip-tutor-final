"use client";

import { useMemo } from "react";
import { processInline } from "@/components/rich-text";

interface ChatRichTextProps {
  content: string;
  className?: string;
}

/**
 * Lightweight markdown renderer for chat messages.
 * Supports: **bold**, ### headings, - bullet lists, 1. numbered lists,
 * paragraph breaks, and KaTeX via processInline.
 */
export function ChatRichText({ content, className }: ChatRichTextProps) {
  const html = useMemo(() => renderChatMarkdown(content), [content]);
  return (
    <div
      className={className}
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}

function renderChatMarkdown(text: string): string {
  if (!text) return "";

  // Escape HTML
  let escaped = text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");

  // Bold: **text** → <strong>
  escaped = escaped.replace(/\*\*(.+?)\*\*/g, '<strong class="font-semibold">$1</strong>');
  // Clean up orphaned ** markers that the LLM didn't close properly
  escaped = escaped.replace(/\*\*/g, "");

  // Process LaTeX (inline $...$ and block $$...$$)
  escaped = processInline(escaped);

  // Split into lines for block-level processing
  const lines = escaped.split("\n");
  const blocks: string[] = [];
  let currentList: { type: "ul" | "ol"; items: string[] } | null = null;

  function flushList() {
    if (!currentList) return;
    const tag = currentList.type;
    const listClass = tag === "ul"
      ? "list-disc pl-5 my-2 space-y-1"
      : "list-decimal pl-5 my-2 space-y-1";
    const items = currentList.items
      .map((item) => `<li class="text-sm">${item}</li>`)
      .join("");
    blocks.push(`<${tag} class="${listClass}">${items}</${tag}>`);
    currentList = null;
  }

  for (const line of lines) {
    const trimmed = line.trim();

    // Empty line → flush list, add paragraph break
    if (!trimmed) {
      flushList();
      continue;
    }

    // Headings: ### → h3, ## → h2
    const headingMatch = trimmed.match(/^(#{1,3})\s+(.+)$/);
    if (headingMatch) {
      flushList();
      const level = headingMatch[1].length;
      const headingText = headingMatch[2];
      const sizeClass = level === 1
        ? "text-base font-bold mt-3 mb-1"
        : level === 2
          ? "text-[15px] font-semibold mt-3 mb-1"
          : "text-sm font-semibold mt-2 mb-0.5";
      blocks.push(`<h${level} class="${sizeClass}">${headingText}</h${level}>`);
      continue;
    }

    // Unordered list: - item or * item
    const ulMatch = trimmed.match(/^[-*]\s+(.+)$/);
    if (ulMatch) {
      if (currentList?.type !== "ul") {
        flushList();
        currentList = { type: "ul", items: [] };
      }
      currentList!.items.push(ulMatch[1]);
      continue;
    }

    // Ordered list: 1. item
    const olMatch = trimmed.match(/^\d+\.\s+(.+)$/);
    if (olMatch) {
      if (currentList?.type !== "ol") {
        flushList();
        currentList = { type: "ol", items: [] };
      }
      currentList!.items.push(olMatch[1]);
      continue;
    }

    // Normal text line
    flushList();
    blocks.push(`<p class="my-1">${trimmed}</p>`);
  }

  flushList();
  return blocks.join("");
}
