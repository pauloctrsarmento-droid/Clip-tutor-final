"use client";

import { LogOut } from "lucide-react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth-context";

export function SignOutButton() {
  const { signOut, studentName } = useAuth();
  const router = useRouter();

  async function handleSignOut() {
    await signOut();
    router.push("/auth");
    router.refresh();
  }

  return (
    <button
      onClick={handleSignOut}
      className="flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs text-muted-foreground hover:text-foreground hover:bg-muted transition-colors cursor-pointer"
      title={`Sign out${studentName ? ` (${studentName})` : ""}`}
    >
      <LogOut className="w-3.5 h-3.5" />
      <span className="hidden sm:inline">Sign out</span>
    </button>
  );
}
