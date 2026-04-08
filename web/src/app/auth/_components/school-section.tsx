"use client";

import { motion, useScroll, useTransform } from "framer-motion";
import { useRef } from "react";
import { GraduationCap, Award, Globe } from "lucide-react";

export default function SchoolSection() {
  const sectionRef = useRef<HTMLDivElement>(null);
  const { scrollYProgress } = useScroll({
    target: sectionRef,
    offset: ["start end", "end start"],
  });
  const imageY = useTransform(scrollYProgress, [0, 1], [30, -30]);

  return (
    <section ref={sectionRef} className="relative py-24 px-6">
      <div className="max-w-5xl mx-auto grid grid-cols-1 lg:grid-cols-2 gap-12 lg:gap-16 items-center">
        {/* Text column */}
        <motion.div
          initial={{ opacity: 0, x: -30 }}
          whileInView={{ opacity: 1, x: 0 }}
          viewport={{ once: true, margin: "-80px" }}
          transition={{ duration: 0.6 }}
        >
          <span className="text-xs uppercase tracking-[0.2em] text-indigo-400 font-medium">
            Built for
          </span>
          <h2 className="font-heading text-2xl sm:text-3xl font-bold text-foreground mt-3">
            Colegio Luso-Internacional do Porto
          </h2>
          <p className="text-lg text-muted-foreground italic mt-3">
            &ldquo;Open minds, Open future&rdquo;
          </p>
          <p className="text-muted-foreground mt-4 leading-relaxed">
            Custom-built for CLIP Porto IGCSE students preparing for the
            Cambridge June 2026 examination session. Covering all 8 subjects
            with real past papers and AI-powered revision.
          </p>

          {/* Accreditation badges */}
          <div className="flex flex-wrap gap-4 mt-8">
            <div className="flex items-center gap-2 rounded-lg bg-white/[0.04] border border-white/[0.08] px-3 py-2">
              <GraduationCap className="w-4 h-4 text-indigo-400" />
              <span className="text-xs text-muted-foreground font-medium">Cambridge IGCSE</span>
            </div>
            <div className="flex items-center gap-2 rounded-lg bg-white/[0.04] border border-white/[0.08] px-3 py-2">
              <Award className="w-4 h-4 text-amber-400" />
              <span className="text-xs text-muted-foreground font-medium">CIS Accredited</span>
            </div>
            <div className="flex items-center gap-2 rounded-lg bg-white/[0.04] border border-white/[0.08] px-3 py-2">
              <Globe className="w-4 h-4 text-emerald-400" />
              <span className="text-xs text-muted-foreground font-medium">40+ Nationalities</span>
            </div>
          </div>
        </motion.div>

        {/* Image column */}
        <motion.div
          initial={{ opacity: 0, x: 30 }}
          whileInView={{ opacity: 1, x: 0 }}
          viewport={{ once: true, margin: "-80px" }}
          transition={{ duration: 0.6, delay: 0.2 }}
          style={{ y: imageY }}
        >
          <div className="aspect-video rounded-3xl overflow-hidden bg-gradient-to-br from-indigo-500/10 via-purple-500/5 to-cyan-500/10 border border-white/[0.06] flex items-center justify-center">
            {/* Placeholder — replace with real CLIP Porto photo */}
            <div className="text-center p-8">
              <div className="w-20 h-20 rounded-2xl bg-gradient-to-br from-indigo-500/20 to-purple-500/20 flex items-center justify-center mx-auto mb-4">
                <GraduationCap className="w-10 h-10 text-indigo-400" />
              </div>
              <p className="font-heading text-xl font-bold text-foreground">
                CLIP Porto
              </p>
              <p className="text-sm text-muted-foreground mt-1">
                International School
              </p>
            </div>
          </div>
        </motion.div>
      </div>
    </section>
  );
}
