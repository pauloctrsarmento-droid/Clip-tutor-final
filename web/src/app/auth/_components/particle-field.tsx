"use client";

import { useEffect, useMemo, useState } from "react";
import Particles, { initParticlesEngine } from "@tsparticles/react";
import { loadSlim } from "@tsparticles/slim";
import type { ISourceOptions } from "@tsparticles/engine";

const SUBJECT_COLORS = [
  "#a78bfa", // Chemistry (violet)
  "#fbbf24", // Physics (amber)
  "#34d399", // Biology (emerald)
  "#22d3ee", // CS (cyan)
  "#fb7185", // English Lang (rose)
  "#818cf8", // English Lit (indigo)
  "#38bdf8", // French (sky)
  "#a3e635", // Portuguese (lime)
];

export default function ParticleField() {
  const [ready, setReady] = useState(false);

  useEffect(() => {
    initParticlesEngine(async (engine) => {
      await loadSlim(engine);
    }).then(() => setReady(true));
  }, []);

  const options: ISourceOptions = useMemo(
    () => ({
      fullScreen: false,
      fpsLimit: 60,
      particles: {
        number: {
          value: 60,
          density: { enable: true },
        },
        color: {
          value: SUBJECT_COLORS,
        },
        opacity: {
          value: { min: 0.2, max: 0.5 },
        },
        size: {
          value: { min: 1, max: 3 },
        },
        move: {
          enable: true,
          speed: 0.4,
          direction: "top" as const,
          outModes: { default: "out" as const },
          straight: false,
        },
        links: {
          enable: true,
          color: "#6366F1",
          distance: 120,
          opacity: 0.04,
          width: 1,
        },
        wobble: {
          enable: true,
          distance: 10,
          speed: { min: -2, max: 2 },
        },
      },
      interactivity: {
        events: {
          onHover: {
            enable: true,
            mode: "repulse",
          },
        },
        modes: {
          repulse: {
            distance: 150,
            speed: 0.5,
          },
        },
      },
      detectRetina: true,
      responsive: [
        {
          maxWidth: 640,
          options: {
            particles: {
              number: { value: 30 },
            },
          },
        },
      ],
    }),
    []
  );

  if (!ready) return null;

  return (
    <Particles
      id="auth-particles"
      className="fixed inset-0 z-[1] pointer-events-none"
      options={options}
    />
  );
}
