"use client";

import { useState } from "react";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";

interface DiagramViewerProps {
  urls: string[];
  className?: string;
}

export function DiagramViewer({ urls, className }: DiagramViewerProps) {
  const [enlarged, setEnlarged] = useState<string | null>(null);

  if (urls.length === 0) return null;

  return (
    <>
      <div className={cn("flex flex-wrap gap-3", className)}>
        {urls.map((url, i) => (
          <button
            key={i}
            onClick={() => setEnlarged(url)}
            className="cursor-pointer rounded-xl border border-border bg-card overflow-hidden hover:border-primary/30 hover:shadow-lg transition-all duration-200 active:scale-[0.98]"
          >
            <img
              src={url}
              alt={`Diagram ${i + 1}`}
              className="max-w-[360px] max-h-[280px] object-contain p-2"
              loading="lazy"
            />
          </button>
        ))}
      </div>

      <Dialog open={!!enlarged} onOpenChange={() => setEnlarged(null)}>
        <DialogContent className="bg-card border-border max-w-4xl p-2">
          {enlarged && (
            <img
              src={enlarged}
              alt="Diagram enlarged"
              className="w-full h-auto object-contain rounded-lg"
            />
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
