"use client";

import { ChatRichText } from "./ChatRichText";

interface ActivityContentProps {
  title: string;
  content: string;
  diagramUrl?: string;
}

export function ActivityContent({
  title,
  content,
  diagramUrl,
}: ActivityContentProps) {
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
