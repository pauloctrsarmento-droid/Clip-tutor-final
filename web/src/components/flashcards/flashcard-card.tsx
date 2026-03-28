"use client";

import { motion, AnimatePresence } from "framer-motion";
import { RichText } from "@/components/rich-text";
import { Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

interface FlashcardCardProps {
  front: string;
  explanation: string | null;
  flipped: boolean;
  loading: boolean;
  accentClass: string;
  onFlip: () => void;
}

export function FlashcardCard({
  front,
  explanation,
  flipped,
  loading,
  accentClass,
  onFlip,
}: FlashcardCardProps) {
  return (
    <AnimatePresence mode="wait">
      {!flipped ? (
        <motion.div
          key="front"
          initial={{ rotateY: -90, opacity: 0 }}
          animate={{ rotateY: 0, opacity: 1 }}
          exit={{ rotateY: 90, opacity: 0 }}
          transition={{ duration: 0.3, ease: [0.4, 0, 0.2, 1] }}
          onClick={onFlip}
          className={cn(
            "rounded-2xl border-2 p-8",
            "bg-card shadow-xl",
            "flex flex-col items-center justify-center text-center",
            "min-h-[280px]",
            "cursor-pointer",
            "hover:shadow-2xl hover:border-primary/20 transition-shadow duration-300",
            accentClass ? `border-${accentClass}/15` : "border-border",
          )}
          style={{ perspective: "1200px" }}
        >
          <RichText
            content={front}
            className="text-xl leading-relaxed font-medium max-w-xl"
          />
          <p className="text-xs text-muted-foreground mt-8 select-none">
            Click to reveal answer
          </p>
        </motion.div>
      ) : (
        <motion.div
          key="back"
          initial={{ rotateY: -90, opacity: 0 }}
          animate={{ rotateY: 0, opacity: 1 }}
          exit={{ rotateY: 90, opacity: 0 }}
          transition={{ duration: 0.3, ease: [0.4, 0, 0.2, 1] }}
          className={cn(
            "rounded-2xl border-2 p-6",
            "bg-card shadow-xl",
            accentClass ? `border-${accentClass}/15` : "border-border",
          )}
          style={{ perspective: "1200px" }}
        >
          {loading ? (
            <div className="flex items-center justify-center min-h-[200px]">
              <Loader2 className="w-6 h-6 text-muted-foreground animate-spin" />
            </div>
          ) : explanation ? (
            <RichText
              content={explanation}
              className="text-sm leading-relaxed text-muted-foreground [&_strong]:text-foreground"
            />
          ) : (
            <p className="text-muted-foreground text-center py-8">
              No explanation available
            </p>
          )}
        </motion.div>
      )}
    </AnimatePresence>
  );
}
