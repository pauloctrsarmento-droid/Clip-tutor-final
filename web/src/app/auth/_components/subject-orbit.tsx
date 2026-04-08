"use client";

import { SUBJECT_META } from "@/lib/subject-meta";

const SUBJECTS = [
  { code: "0620", name: "Chemistry" },
  { code: "0625", name: "Physics" },
  { code: "0610", name: "Biology" },
  { code: "0478", name: "CS" },
  { code: "0500", name: "English" },
  { code: "0475", name: "Literature" },
  { code: "0520", name: "French" },
  { code: "0504", name: "Portuguese" },
];

export default function SubjectOrbit() {
  const radius = 140;

  return (
    <div
      className="relative w-[320px] h-[320px] group"
      aria-label="8 IGCSE subjects orbiting"
    >
      {/* Orbit ring (rotating container) */}
      <div
        className="absolute inset-0 group-hover:[animation-play-state:paused]"
        style={{ animation: "orbit 60s linear infinite" }}
      >
        {SUBJECTS.map((subject, i) => {
          const meta = SUBJECT_META[subject.code];
          if (!meta) return null;

          const angle = (i / SUBJECTS.length) * Math.PI * 2;
          const x = Math.cos(angle) * radius;
          const y = Math.sin(angle) * radius;
          const Icon = meta.icon;

          return (
            <div
              key={subject.code}
              className="absolute left-1/2 top-1/2"
              style={{
                transform: `translate(-50%, -50%) translate(${x}px, ${y}px)`,
              }}
            >
              {/* Counter-rotate to keep icons upright */}
              <div
                className="group-hover:[animation-play-state:paused]"
                style={{ animation: "orbit 60s linear infinite reverse" }}
              >
                <div
                  className={`w-12 h-12 rounded-2xl bg-gradient-to-br ${meta.gradient} flex items-center justify-center shadow-lg`}
                  title={subject.name}
                >
                  <Icon className={`w-5 h-5 ${meta.accent}`} />
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Center label */}
      <div className="absolute inset-0 flex items-center justify-center">
        <div className="text-center">
          <span className="text-2xl font-heading font-bold text-foreground">8</span>
          <br />
          <span className="text-xs text-muted-foreground">subjects</span>
        </div>
      </div>
    </div>
  );
}
