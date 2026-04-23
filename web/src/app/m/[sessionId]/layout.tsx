import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Upload Answer Sheets — CLIP Tutor",
  description: "Upload exam answer photos from your phone",
};

export default function MobileUploadLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <>{children}</>;
}
