"use client";

import { useState, useCallback, useRef, type KeyboardEvent, type DragEvent } from "react";
import { Send, Paperclip, FileText, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { Attachment } from "@/lib/types";
import { isImageAttachment } from "@/lib/types";

const ACCEPTED_TYPES = "image/*,.pdf,.doc,.docx";
const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10 MB

interface ChatInputProps {
  onSend: (message: string, attachments?: Attachment[]) => void;
  disabled?: boolean;
  placeholder?: string;
}

export function ChatInput({
  onSend,
  disabled = false,
  placeholder = "Type a message...",
}: ChatInputProps) {
  const [text, setText] = useState("");
  const [pending, setPending] = useState<Attachment[]>([]);
  const [dragOver, setDragOver] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const handleSend = useCallback(() => {
    const trimmed = text.trim();
    if (!trimmed && pending.length === 0) return;
    onSend(trimmed || "(attachment)", pending.length > 0 ? pending : undefined);
    setText("");
    setPending([]);
    textareaRef.current?.focus();
  }, [text, pending, onSend]);

  const handleKeyDown = useCallback(
    (e: KeyboardEvent<HTMLTextAreaElement>) => {
      if (e.key === "Enter" && !e.shiftKey && !e.ctrlKey) {
        e.preventDefault();
        handleSend();
      }
    },
    [handleSend],
  );

  const isAcceptedFile = (file: File): boolean => {
    return (
      file.type.startsWith("image/") ||
      file.type === "application/pdf" ||
      file.type === "application/vnd.openxmlformats-officedocument.wordprocessingml.document" ||
      file.type === "application/msword" ||
      file.name.endsWith(".docx") ||
      file.name.endsWith(".doc")
    );
  };

  const handleFileSelect = useCallback(
    async (files: FileList | null) => {
      if (!files) return;
      const newAttachments: Attachment[] = [];
      for (const file of Array.from(files)) {
        if (!isAcceptedFile(file)) continue;
        if (file.size > MAX_FILE_SIZE) continue;
        const reader = new FileReader();
        const dataUrl = await new Promise<string>((resolve) => {
          reader.onload = () => resolve(reader.result as string);
          reader.readAsDataURL(file);
        });
        newAttachments.push({ url: dataUrl, name: file.name });
      }
      setPending((prev) => [...prev, ...newAttachments]);
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
      const pasteFiles: File[] = [];
      for (const item of Array.from(items)) {
        if (item.type.startsWith("image/") || item.type === "application/pdf") {
          const file = item.getAsFile();
          if (file) pasteFiles.push(file);
        }
      }
      if (pasteFiles.length > 0) {
        const dt = new DataTransfer();
        pasteFiles.forEach((f) => dt.items.add(f));
        handleFileSelect(dt.files);
      }
    },
    [handleFileSelect],
  );

  const removePending = useCallback((index: number) => {
    setPending((prev) => prev.filter((_, i) => i !== index));
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
      {/* Pending attachment thumbnails */}
      {pending.length > 0 && (
        <div className="flex flex-wrap gap-2 mb-2">
          {pending.map((att, i) => (
            <div key={i} className="relative group">
              {isImageAttachment(att.url) ? (
                <img
                  src={att.url}
                  alt={att.name}
                  className="w-16 h-16 object-cover rounded-lg border border-border/50"
                />
              ) : (
                <div className="w-16 h-16 rounded-lg border border-border/50 bg-muted flex flex-col items-center justify-center gap-0.5 px-1">
                  <FileText className="w-5 h-5 text-muted-foreground" />
                  <span className="text-[8px] text-muted-foreground text-center truncate w-full leading-tight">
                    {att.name.length > 12 ? `${att.name.slice(0, 10)}…` : att.name}
                  </span>
                </div>
              )}
              <button
                type="button"
                onClick={() => removePending(i)}
                className="absolute -top-1.5 -right-1.5 w-5 h-5 rounded-full bg-destructive text-destructive-foreground text-xs flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
              >
                <X className="w-3 h-3" />
              </button>
            </div>
          ))}
        </div>
      )}

      <div className="flex items-end gap-2">
        {/* Attach button */}
        <label
          htmlFor="chat-file-upload"
          className="shrink-0 h-9 w-9 inline-flex items-center justify-center rounded-lg hover:bg-muted cursor-pointer"
          style={disabled ? { pointerEvents: "none", opacity: 0.5 } : undefined}
        >
          <Paperclip className="w-4 h-4" />
        </label>
        <input
          id="chat-file-upload"
          type="file"
          accept="image/jpeg,image/png,image/webp,image/gif,application/pdf,.doc,.docx"
          multiple
          disabled={disabled}
          style={{ position: "absolute", width: 1, height: 1, padding: 0, margin: -1, overflow: "hidden", clip: "rect(0,0,0,0)", whiteSpace: "nowrap", border: 0 }}
          onChange={(e) => {
            if (e.target.files && e.target.files.length > 0) {
              handleFileSelect(e.target.files);
            }
            e.target.value = "";
          }}
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
          disabled={disabled || (!text.trim() && pending.length === 0)}
        >
          <Send className="w-4 h-4" />
        </Button>
      </div>

      <p className="text-[10px] text-muted-foreground mt-1.5 px-1">
        Enter to send, Shift+Enter for new line. Drag & drop or Ctrl+V to attach images, PDFs, or Word files.
      </p>
    </div>
  );
}
