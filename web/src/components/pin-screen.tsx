"use client";

import { useState, useRef, useCallback, useEffect } from "react";
import { useAuth } from "@/lib/auth-context";
import { verifyPin } from "@/lib/api";
import { GraduationCap, Loader2 } from "lucide-react";

export function PinScreen() {
  const { login } = useAuth();
  const [digits, setDigits] = useState(["", "", "", ""]);
  const [error, setError] = useState(false);
  const [loading, setLoading] = useState(false);
  const refs = [
    useRef<HTMLInputElement>(null),
    useRef<HTMLInputElement>(null),
    useRef<HTMLInputElement>(null),
    useRef<HTMLInputElement>(null),
  ];

  useEffect(() => {
    refs[0].current?.focus();
    // Only run on mount
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const submit = useCallback(
    async (allDigits: string[]) => {
      const pin = allDigits.join("");
      if (pin.length !== 4) return;

      setLoading(true);
      setError(false);
      const valid = await verifyPin(pin);
      setLoading(false);

      if (valid) {
        login(pin);
      } else {
        setError(true);
        setDigits(["", "", "", ""]);
        refs[0].current?.focus();
      }
    },
    [login, refs]
  );

  const handleInput = useCallback(
    (index: number, value: string) => {
      if (!/^\d?$/.test(value)) return;

      const next = [...digits];
      next[index] = value;
      setDigits(next);
      setError(false);

      if (value && index < 3) {
        refs[index + 1].current?.focus();
      }

      if (value && index === 3) {
        submit(next);
      }
    },
    [digits, refs, submit]
  );

  const handleKeyDown = useCallback(
    (index: number, e: React.KeyboardEvent) => {
      if (e.key === "Backspace" && !digits[index] && index > 0) {
        refs[index - 1].current?.focus();
      }
    },
    [digits, refs]
  );

  return (
    <div className="min-h-screen flex items-center justify-center bg-background">
      <div className="flex flex-col items-center gap-8">
        {/* Logo */}
        <div className="flex flex-col items-center gap-3">
          <div className="w-16 h-16 rounded-2xl bg-primary/10 flex items-center justify-center">
            <GraduationCap className="w-8 h-8 text-primary" />
          </div>
          <h1 className="font-heading text-2xl font-bold tracking-tight">
            CLIP Tutor
          </h1>
          <p className="text-muted-foreground text-sm">Enter admin PIN</p>
        </div>

        {/* PIN inputs */}
        <div className="flex gap-3">
          {digits.map((digit, i) => (
            <input
              key={i}
              ref={refs[i]}
              type="password"
              inputMode="numeric"
              maxLength={1}
              value={digit}
              onChange={(e) => handleInput(i, e.target.value)}
              onKeyDown={(e) => handleKeyDown(i, e)}
              disabled={loading}
              className={`
                w-14 h-16 text-center text-2xl font-heading font-bold
                rounded-xl border-2 bg-card
                outline-none transition-all duration-200
                focus:border-primary focus:ring-2 focus:ring-primary/20
                disabled:opacity-50
                ${error ? "border-destructive animate-shake" : "border-border"}
              `}
            />
          ))}
        </div>

        {/* Status */}
        <div className="h-6 flex items-center">
          {loading && (
            <Loader2 className="w-5 h-5 text-primary animate-spin" />
          )}
          {error && (
            <p className="text-destructive text-sm font-medium animate-in fade-in">
              Wrong PIN
            </p>
          )}
        </div>
      </div>

      <style>{`
        @keyframes shake {
          0%, 100% { transform: translateX(0); }
          20%, 60% { transform: translateX(-6px); }
          40%, 80% { transform: translateX(6px); }
        }
        .animate-shake { animation: shake 0.4s ease-in-out; }
      `}</style>
    </div>
  );
}
