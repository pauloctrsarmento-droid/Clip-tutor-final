"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createSupabaseBrowser } from "@/lib/supabase-auth";
import { cn } from "@/lib/utils";

export default function AuthPage() {
  const router = useRouter();
  const [mode, setMode] = useState<"login" | "signup">("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const supabase = createSupabaseBrowser();

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);

    try {
      if (mode === "signup") {
        const { error: signUpError } = await supabase.auth.signUp({
          email,
          password,
          options: { data: { name: name || email.split("@")[0] } },
        });
        if (signUpError) throw signUpError;
      } else {
        const { error: signInError } = await supabase.auth.signInWithPassword({
          email,
          password,
        });
        if (signInError) throw signInError;
      }
      router.push("/study");
      router.refresh();
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Something went wrong";
      setError(message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-background px-4">
      <div className="w-full max-w-sm space-y-8">
        {/* Logo / Title */}
        <div className="text-center">
          <h1 className="font-heading text-3xl font-bold text-foreground">
            CLIP Tutor
          </h1>
          <p className="text-sm text-muted-foreground mt-2">
            IGCSE exam practice platform
          </p>
        </div>

        {/* Mode toggle */}
        <div className="flex rounded-xl bg-muted p-1">
          <button
            onClick={() => { setMode("login"); setError(null); }}
            className={cn(
              "flex-1 py-2 text-sm font-medium rounded-lg transition-all cursor-pointer",
              mode === "login"
                ? "bg-card text-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground"
            )}
          >
            Log in
          </button>
          <button
            onClick={() => { setMode("signup"); setError(null); }}
            className={cn(
              "flex-1 py-2 text-sm font-medium rounded-lg transition-all cursor-pointer",
              mode === "signup"
                ? "bg-card text-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground"
            )}
          >
            Sign up
          </button>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="space-y-4">
          {mode === "signup" && (
            <div>
              <label htmlFor="name" className="block text-xs font-medium text-muted-foreground mb-1.5">
                Name
              </label>
              <input
                id="name"
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Your first name"
                className="w-full rounded-xl bg-card border border-border px-4 py-3 text-sm text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:ring-2 focus:ring-primary/30"
              />
            </div>
          )}

          <div>
            <label htmlFor="email" className="block text-xs font-medium text-muted-foreground mb-1.5">
              Email
            </label>
            <input
              id="email"
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
              className="w-full rounded-xl bg-card border border-border px-4 py-3 text-sm text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:ring-2 focus:ring-primary/30"
            />
          </div>

          <div>
            <label htmlFor="password" className="block text-xs font-medium text-muted-foreground mb-1.5">
              Password
            </label>
            <input
              id="password"
              type="password"
              required
              minLength={6}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="At least 6 characters"
              className="w-full rounded-xl bg-card border border-border px-4 py-3 text-sm text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:ring-2 focus:ring-primary/30"
            />
          </div>

          {error && (
            <div className="rounded-xl bg-red-500/10 border border-red-500/20 px-4 py-3">
              <p className="text-sm text-red-400">{error}</p>
            </div>
          )}

          <button
            type="submit"
            disabled={loading}
            className={cn(
              "w-full rounded-xl py-3 text-sm font-semibold transition-all",
              "bg-primary text-primary-foreground",
              "hover:opacity-90 active:scale-[0.99]",
              loading ? "opacity-60 cursor-not-allowed" : "cursor-pointer"
            )}
          >
            {loading
              ? "Loading..."
              : mode === "login"
                ? "Log in"
                : "Create account"}
          </button>
        </form>
      </div>
    </div>
  );
}
