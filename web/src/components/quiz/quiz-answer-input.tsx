"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Send, Loader2, Camera } from "lucide-react";
import { cn } from "@/lib/utils";
import { PhotoUpload } from "@/components/exam/photo-upload";

interface QuizAnswerInputProps {
  responseType: string;
  options: Record<string, string> | null;
  onSubmit: (answer: string, photos?: File[]) => void;
  submitting: boolean;
  disabled: boolean;
  accentClass: string;
}

export function QuizAnswerInput({
  responseType,
  options,
  onSubmit,
  submitting,
  disabled,
  accentClass,
}: QuizAnswerInputProps) {
  const [textAnswer, setTextAnswer] = useState("");
  const [selectedOption, setSelectedOption] = useState<string | null>(null);
  const [photos, setPhotos] = useState<File[]>([]);
  const [showUpload, setShowUpload] = useState(false);

  if (responseType === "mcq" && options) {
    return (
      <div className="space-y-2">
        {(["A", "B", "C", "D"] as const).map((letter) => {
          const text = options[letter];
          if (!text) return null;
          const isSelected = selectedOption === letter;

          return (
            <button
              key={letter}
              onClick={() => {
                setSelectedOption(letter);
                onSubmit(letter);
              }}
              disabled={disabled || submitting}
              className={cn(
                "w-full flex items-center gap-4 p-4 rounded-xl border-2 text-left cursor-pointer",
                "transition-all duration-200 active:scale-[0.99]",
                "focus-visible:ring-2 focus-visible:ring-primary focus-visible:outline-none",
                "disabled:opacity-40 disabled:cursor-not-allowed",
                isSelected
                  ? `border-primary/40 bg-primary/5`
                  : "border-border hover:border-primary/20 hover:bg-secondary/50"
              )}
            >
              <span
                className={cn(
                  "w-8 h-8 rounded-lg flex items-center justify-center text-sm font-bold shrink-0",
                  isSelected
                    ? "bg-primary text-primary-foreground"
                    : "bg-muted text-muted-foreground"
                )}
              >
                {letter}
              </span>
              <span className="text-sm leading-relaxed">{text.replace(/\s*\|\s*/g, " — ")}</span>
            </button>
          );
        })}
      </div>
    );
  }

  // Text or Numeric input
  const isNumeric = responseType === "numeric";
  const hasContent = textAnswer.trim().length > 0 || photos.length > 0;

  return (
    <div className="space-y-3">
      {isNumeric ? (
        <Input
          type="text"
          inputMode="decimal"
          value={textAnswer}
          onChange={(e) => setTextAnswer(e.target.value)}
          placeholder="Enter your answer..."
          className="text-lg h-12"
          disabled={disabled}
          onKeyDown={(e) => {
            if (e.key === "Enter" && textAnswer.trim()) onSubmit(textAnswer.trim());
          }}
        />
      ) : (
        <>
          <textarea
            value={textAnswer}
            onChange={(e) => setTextAnswer(e.target.value)}
            placeholder="Type your answer..."
            disabled={disabled}
            className="w-full bg-secondary border border-border rounded-xl px-4 py-3 text-sm leading-relaxed min-h-[120px] resize-y disabled:opacity-40"
          />

          {/* Photo upload toggle */}
          {!showUpload && (
            <button
              type="button"
              onClick={() => setShowUpload(true)}
              disabled={disabled}
              className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors cursor-pointer disabled:opacity-40"
            >
              <Camera className="w-3.5 h-3.5" />
              Upload a photo of your work
            </button>
          )}

          {/* Photo upload area */}
          {showUpload && (
            <PhotoUpload
              photos={photos}
              onChange={setPhotos}
              maxPhotos={3}
            />
          )}
        </>
      )}

      <Button
        onClick={() => onSubmit(textAnswer.trim(), photos.length > 0 ? photos : undefined)}
        disabled={disabled || submitting || !hasContent}
        className="cursor-pointer gap-2"
      >
        {submitting ? (
          <Loader2 className="w-4 h-4 animate-spin" />
        ) : (
          <Send className="w-4 h-4" />
        )}
        Submit Answer
      </Button>
    </div>
  );
}
