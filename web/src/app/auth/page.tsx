"use client";

import dynamic from "next/dynamic";
import HeroSection from "./_components/hero-section";
import FeaturesSection from "./_components/features-section";
import StatsBar from "./_components/stats-bar";
import ExamCountdown from "./_components/exam-countdown";
import SchoolSection from "./_components/school-section";
import AuthCard from "./_components/auth-card";
import GradientOrbs from "./_components/gradient-orbs";

/* Lazy-load heavy background components to avoid blocking first paint */
const MeshBackground = dynamic(() => import("./_components/mesh-background"), {
  ssr: false,
});
const ParticleField = dynamic(() => import("./_components/particle-field"), {
  ssr: false,
});

export default function AuthPage() {
  return (
    <div className="relative min-h-screen bg-background overflow-x-hidden">
      {/* ── Fixed background layers ── */}
      <MeshBackground />
      <ParticleField />
      <GradientOrbs />

      {/* ── Scrollable content ── */}
      <main className="relative z-10">
        <HeroSection />
        <FeaturesSection />
        <StatsBar />
        <ExamCountdown />
        <SchoolSection />
        <AuthCard />

        {/* Footer */}
        <footer className="py-8 text-center">
          <p className="text-xs text-muted-foreground/50">
            Built with care for CLIP Porto
          </p>
        </footer>
      </main>
    </div>
  );
}
