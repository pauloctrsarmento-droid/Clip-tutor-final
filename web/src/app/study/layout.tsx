import type { Metadata } from "next";
import { GraduationCap } from "lucide-react";
import Link from "next/link";
import { SignOutButton } from "@/components/home/sign-out-button";
import { AuthGuard } from "@/components/auth-guard";

export const metadata: Metadata = {
  title: "CLIP Tutor — Study",
  description: "IGCSE exam practice platform",
};

export default function StudyLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-screen">
      {/* Top bar */}
      <header className="sticky top-0 z-50 border-b border-border/50 bg-background/80 backdrop-blur-xl">
        <div className="flex items-center justify-between px-8 py-2 max-w-7xl mx-auto">
          <Link href="/study" className="flex items-center gap-2.5 group">
            <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center group-hover:bg-primary/15 transition-colors">
              <GraduationCap className="w-4.5 h-4.5 text-primary" />
            </div>
            <span className="font-heading text-sm font-bold text-foreground">
              CLIP Tutor
            </span>
          </Link>
          <SignOutButton />
        </div>
      </header>

      {/* Content — protected by auth */}
      <main className="max-w-7xl mx-auto px-8 py-5">
        <AuthGuard>{children}</AuthGuard>
      </main>
    </div>
  );
}
