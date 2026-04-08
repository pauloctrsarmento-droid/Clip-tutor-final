"use client";

import Image from "next/image";
import { motion } from "framer-motion";

export default function Hero() {
  function scrollToIntro() {
    document.getElementById("intro")?.scrollIntoView({ behavior: "smooth" });
  }

  return (
    <section className="relative h-[92vh] w-full overflow-hidden">
      {/* Full-bleed photo */}
      <Image
        src="/auth/hero.jpg"
        alt="A student studying at a wooden desk in golden hour light"
        fill
        priority
        sizes="100vw"
        className="object-cover"
      />

      {/* Dark gradient overlay */}
      <div className="absolute inset-0 bg-gradient-to-b from-[#1A0F0A]/20 via-[#1A0F0A]/40 to-[#1A0F0A]/80" />

      {/* Content */}
      <div className="relative z-10 h-full flex items-end">
        <div className="max-w-6xl mx-auto w-full px-6 pb-20 md:pb-24">
          <motion.div
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.9, ease: [0.22, 1, 0.36, 1] }}
          >
            <p className="text-[11px] tracking-[0.25em] uppercase text-[#F5F1E8]/80 mb-5">
              IGCSE · June 2026
            </p>
            <h1
              className="text-5xl sm:text-7xl lg:text-8xl text-[#F5F1E8] leading-[0.95] max-w-4xl"
              style={{ fontFamily: "var(--font-fraunces)", fontWeight: 400 }}
            >
              Study like you
              <br />
              <em className="italic font-light">mean it.</em>
            </h1>
            <p
              className="mt-8 text-xl sm:text-2xl text-[#F5F1E8]/75 italic max-w-xl"
              style={{ fontFamily: "var(--font-fraunces)" }}
            >
              A quiet place for loud ambition.
            </p>
            <button
              onClick={scrollToIntro}
              className="mt-12 inline-flex items-center gap-3 text-[#F5F1E8]/90 hover:text-[#F5F1E8] transition-colors text-base cursor-pointer group"
              style={{ fontFamily: "var(--font-fraunces)" }}
            >
              <span className="italic">Discover more</span>
              <span className="inline-block w-12 h-px bg-[#F5F1E8]/60 group-hover:bg-[#F5F1E8] group-hover:w-16 transition-all" />
            </button>
          </motion.div>
        </div>
      </div>

      {/* Scroll indicator */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 1.4, duration: 0.8 }}
        className="absolute bottom-8 left-1/2 -translate-x-1/2 z-10 flex flex-col items-center gap-2 pointer-events-none"
      >
        <span
          className="text-[10px] tracking-[0.25em] uppercase text-[#F5F1E8]/60"
          style={{ fontFamily: "var(--font-dm-sans)" }}
        >
          Scroll
        </span>
        <motion.div
          animate={{ y: [0, 8, 0] }}
          transition={{ duration: 2, repeat: Infinity, ease: "easeInOut" }}
          className="w-px h-10 bg-gradient-to-b from-[#F5F1E8]/60 to-transparent"
        />
      </motion.div>
    </section>
  );
}
