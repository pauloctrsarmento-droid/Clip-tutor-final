"use client";

import { useEffect, useRef, useState } from "react";
import { motion, useInView, useSpring, useMotionValue } from "framer-motion";

interface StatProps {
  value: number;
  suffix?: string;
  label: string;
  delay?: number;
}

function AnimatedStat({ value, suffix = "", label, delay = 0 }: StatProps) {
  const ref = useRef<HTMLDivElement>(null);
  const isInView = useInView(ref, { once: true, margin: "-80px" });
  const motionValue = useMotionValue(0);
  const spring = useSpring(motionValue, { stiffness: 50, damping: 15 });
  const [display, setDisplay] = useState("0");

  useEffect(() => {
    if (isInView) {
      const timeout = setTimeout(() => {
        motionValue.set(value);
      }, delay);
      return () => clearTimeout(timeout);
    }
  }, [isInView, value, motionValue, delay]);

  useEffect(() => {
    const unsubscribe = spring.on("change", (v) => {
      setDisplay(Math.round(v).toLocaleString());
    });
    return unsubscribe;
  }, [spring]);

  return (
    <div ref={ref} className="text-center px-6 py-3">
      <div className="font-heading text-3xl sm:text-4xl font-bold text-white tabular-nums">
        {display}
        {suffix}
      </div>
      <div className="text-xs sm:text-sm text-muted-foreground uppercase tracking-wider mt-1">
        {label}
      </div>
    </div>
  );
}

const STATS = [
  { value: 8, suffix: "", label: "Subjects" },
  { value: 8000, suffix: "+", label: "Questions" },
  { value: 287, suffix: "", label: "Past Papers" },
  { value: 100, suffix: "%", label: "Free" },
];

export default function StatsBar() {
  return (
    <section className="relative py-12 sm:py-16">
      <div className="bg-white/[0.02] backdrop-blur-sm border-y border-white/[0.06] py-10 sm:py-12">
        <motion.div
          initial={{ opacity: 0 }}
          whileInView={{ opacity: 1 }}
          viewport={{ once: true }}
          transition={{ duration: 0.6 }}
          className="flex flex-wrap items-center justify-center gap-8 sm:gap-12 max-w-4xl mx-auto"
        >
          {STATS.map((stat, i) => (
            <AnimatedStat
              key={stat.label}
              value={stat.value}
              suffix={stat.suffix}
              label={stat.label}
              delay={i * 150}
            />
          ))}
        </motion.div>
      </div>
    </section>
  );
}
