"use client";

import Image from "next/image";
import { motion } from "framer-motion";
import { cn } from "@/lib/utils";

interface FeatureRowProps {
  photo: string;
  alt: string;
  eyebrow: string;
  title: string;
  body: string;
  reverse?: boolean;
}

export default function FeatureRow({
  photo,
  alt,
  eyebrow,
  title,
  body,
  reverse = false,
}: FeatureRowProps) {
  return (
    <div className="max-w-6xl mx-auto px-6">
      <div
        className={cn(
          "grid md:grid-cols-5 gap-12 md:gap-16 items-center",
          reverse && "md:[&>*:first-child]:order-2"
        )}
      >
        {/* Photo */}
        <motion.div
          initial={{ opacity: 0, y: 30 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: "-80px" }}
          transition={{ duration: 0.9, ease: [0.22, 1, 0.36, 1] }}
          className="md:col-span-3 relative aspect-square overflow-hidden rounded-sm"
        >
          <Image
            src={photo}
            alt={alt}
            fill
            sizes="(max-width: 768px) 100vw, 60vw"
            className="object-cover"
          />
        </motion.div>

        {/* Text */}
        <motion.div
          initial={{ opacity: 0, y: 30 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: "-80px" }}
          transition={{
            duration: 0.9,
            delay: 0.15,
            ease: [0.22, 1, 0.36, 1],
          }}
          className="md:col-span-2"
        >
          <p className="text-[11px] tracking-[0.25em] uppercase text-[#C2410C] mb-5">
            {eyebrow}
          </p>
          <h3
            className="text-3xl sm:text-4xl lg:text-5xl text-stone-900 leading-tight mb-6"
            style={{ fontFamily: "var(--font-fraunces)", fontWeight: 400 }}
          >
            {title}
          </h3>
          <p className="text-base sm:text-lg text-stone-600 leading-relaxed">
            {body}
          </p>
        </motion.div>
      </div>
    </div>
  );
}
