"use client";

import { motion } from "framer-motion";

export default function Intro() {
  return (
    <section id="intro" className="py-32 sm:py-40 px-6">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true, margin: "-100px" }}
        transition={{ duration: 0.9, ease: [0.22, 1, 0.36, 1] }}
        className="max-w-2xl mx-auto text-center"
      >
        <div className="w-12 h-px bg-[#C2410C] mx-auto mb-10" />
        <p
          className="text-2xl sm:text-3xl leading-relaxed text-stone-700 italic"
          style={{ fontFamily: "var(--font-fraunces)" }}
        >
          Built for Luísa and every CLIP Porto student facing the Cambridge
          June 2026 exams. Eight subjects. Eight thousand questions. Two
          hundred and eighty-seven past papers. One quiet corner of the
          internet to prepare.
        </p>
      </motion.div>
    </section>
  );
}
