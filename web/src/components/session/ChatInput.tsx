"use client";

import { useState, useCallback, useRef, type KeyboardEvent, type DragEvent } from "react";
import { Send, Paperclip, Image } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface ChatInputProps {
  onSend: (message: string, images?: string[]) => void;
  disabled?: boolean;
  placeholder?: string;
}

export function ChatInput({
  onSend,
  disabled = false,
  placeholder = "Type a message...",
}: ChatInputProps) {
  const [text, setText] = useState("");
  const [pendingImages, setPendingImages] = useState<string[]>([]);
  const [dragOver, setDragOver] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleSend = useCallback(() => {
    const trimmed = text.trim();
    if (!trimmed && pendingImages.length === 0) return;
    onSend(trimmed || "(image)", pendingImages.length > 0 ? pendingImages : undefined);
    setText("");
    setPendingImages([]);
    textareaRef.current?.focus();
  }, [text, pendingImages, onSend]);

  const handleKeyDown = useCallback(
    (e: KeyboardEvent<HTMLTextAreaElement>) => {
      if (e.key === "Enter" && !e.shiftKey && !e.ctrlKey) {
        e.preventDefault();
        handleSend();
      }
    },
    [handleSend],
  );

  const handleFileSelect = useCallback(
    async (files: FileList | null) => {
      if (!files) return;
      const newImages: string[] = [];
      for (const file of Array.from(files)) {
        if (!file.type.startsWith("image/") && file.type !== "application/pdf") continue;
        // Convert to base64 data URL for preview
        // Actual upload to Supabase Storage happens in the send flow
        const reader = new FileReader();
        const dataUrl = await new Promise<string>((resolve) => {
          reader.onload = () => resolve(reader.result as string);
          reader.readAsDataURL(file);
        });
        newImages.push(dataUrl);
      }
      setPendingImages((prev) => [...prev, ...newImages]);
    },
    [],
  );

  const handleDrop = useCallback(
    (e: DragEvent) => {
      e.preventDefault();
      setDragOver(false);
      handleFileSelect(e.dataTransfer.files);
    },
    [handleFileSelect],
  );

  const handlePaste = useCallback(
    (e: React.ClipboardEvent) => {
      const items = e.clipboardData?.items;
      if (!items) return;
      const imageFiles: File[] = [];
      for (const item of Array.from(items)) {
        if (item.type.startsWith("image/")) {
          const file = item.getAsFile();
          if (file) imageFiles.push(file);
        }
      }
      if (imageFiles.length > 0) {
        const dt = new DataTransfer();
        imageFiles.forEach((f) => dt.items.add(f));
        handleFileSelect(dt.files);
      }
    },
    [handleFileSelect],
  );

  const removePendingImage = useCallback((index: number) => {
    setPendingImages((prev) => prev.filter((_, i) => i !== index));
  }, []);

  return (
    <div
      className={cn(
        "border-t border-border/50 bg-card/50 p-3",
        dragOver && "ring-2 ring-primary/30 bg-primary/5",
      )}
      onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
      onDragLeave={() => setDragOver(false)}
      onDrop={handleDrop}
    >
      {/* Pending image thumbnails */}
      {pendingImages.length > 0 && (
        <div className="flex flex-wrap gap-2 mb-2">
          {pendingImages.map((url, i) => (
            <div key={i} className="relative group">
              <img
                src={url}
                alt={`Upload ${i + 1}`}
                className="w-16 h-16 object-cover rounded-lg border border-border/50"
              />
              <button
                type="button"
                onClick={() => removePendingImage(i)}
                className="absolute -top-1.5 -right-1.5 w-5 h-5 rounded-full bg-destructive text-destructive-foreground text-xs flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
              >
                x
              </button>
            </div>
          ))}
        </div>
      )}

      <div className="flex items-end gap-2">
        {/* Attach button */}
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="shrink-0 h-9 w-9"
          onClick={() => fileInputRef.current?.click()}
          disabled={disabled}
        >
          <Paperclip className="w-4 h-4" />
        </Button>
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*,application/pdf"
          multiple
          className="hidden"
          onChange={(e) => handleFileSelect(e.target.files)}
        />

        {/* Textarea */}
        <textarea
          ref={textareaRef}
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={handleKeyDown}
          onPaste={handlePaste}
          placeholder={placeholder}
          disabled={disabled}
          rows={1}
          className={cn(
            "flex-1 resize-none bg-transparent text-sm text-foreground placeholder:text-muted-foreground",
            "border border-border/50 rounded-xl px-3 py-2 min-h-[36px] max-h-[120px]",
            "focus:outline-none focus:ring-1 focus:ring-primary/30",
            "disabled:opacity-50",
          )}
          style={{ height: "auto", overflow: "hidden" }}
          onInput={(e) => {
            const el = e.currentTarget;
            el.style.height = "auto";
            el.style.height = `${Math.min(el.scrollHeight, 120)}px`;
          }}
        />

        {/* Send button */}
        <Button
          type="button"
          size="icon"
          className="shrink-0 h-9 w-9"
          onClick={handleSend}
          disabled={disabled || (!text.trim() && pendingImages.length === 0)}
        >
          <Send className="w-4 h-4" />
        </Button>
      </div>

      <p className="text-[10px] text-muted-foreground mt-1.5 px-1">
        Enter to send, Shift+Enter for new line. Drag & drop or Ctrl+V to attach images.
      </p>
    </div>
  );
}
