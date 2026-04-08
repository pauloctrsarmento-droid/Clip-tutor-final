"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createSupabaseBrowser } from "@/lib/supabase-auth";
import { cn } from "@/lib/utils";
import { motion, AnimatePresence } from "framer-motion";
import { User, Mail, Lock, Loader2 } from "lucide-react";
import Tilt from "react-parallax-tilt";
import confetti from "canvas-confetti";

export default function AuthCard() {
  const router = useRouter();
  const [mode, setMode] = useState<"login" | "signup">("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const supabase = createSupabaseBrowser();

  function fireConfetti() {
    const defaults = {
      particleCount: 100,
      spread: 70,
      origin: { y: 0.6 },
      colors: ["#6366F1", "#8B5CF6", "#22D3EE", "#34D399"],
    };
    confetti(defaults);
    setTimeout(() => {
      confetti({ ...defaults, particleCount: 50, spread: 100, origin: { y: 0.5 } });
    }, 200);
  }

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

      fireConfetti();
      setTimeout(() => {
        router.push("/study");
        router.refresh();
      }, 800);
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
      className="min-h-screen flex flex-col items-center justify-center px-4 py-24"
    >
      {/* Section heading */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true }}
        transition={{ duration: 0.6 }}
        className="text-center mb-10"
      >
        <h2 className="font-heading text-3xl sm:text-4xl font-bold text-foreground">
          Ready to Begin?
        </h2>
        <p className="text-muted-foreground mt-3 max-w-md mx-auto">
          Create your account or sign in to continue your IGCSE preparation
        </p>
      </motion.div>

      {/* Tilt wrapper */}
      <motion.div
        initial={{ opacity: 0, y: 40, scale: 0.95 }}
        whileInView={{ opacity: 1, y: 0, scale: 1 }}
        viewport={{ once: true }}
        transition={{ type: "spring", stiffness: 80, damping: 20, delay: 0.2 }}
      >
        <Tilt
          tiltMaxAngleX={4}
          tiltMaxAngleY={4}
          glareEnable
          glareMaxOpacity={0.08}
          glareColor="#6366F1"
          scale={1.02}
          transitionSpeed={1500}
          className="w-full max-w-md"
        >
          {/* Animated gradient border wrapper */}
          <div className="relative rounded-3xl p-[1px] auth-card-border">
            {/* Inner glassmorphism card */}
            <div className="relative rounded-3xl bg-[#131929]/80 backdrop-blur-2xl p-8 auth-card-glow">
              {/* Mode toggle */}
              <div className="relative flex rounded-xl bg-white/[0.04] p-1 mb-6">
                <motion.div
                  layoutId="auth-tab"
                  className="absolute inset-y-1 rounded-lg bg-indigo-500/20"
                  style={{
                    left: mode === "login" ? "4px" : "50%",
                    right: mode === "signup" ? "4px" : "50%",
                  }}
                  transition={{ type: "spring", stiffness: 300, damping: 30 }}
                />
                <button
                  onClick={() => { setMode("login"); setError(null); }}
                  className={cn(
                    "relative z-10 flex-1 py-2.5 text-sm font-medium rounded-lg transition-colors cursor-pointer",
                    mode === "login" ? "text-white" : "text-muted-foreground hover:text-foreground"
                  )}
                >
                  Log in
                </button>
                <button
                  onClick={() => { setMode("signup"); setError(null); }}
                  className={cn(
                    "relative z-10 flex-1 py-2.5 text-sm font-medium rounded-lg transition-colors cursor-pointer",
                    mode === "signup" ? "text-white" : "text-muted-foreground hover:text-foreground"
                  )}
                >
                  Sign up
                </button>
              </div>

              {/* Form */}
              <form onSubmit={handleSubmit} className="space-y-4">
                {/* Name field (signup only) */}
                <AnimatePresence>
                  {mode === "signup" && (
                    <motion.div
                      key="name-field"
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: "auto", opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                      transition={{ duration: 0.2 }}
                      className="overflow-hidden"
                    >
                      <label
                        htmlFor="auth-name"
                        className="block text-xs font-medium text-muted-foreground mb-1.5"
                      >
                        Name
                      </label>
                      <div className="relative">
                        <User className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                        <input
                          id="auth-name"
                          type="text"
                          value={name}
                          onChange={(e) => setName(e.target.value)}
                          placeholder="Your first name"
                          className="w-full rounded-xl bg-white/[0.04] border border-white/[0.08] pl-11 pr-4 py-3 text-sm text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:ring-2 focus:ring-indigo-500/30 focus:border-indigo-500/50 transition-all"
                        />
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>

                {/* Email */}
                <div>
                  <label
                    htmlFor="auth-email"
                    className="block text-xs font-medium text-muted-foreground mb-1.5"
                  >
                    Email
                  </label>
                  <div className="relative">
                    <Mail className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                    <input
                      id="auth-email"
                      type="email"
                      required
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      placeholder="you@example.com"
                      className="w-full rounded-xl bg-white/[0.04] border border-white/[0.08] pl-11 pr-4 py-3 text-sm text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:ring-2 focus:ring-indigo-500/30 focus:border-indigo-500/50 transition-all"
                    />
                  </div>
                </div>

                {/* Password */}
                <div>
                  <label
                    htmlFor="auth-password"
                    className="block text-xs font-medium text-muted-foreground mb-1.5"
                  >
                    Password
                  </label>
                  <div className="relative">
                    <Lock className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                    <input
                      id="auth-password"
                      type="password"
                      required
                      minLength={6}
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      placeholder="At least 6 characters"
                      className="w-full rounded-xl bg-white/[0.04] border border-white/[0.08] pl-11 pr-4 py-3 text-sm text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:ring-2 focus:ring-indigo-500/30 focus:border-indigo-500/50 transition-all"
                    />
                  </div>
                </div>

                {/* Error */}
                <AnimatePresence>
                  {error && (
                    <motion.div
                      initial={{ opacity: 0, height: 0 }}
                      animate={{ opacity: 1, height: "auto" }}
                      exit={{ opacity: 0, height: 0 }}
                      className="rounded-xl bg-red-500/10 border border-red-500/20 px-4 py-3 overflow-hidden"
                    >
                      <p className="text-sm text-red-400">{error}</p>
                    </motion.div>
                  )}
                </AnimatePresence>

                {/* Submit */}
                <motion.button
                  type="submit"
                  disabled={loading}
                  whileTap={{ scale: 0.98 }}
                  className={cn(
                    "w-full rounded-xl py-3 text-sm font-semibold transition-all cursor-pointer",
                    "bg-gradient-to-r from-indigo-500 to-purple-600 text-white",
                    "hover:shadow-lg hover:shadow-indigo-500/30",
                    loading ? "opacity-60 cursor-not-allowed" : ""
                  )}
                >
                  {loading ? (
                    <span className="flex items-center justify-center gap-2">
                      <Loader2 className="w-4 h-4 animate-spin" />
                      <span>{mode === "login" ? "Signing in..." : "Creating account..."}</span>
                    </span>
                  ) : (
                    mode === "login" ? "Log in" : "Create account"
                  )}
                </motion.button>
              </form>
            </div>
          </div>
        </Tilt>
      </motion.div>
    </section>
  );
}
