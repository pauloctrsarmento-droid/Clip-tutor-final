"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { QRCodeSVG } from "qrcode.react";
import { Smartphone, CheckCircle, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

interface RemotePhoto {
  name: string;
  url: string;
  created_at: string | null;
}

interface QrUploadProps {
  sessionId: string;
  onPhotosReceived: (files: File[]) => void;
  onPhotoRemoved: (name: string) => void;
}

/**
 * Shows a QR code for mobile photo upload + polls the remote bucket.
 * New photos arrive as File objects; deletions propagate via onPhotoRemoved.
 */
export function QrUpload({ sessionId, onPhotosReceived, onPhotoRemoved }: QrUploadProps) {
  const [remotePhotos, setRemotePhotos] = useState<RemotePhoto[]>([]);
  const [polling, setPolling] = useState(true);
  const knownRef = useRef<Set<string>>(new Set());
  const receivedRef = useRef(onPhotosReceived);
  const removedRef = useRef(onPhotoRemoved);
  receivedRef.current = onPhotosReceived;
  removedRef.current = onPhotoRemoved;

  const uploadUrl =
    typeof window !== "undefined"
      ? `${window.location.origin}/m/${sessionId}`
      : "";

  const pollPhotos = useCallback(async () => {
    try {
      const res = await fetch(`/api/exam-photos/list?sessionId=${sessionId}`);
      if (!res.ok) return;
      const data = (await res.json()) as { photos: RemotePhoto[] };
      const currentNames = new Set(data.photos.map((p) => p.name));

      // Detect removals: previously-known names absent from current list
      for (const known of knownRef.current) {
        if (!currentNames.has(known)) {
          knownRef.current.delete(known);
          removedRef.current(known);
        }
      }

      // Detect additions
      const newPhotos = data.photos.filter((p) => !knownRef.current.has(p.name));
      if (newPhotos.length > 0) {
        const files: File[] = [];
        for (const photo of newPhotos) {
          try {
            const response = await fetch(photo.url);
            const blob = await response.blob();
            const file = new File([blob], photo.name, { type: blob.type });
            files.push(file);
            knownRef.current.add(photo.name);
          } catch {
            // Skip failed downloads — will retry next poll
          }
        }
        if (files.length > 0) {
          receivedRef.current(files);
        }
      }

      setRemotePhotos(data.photos);
    } catch {
      // Silently fail — will retry on next poll
    }
  }, [sessionId]);

  // Poll every 3 seconds
  useEffect(() => {
    if (!polling) return;
    const interval = setInterval(() => void pollPhotos(), 3000);
    return () => clearInterval(interval);
  }, [polling, pollPhotos]);

  // Stop polling after 60 minutes
  useEffect(() => {
    const timeout = setTimeout(() => setPolling(false), 60 * 60 * 1000);
    return () => clearTimeout(timeout);
  }, []);

  return (
    <div className="rounded-2xl bg-card border border-border p-5 space-y-4">
      <div className="flex items-center gap-2">
        <Smartphone className="w-4 h-4 text-primary" />
        <h3 className="font-heading text-sm font-semibold text-foreground">
          Upload from phone
        </h3>
      </div>

      <div className="flex items-start gap-5">
        {/* QR Code */}
        <div className="shrink-0 rounded-xl bg-white p-3">
          {uploadUrl && (
            <QRCodeSVG
              value={uploadUrl}
              size={120}
              level="M"
              bgColor="white"
              fgColor="#1a1a2e"
            />
          )}
        </div>

        {/* Instructions */}
        <div className="space-y-2">
          <p className="text-sm text-muted-foreground">
            Scan with your phone camera to upload answer sheets directly.
          </p>
          <ol className="text-xs text-muted-foreground/70 space-y-1 list-decimal list-inside">
            <li>Scan the QR code</li>
            <li>Take photos of your answers</li>
            <li>Photos appear here automatically</li>
          </ol>

          {/* Status */}
          <div className="flex items-center gap-2 pt-1">
            {remotePhotos.length > 0 ? (
              <>
                <CheckCircle className="w-3.5 h-3.5 text-emerald-400" />
                <span className="text-xs font-medium text-emerald-400">
                  {remotePhotos.length} photo{remotePhotos.length > 1 ? "s" : ""} received
                </span>
              </>
            ) : polling ? (
              <>
                <Loader2 className={cn("w-3.5 h-3.5 text-muted-foreground animate-spin")} />
                <span className="text-xs text-muted-foreground">
                  Waiting for photos...
                </span>
              </>
            ) : null}
          </div>
        </div>
      </div>
    </div>
  );
}
