"use client";

import { useAuth } from "@/lib/auth-context";
import { PinScreen } from "@/components/pin-screen";
import { AdminShell } from "@/components/admin-shell";

export default function AdminPage() {
  const { isAuthenticated } = useAuth();

  if (!isAuthenticated) {
    return <PinScreen />;
  }

  return <AdminShell />;
}
