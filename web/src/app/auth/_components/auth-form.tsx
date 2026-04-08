"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import { motion, AnimatePresence } from "framer-motion";
import { createSupabaseBrowser } from "@/lib/supabase-auth";
import { cn } from "@/lib/utils";

export default function AuthForm() {
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
        const { error: signInError } =
          await supabase.auth.signInWithPassword({ email, password });
        if (signInError) throw signInError;
      }
      router.push("/study");
      router.refresh();
    } catch (err: unknown) {
      const message =
        err instanceof Error ? err.message : "Something went wrong";
      setError(message);
      setLoading(false);
    }
  }

  return (
    <section
      id="auth"
      className="min-h-screen grid md:grid-cols-5 bg-[#FBF7F1]"
    >
      {/* Left: photo (hidden on mobile) */}
      <div className="hidden md:block md:col-span-2 relative">
        <Image
          src="/auth/auth-bg.jpg"
          alt="An open book with lavender and a cup of coffee in warm light"
          fill
          sizes="40vw"
          className="object-cover"
        />
        <div className="absolute inset-0 bg-gradient-to-br from-[#1A0F0A]/10 to-[#C2410C]/15" />
      </div>

      {/* Right: form */}
      <div className="md:col-span-3 flex items-center justify-center px-6 py-20 sm:py-24">
        <motion.div
          initial={{ opacity: 0, y: 30 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.9, ease: [0.22, 1, 0.36, 1] }}
          className="w-full max-w-sm"
        >
          <p className="text-[11px] tracking-[0.25em] uppercase text-[#C2410C] mb-5">
            Welcome
          </p>
          <h2
            className="text-4xl sm:text-5xl text-stone-900 leading-tight mb-3"
            style={{ fontFamily: "var(--font-fraunces)", fontWeight: 400 }}
          >
            Let&rsquo;s begin.
          </h2>
          <p className="text-base text-stone-600 mb-10">
            {mode === "login"
              ? "Welcome back. Pick up where you left off."
              : "Create your account to start preparing."}
          </p>

          {/* Mode tabs */}
          <div className="flex gap-8 mb-8 border-b border-stone-200">
            <button
              onClick={() => {
                setMode("login");
                setError(null);
              }}
              className={cn(
                "pb-3 text-sm transition-colors cursor-pointer relative",
                mode === "login"
                  ? "text-stone-900"
                  : "text-stone-500 hover:text-stone-700"
              )}
              style={{ fontFamily: "var(--font-fraunces)" }}
            >
              Log in
              {mode === "login" && (
                <motion.div
                  layoutId="auth-tab-underline"
                  className="absolute bottom-[-1px] left-0 right-0 h-[2px] bg-[#C2410C]"
                />
              )}
            </button>
            <button
              onClick={() => {
                setMode("signup");
                setError(null);
              }}
              className={cn(
                "pb-3 text-sm transition-colors cursor-pointer relative",
                mode === "signup"
                  ? "text-stone-900"
                  : "text-stone-500 hover:text-stone-700"
              )}
              style={{ fontFamily: "var(--font-fraunces)" }}
            >
              Create account
              {mode === "signup" && (
                <motion.div
                  layoutId="auth-tab-underline"
                  className="absolute bottom-[-1px] left-0 right-0 h-[2px] bg-[#C2410C]"
                />
              )}
            </button>
          </div>

          {/* Form */}
          <form onSubmit={handleSubmit} className="space-y-6">
            <AnimatePresence>
              {mode === "signup" && (
                <motion.div
                  key="name-field"
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: "auto", opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }}
                  transition={{ duration: 0.25 }}
                  className="overflow-hidden"
                >
                  <label
                    htmlFor="auth-name"
                    className="block text-[11px] tracking-[0.15em] uppercase text-stone-500 mb-2"
                    style={{ fontFamily: "var(--font-fraunces)" }}
                  >
                    Name
                  </label>
                  <input
                    id="auth-name"
                    type="text"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="Your first name"
                    className="w-full bg-transparent border-b border-stone-300 focus:border-[#C2410C] py-2 text-base text-stone-900 placeholder:text-stone-400 focus:outline-none transition-colors"
                  />
                </motion.div>
              )}
            </AnimatePresence>

            <div>
              <label
                htmlFor="auth-email"
                className="block text-[11px] tracking-[0.15em] uppercase text-stone-500 mb-2"
                style={{ fontFamily: "var(--font-fraunces)" }}
              >
                Email
              </label>
              <input
                id="auth-email"
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@example.com"
                className="w-full bg-transparent border-b border-stone-300 focus:border-[#C2410C] py-2 text-base text-stone-900 placeholder:text-stone-400 focus:outline-none transition-colors"
              />
            </div>

            <div>
              <label
                htmlFor="auth-password"
                className="block text-[11px] tracking-[0.15em] uppercase text-stone-500 mb-2"
                style={{ fontFamily: "var(--font-fraunces)" }}
              >
                Password
              </label>
              <input
                id="auth-password"
                type="password"
                required
                minLength={6}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="At least 6 characters"
                className="w-full bg-transparent border-b border-stone-300 focus:border-[#C2410C] py-2 text-base text-stone-900 placeholder:text-stone-400 focus:outline-none transition-colors"
              />
            </div>

            {error && (
              <p className="text-sm text-[#C2410C] italic">{error}</p>
            )}

            <button
              type="submit"
              disabled={loading}
              className={cn(
                "w-full mt-4 bg-[#C2410C] hover:bg-[#7C2D12] transition-colors text-[#F5F1E8] py-4 text-base cursor-pointer",
                loading && "opacity-60 cursor-not-allowed"
              )}
              style={{ fontFamily: "var(--font-fraunces)" }}
            >
              {loading ? "…" : "Continue →"}
            </button>
          </form>
        </motion.div>
      </div>
    </section>
  );
}
