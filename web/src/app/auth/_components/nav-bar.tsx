"use client";

import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";

export default function NavBar() {
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    function onScroll() {
      setScrolled(window.scrollY > 40);
    }
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  function scrollToAuth() {
    document.getElementById("auth")?.scrollIntoView({ behavior: "smooth" });
  }

  return (
    <nav
      className={cn(
        "fixed top-0 left-0 right-0 z-50 transition-all duration-300",
        scrolled
          ? "bg-[#FBF7F1]/90 backdrop-blur-md border-b border-stone-200/50"
          : "bg-transparent border-b border-transparent"
      )}
    >
      <div className="max-w-6xl mx-auto px-6 py-5 flex items-center justify-between">
        <span
          className={cn(
            "text-xl transition-colors",
            scrolled ? "text-stone-900" : "text-[#F5F1E8]"
          )}
          style={{ fontFamily: "var(--font-fraunces)" }}
        >
          CLIP Tutor
        </span>
        <div className="flex items-center gap-6">
          <button
            onClick={scrollToAuth}
            className={cn(
              "hidden sm:block text-sm transition-colors cursor-pointer",
              scrolled
                ? "text-stone-600 hover:text-[#C2410C]"
                : "text-[#F5F1E8]/80 hover:text-[#F5F1E8]"
            )}
          >
            Create account
          </button>
          <button
            onClick={scrollToAuth}
            className={cn(
              "text-sm rounded-full px-5 py-2 transition-all cursor-pointer",
              scrolled
                ? "bg-[#C2410C] text-[#F5F1E8] hover:bg-[#7C2D12]"
                : "bg-[#F5F1E8] text-stone-900 hover:bg-white"
            )}
            style={{ fontFamily: "var(--font-fraunces)" }}
          >
            Log in →
          </button>
        </div>
      </div>
    </nav>
  );
}
