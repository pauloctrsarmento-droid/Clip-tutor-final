"use client";

import Image from "next/image";
import { motion } from "framer-motion";

export default function School() {
  return (
    <section className="relative h-[85vh] w-full overflow-hidden my-20 sm:my-32">
      {/* Full-bleed photo */}
      <Image
        src="/auth/school.jpg"
        alt="A historic international school library with warm afternoon light"
        fill
        sizes="100vw"
        className="object-cover"
      />

      {/* Deep overlay */}
      <div className="absolute inset-0 bg-[#1A0F0A]/70" />

      {/* Content */}
      <div className="relative z-10 h-full flex items-center justify-center px-6">
        <motion.div
          initial={{ opacity: 0, y: 30 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: "-100px" }}
          transition={{ duration: 0.9, ease: [0.22, 1, 0.36, 1] }}
          className="text-center max-w-3xl"
        >
          <p className="text-[11px] tracking-[0.25em] uppercase text-[#D4A574] mb-6">
            Built for
          </p>
          <h2
            className="text-4xl sm:text-5xl lg:text-6xl text-[#F5F1E8] leading-tight mb-6"
            style={{ fontFamily: "var(--font-fraunces)", fontWeight: 400 }}
          >
            Colégio Luso-Internacional do Porto
          </h2>
          <p
            className="text-xl sm:text-2xl italic text-[#F5F1E8]/80 mb-10"
            style={{ fontFamily: "var(--font-fraunces)" }}
          >
            &ldquo;Open minds, Open future.&rdquo;
          </p>

          <div className="flex flex-wrap items-center justify-center gap-3 sm:gap-4">
            {[
              "Cambridge IGCSE",
              "CIS Accredited",
              "40+ nationalities",
            ].map((badge) => (
              <span
                key={badge}
                className="text-[11px] tracking-[0.15em] uppercase text-[#F5F1E8]/70 border border-[#F5F1E8]/25 rounded-full px-4 py-2"
              >
                {badge}
              </span>
            ))}
          </div>
        </motion.div>
      </div>
    </section>
  );
}
