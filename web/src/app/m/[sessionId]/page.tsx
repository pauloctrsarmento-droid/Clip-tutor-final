"use client";

import { useState, useRef, useCallback } from "react";
import { useParams } from "next/navigation";
import { Camera, Loader2, ImagePlus, X } from "lucide-react";
import { cn } from "@/lib/utils";

interface UploadedPhoto {
  url: string;
  name: string;
}

export default function MobileUploadPage() {
  const { sessionId } = useParams<{ sessionId: string }>();
  const [photos, setPhotos] = useState<UploadedPhoto[]>([]);
  const [uploading, setUploading] = useState(false);
  const [deleting, setDeleting] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const uploadPhoto = useCallback(
    async (file: File) => {
      setUploading(true);
      setError(null);
      try {
        const formData = new FormData();
        formData.append("photo", file);
        formData.append("sessionId", sessionId);

        const res = await fetch("/api/exam-photos/upload", {
          method: "POST",
          body: formData,
        });

        if (!res.ok) throw new Error("Upload failed");

        const data = (await res.json()) as { url: string; filename: string };
        setPhotos((prev) => [...prev, { url: data.url, name: data.filename }]);
      } catch {
        setError("Failed to upload. Try again.");
      } finally {
        setUploading(false);
      }
    },
    [sessionId]
  );

  const handleFileChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const files = e.target.files;
      if (!files) return;
      for (const file of Array.from(files)) {
        void uploadPhoto(file);
      }
      e.target.value = "";
    },
    [uploadPhoto]
  );

  const deletePhoto = useCallback(
    async (name: string) => {
      setDeleting(name);
      setError(null);
      try {
        const res = await fetch("/api/exam-photos/delete", {
          method: "DELETE",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ sessionId, filename: name }),
        });
        if (!res.ok) throw new Error("Delete failed");
        setPhotos((prev) => prev.filter((p) => p.name !== name));
      } catch {
        setError("Failed to delete. Try again.");
      } finally {
        setDeleting(null);
      }
    },
    [sessionId]
  );

  return (
    <div className="min-h-screen bg-background p-4 flex flex-col">
      {/* Header */}
      <div className="text-center mb-6">
        <div className="w-14 h-14 rounded-2xl bg-primary/10 flex items-center justify-center mx-auto mb-3">
          <Camera className="w-7 h-7 text-primary" />
        </div>
        <h1 className="font-heading text-xl font-bold text-foreground">
          Upload Answer Sheets
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          Take photos of your answers
        </p>
      </div>

      {/* Upload area */}
      <button
        onClick={() => fileInputRef.current?.click()}
        disabled={uploading}
        className={cn(
          "w-full rounded-2xl border-2 border-dashed border-primary/30 bg-primary/5",
          "p-8 flex flex-col items-center gap-3 transition-colors",
          "active:bg-primary/10",
          uploading && "opacity-50"
        )}
      >
        {uploading ? (
          <Loader2 className="w-10 h-10 text-primary animate-spin" />
        ) : (
          <ImagePlus className="w-10 h-10 text-primary" />
        )}
        <span className="text-sm font-medium text-primary">
          {uploading ? "Uploading..." : "Tap to take photo or choose from gallery"}
        </span>
      </button>

      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        capture="environment"
        multiple
        onChange={handleFileChange}
        className="hidden"
      />

      {error && (
        <p className="text-sm text-red-400 text-center mt-3">{error}</p>
      )}

      {/* Uploaded photos */}
      {photos.length > 0 && (
        <div className="mt-6 space-y-3">
          <h2 className="text-sm font-semibold text-foreground">
            Uploaded ({photos.length})
          </h2>
          <div className="grid grid-cols-2 gap-3">
            {photos.map((photo, i) => (
              <div
                key={photo.name}
                className="relative rounded-xl overflow-hidden border border-border aspect-[3/4]"
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={photo.url}
                  alt={`Answer sheet ${i + 1}`}
                  className="w-full h-full object-cover"
                />
                <button
                  type="button"
                  onClick={() => void deletePhoto(photo.name)}
                  disabled={deleting === photo.name}
                  aria-label={`Delete page ${i + 1}`}
                  className={cn(
                    "absolute top-2 right-2 w-8 h-8 rounded-full bg-black/70 text-white flex items-center justify-center",
                    "active:bg-black/90 transition-colors",
                    deleting === photo.name && "opacity-50"
                  )}
                >
                  {deleting === photo.name ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <X className="w-4 h-4" />
                  )}
                </button>
                <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/60 to-transparent p-2">
                  <span className="text-xs text-white font-medium">
                    Page {i + 1}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Footer */}
      <div className="mt-auto pt-6 text-center">
        <p className="text-xs text-muted-foreground">
          Photos appear automatically on your computer
        </p>
      </div>
    </div>
  );
}
