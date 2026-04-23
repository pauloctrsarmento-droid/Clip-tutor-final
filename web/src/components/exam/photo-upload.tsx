"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Camera, X, Upload } from "lucide-react";
import { cn } from "@/lib/utils";

interface PhotoUploadProps {
  photos: File[];
  onChange: (photos: File[]) => void;
  onRemoveAt?: (index: number) => void;
  maxPhotos?: number;
}

export function PhotoUpload({ photos, onChange, onRemoveAt, maxPhotos = 10 }: PhotoUploadProps) {
  const [isDragging, setIsDragging] = useState(false);
  const [previews, setPreviews] = useState<string[]>([]);
  const inputRef = useRef<HTMLInputElement>(null);

  // Generate previews and revoke old URLs
  useEffect(() => {
    const urls = photos.map((f) => URL.createObjectURL(f));
    setPreviews(urls);
    return () => {
      urls.forEach((u) => URL.revokeObjectURL(u));
    };
  }, [photos]);

  const addFiles = useCallback(
    (files: FileList | File[]) => {
      const accepted = Array.from(files).filter((f) =>
        ["image/jpeg", "image/png", "image/webp"].includes(f.type)
      );
      const remaining = maxPhotos - photos.length;
      if (remaining <= 0) return;
      const toAdd = accepted.slice(0, remaining);
      onChange([...photos, ...toAdd]);
    },
    [photos, maxPhotos, onChange]
  );

  const removePhoto = useCallback(
    (index: number) => {
      if (onRemoveAt) {
        onRemoveAt(index);
      } else {
        onChange(photos.filter((_, i) => i !== index));
      }
    },
    [photos, onChange, onRemoveAt]
  );

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  }, []);

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setIsDragging(false);
      if (e.dataTransfer.files.length > 0) {
        addFiles(e.dataTransfer.files);
      }
    },
    [addFiles]
  );

  const handleInputChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      if (e.target.files && e.target.files.length > 0) {
        addFiles(e.target.files);
      }
      // Reset so the same file can be selected again
      e.target.value = "";
    },
    [addFiles]
  );

  return (
    <div className="space-y-4">
      {/* Drop zone */}
      <div
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        className={cn(
          "flex flex-col items-center justify-center gap-3 rounded-2xl border-2 border-dashed p-8 transition-colors",
          isDragging
            ? "border-primary bg-primary/5"
            : "border-border bg-card hover:border-muted-foreground/30"
        )}
      >
        <div className="w-12 h-12 rounded-xl bg-secondary flex items-center justify-center">
          <Camera className="w-6 h-6 text-muted-foreground" />
        </div>
        <div className="text-center">
          <p className="text-sm font-medium">Drag photos here</p>
          <p className="text-xs text-muted-foreground mt-1">
            or click to browse - JPEG, PNG, WebP
          </p>
        </div>
        <Button
          variant="secondary"
          size="sm"
          className="cursor-pointer gap-1.5"
          onClick={() => inputRef.current?.click()}
        >
          <Upload className="w-3.5 h-3.5" />
          Choose Files
        </Button>
        <input
          ref={inputRef}
          type="file"
          accept="image/jpeg,image/png,image/webp"
          multiple
          className="hidden"
          onChange={handleInputChange}
        />
      </div>

      {/* Count */}
      <p className="text-xs text-muted-foreground text-center tabular-nums">
        {photos.length}/{maxPhotos} photos
      </p>

      {/* Preview grid */}
      {previews.length > 0 && (
        <div className="grid grid-cols-3 sm:grid-cols-4 gap-3">
          {previews.map((url, i) => (
            <div key={`${photos[i]?.name}-${i}`} className="relative group rounded-xl overflow-hidden aspect-[4/3] bg-secondary">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={url}
                alt={`Photo ${i + 1}`}
                className="w-full h-full object-cover"
              />
              <button
                type="button"
                onClick={() => removePhoto(i)}
                aria-label={`Remove photo ${i + 1}`}
                className="absolute top-1.5 right-1.5 w-7 h-7 rounded-full bg-black/70 text-white flex items-center justify-center hover:bg-black/90 active:bg-black transition-colors cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
