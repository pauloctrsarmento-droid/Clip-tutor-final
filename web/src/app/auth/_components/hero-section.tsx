"use client";

import { motion, useMotionValue, useTransform } from "framer-motion";
import { TypeAnimation } from "react-type-animation";
import { GraduationCap, ChevronDown } from "lucide-react";
import SubjectOrbit from "./subject-orbit";

export default function HeroSection() {
  const mouseX = useMotionValue(0);
  const mouseY = useMotionValue(0);

  const bgX = useTransform(mouseX, [0, 1], [-15, 15]);
  const bgY = useTransform(mouseY, [0, 1], [-15, 15]);

  function handleMouseMove(e: React.MouseEvent) {
    const { clientX, clientY } = e;
    mouseX.set(clientX / window.innerWidth);
    mouseY.set(clientY / window.innerHeight);
  }

  function scrollTo(id: string) {
    document.getElementById(id)?.scrollIntoView({ behavior: "smooth" });
  }

  return (
    <section
      className="relative min-h-screen flex flex-col items-center justify-center text-center px-6 overflow-hidden"
      onMouseMove={handleMouseMove}
    >
      {/* Parallax decorative element */}
      <motion.div
        className="absolute inset-0 pointer-events-none"
        style={{ x: bgX, y: bgY }}
        aria-hidden="true"
      >
        <div className="absolute top-[20%] left-[10%] w-2 h-2 rounded-full bg-indigo-400/30" />
        <div className="absolute top-[30%] right-[15%] w-3 h-3 rounded-full bg-purple-400/20" />
        <div className="absolute bottom-[25%] left-[20%] w-2 h-2 rounded-full bg-cyan-400/25" />
        <div className="absolute top-[60%] right-[25%] w-1.5 h-1.5 rounded-full bg-violet-400/30" />
      </motion.div>

      {/* Badge */}
      <motion.div
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, type: "spring" }}
        className="flex items-center gap-2 rounded-full bg-indigo-500/10 border border-indigo-500/20 px-4 py-1.5 mb-8"
      >
        <GraduationCap className="w-4 h-4 text-indigo-400" />
        <span className="text-xs font-medium text-indigo-400">
          Cambridge IGCSE June 2026
        </span>
      </motion.div>

      {/* Main heading */}
      <motion.h1
        initial={{ opacity: 0, y: 30 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.7, delay: 0.2 }}
        className="font-heading text-4xl sm:text-6xl lg:text-8xl font-bold text-foreground leading-tight"
      >
        Your IGCSE
        <br />
        <span className="gradient-shimmer-text">
          <TypeAnimation
            sequence={[
              "Success Story",
              1500,
              "Study Partner",
              1500,
              "Exam Coach",
              1500,
              "Secret Weapon",
              1500,
            ]}
            wrapper="span"
            speed={40}
            repeat={Infinity}
          />
        </span>
      </motion.h1>

      {/* Subtitle */}
      <motion.p
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6, delay: 0.4 }}
        className="text-base sm:text-lg lg:text-xl text-muted-foreground max-w-2xl mt-6"
      >
        AI-powered exam preparation across 8 subjects. Practice with 8,000+
        questions from 287 past papers.
      </motion.p>

      {/* CTA buttons */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6, delay: 0.6 }}
        className="flex flex-col sm:flex-row gap-4 mt-10"
      >
        <button
          onClick={() => scrollTo("auth")}
          className="px-8 py-3.5 rounded-xl bg-gradient-to-r from-indigo-500 to-purple-600 text-white font-semibold text-base shadow-lg shadow-indigo-500/25 hover:shadow-xl hover:shadow-indigo-500/30 transition-all hover:scale-[1.02] active:scale-[0.98] cursor-pointer"
        >
          Get Started
        </button>
        <button
          onClick={() => scrollTo("features")}
          className="px-8 py-3.5 rounded-xl bg-white/5 border border-white/10 backdrop-blur-sm text-foreground font-semibold text-base hover:bg-white/10 transition-all cursor-pointer"
        >
          See Features
        </button>
      </motion.div>

      {/* Subject orbit */}
      <motion.div
        initial={{ opacity: 0, scale: 0.8 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.8, delay: 0.8 }}
        className="mt-16 hidden sm:block"
      >
        <SubjectOrbit />
      </motion.div>

      {/* Scroll indicator */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 1.2 }}
        className="absolute bottom-8 left-1/2 -translate-x-1/2"
      >
        <motion.div
          animate={{ y: [0, 8, 0] }}
          transition={{ duration: 2, repeat: Infinity, ease: "easeInOut" }}
        >
          <ChevronDown className="w-6 h-6 text-muted-foreground/40" />
        </motion.div>
      </motion.div>
    </section>
  );
}
