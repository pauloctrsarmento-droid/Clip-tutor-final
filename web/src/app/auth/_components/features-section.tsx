"use client";

import { motion } from "framer-motion";
import { Target, Brain, FileText } from "lucide-react";
import type { LucideIcon } from "lucide-react";

interface Feature {
  icon: LucideIcon;
  iconColor: string;
  iconBg: string;
  title: string;
  description: string;
}

const FEATURES: Feature[] = [
  {
    icon: Target,
    iconColor: "text-indigo-400",
    iconBg: "from-indigo-500/20 to-indigo-600/20",
    title: "Smart Practice",
    description:
      "AI selects the right questions at the right time, focusing on your weakest areas to maximise improvement.",
  },
  {
    icon: Brain,
    iconColor: "text-violet-400",
    iconBg: "from-violet-500/20 to-purple-600/20",
    title: "Spaced Repetition",
    description:
      "Flashcards that adapt to what you know. Review at the perfect moment to lock knowledge in long-term memory.",
  },
  {
    icon: FileText,
    iconColor: "text-emerald-400",
    iconBg: "from-emerald-500/20 to-teal-600/20",
    title: "Past Paper Drill",
    description:
      "287 real Cambridge past papers with instant marking, detailed explanations, and progress tracking.",
  },
];

export default function FeaturesSection() {
  return (
    <section id="features" className="relative py-24 px-6">
      <div className="max-w-5xl mx-auto">
        {/* Heading */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: "-80px" }}
          transition={{ duration: 0.6 }}
          className="text-center mb-16"
        >
          <h2 className="font-heading text-3xl sm:text-4xl font-bold text-foreground">
            Everything You{" "}
            <span className="gradient-shimmer-text">Need</span>
          </h2>
          <p className="text-muted-foreground mt-4 max-w-lg mx-auto">
            Three powerful tools designed to get you exam-ready
          </p>
        </motion.div>

        {/* Cards grid */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {FEATURES.map((feature, i) => {
            const Icon = feature.icon;
            return (
              <motion.div
                key={feature.title}
                initial={{ opacity: 0, y: 40 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true, margin: "-80px" }}
                transition={{ duration: 0.5, delay: i * 0.15 }}
                className="group relative rounded-3xl bg-white/[0.03] backdrop-blur-md border border-white/[0.06] p-8 hover:border-indigo-500/20 hover:shadow-xl hover:shadow-indigo-500/5 transition-all duration-300 hover:scale-[1.02] cursor-default"
              >
                {/* Icon */}
                <div
                  className={`w-12 h-12 rounded-2xl bg-gradient-to-br ${feature.iconBg} flex items-center justify-center mb-5`}
                >
                  <Icon className={`w-5 h-5 ${feature.iconColor}`} />
                </div>

                {/* Text */}
                <h3 className="font-heading text-lg font-semibold text-foreground mb-3">
                  {feature.title}
                </h3>
                <p className="text-sm text-muted-foreground leading-relaxed">
                  {feature.description}
                </p>
              </motion.div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
