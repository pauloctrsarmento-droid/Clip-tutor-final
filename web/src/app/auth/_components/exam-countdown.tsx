"use client";

import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { Clock } from "lucide-react";

const EXAM_DATE = new Date("2026-06-01T09:00:00");

interface TimeLeft {
  days: number;
  hours: number;
  minutes: number;
  seconds: number;
}

function getTimeLeft(): TimeLeft {
  const diff = EXAM_DATE.getTime() - Date.now();
  if (diff <= 0) return { days: 0, hours: 0, minutes: 0, seconds: 0 };

  return {
    days: Math.floor(diff / (1000 * 60 * 60 * 24)),
    hours: Math.floor((diff / (1000 * 60 * 60)) % 24),
    minutes: Math.floor((diff / (1000 * 60)) % 60),
    seconds: Math.floor((diff / 1000) % 60),
  };
}

interface FlipCardProps {
  value: number;
  label: string;
}

function FlipCard({ value, label }: FlipCardProps) {
  const display = String(value).padStart(2, "0");

  return (
    <div className="flex flex-col items-center gap-2">
      <div className="relative bg-white/[0.04] backdrop-blur-sm border border-white/[0.08] rounded-2xl px-4 sm:px-6 py-3 sm:py-4 min-w-[70px] sm:min-w-[85px]">
        <span
          key={display}
          className="font-heading text-2xl sm:text-3xl lg:text-4xl font-bold text-white tabular-nums inline-block"
          style={{ animation: "digit-pop 200ms ease-out" }}
        >
          {display}
        </span>
      </div>
      <span className="text-[10px] sm:text-xs text-muted-foreground uppercase tracking-wider">
        {label}
      </span>
    </div>
  );
}

export default function ExamCountdown() {
  const [time, setTime] = useState<TimeLeft>(getTimeLeft);

  useEffect(() => {
    const interval = setInterval(() => {
      setTime(getTimeLeft());
    }, 1000);
    return () => clearInterval(interval);
  }, []);

  return (
    <section className="relative py-16 sm:py-20 px-6">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true }}
        transition={{ duration: 0.6 }}
        className="max-w-2xl mx-auto text-center"
      >
        {/* Heading */}
        <div className="flex items-center justify-center gap-2 mb-8">
          <Clock className="w-5 h-5 text-indigo-400" />
          <h2 className="font-heading text-xl sm:text-2xl font-bold text-foreground">
            Countdown to IGCSE
          </h2>
        </div>

        {/* Flip cards */}
        <div className="flex items-center justify-center gap-3 sm:gap-5">
          <FlipCard value={time.days} label="Days" />
          <span className="text-2xl font-bold text-muted-foreground/40 mt-[-20px]">:</span>
          <FlipCard value={time.hours} label="Hours" />
          <span className="text-2xl font-bold text-muted-foreground/40 mt-[-20px]">:</span>
          <FlipCard value={time.minutes} label="Minutes" />
          <span className="text-2xl font-bold text-muted-foreground/40 mt-[-20px] hidden sm:block">:</span>
          <div className="hidden sm:block">
            <FlipCard value={time.seconds} label="Seconds" />
          </div>
        </div>

        <p className="text-sm text-muted-foreground mt-6">
          Every day counts. Start preparing now.
        </p>
      </motion.div>
    </section>
  );
}
