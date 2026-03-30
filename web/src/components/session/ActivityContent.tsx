"use client";

import { ChatRichText } from "./ChatRichText";
import { MermaidDiagram } from "./MermaidDiagram";

interface ActivityContentProps {
  title: string;
  content: string;
  diagramUrl?: string;
}

/** Check if content looks like Mermaid code */
function isMermaidCode(content: string): boolean {
  const cleaned = content
    .replace(/```mermaid\s*/gi, "")
    .replace(/```\s*/g, "")
    .replace(/^mermaid\s*/i, "")
    .trim();
  return /^(graph|flowchart|sequenceDiagram|classDiagram|pie)\b/i.test(cleaned);
}

/** Extract clean Mermaid code from content */
function extractMermaid(content: string): string {
  return content
    .replace(/```mermaid\s*/gi, "")
    .replace(/```\s*/g, "")
    .replace(/^mermaid\s*/i, "")
    .trim();
}

export function ActivityContent({
  title,
  content,
  diagramUrl,
}: ActivityContentProps) {
  // If content is Mermaid code, render as diagram
  if (content && isMermaidCode(content)) {
    return (
      <div className="h-full overflow-y-auto">
        <MermaidDiagram title={title} code={extractMermaid(content)} />
      </div>
    );
  }

  return (
    <div className="p-6 overflow-y-auto h-full">
      <h3 className="text-lg font-heading font-semibold text-foreground mb-4">
        {title}
      </h3>

      {diagramUrl && (
        <div className="mb-4 rounded-xl overflow-hidden border border-border/50">
          <img
            src={diagramUrl}
            alt={title}
            className="w-full h-auto max-h-[300px] object-contain bg-white"
          />
        </div>
      )}

      <div className="text-sm leading-relaxed text-foreground">
        <ChatRichText content={content} />
      </div>
    </div>
  );
}
