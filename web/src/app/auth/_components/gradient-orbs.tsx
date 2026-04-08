"use client";

export default function GradientOrbs() {
  return (
    <div className="fixed inset-0 z-[2] pointer-events-none overflow-hidden" aria-hidden="true">
      {/* Orb 1: indigo → purple, top-left float */}
      <div
        className="absolute -top-[10%] -left-[5%] w-[400px] h-[400px] rounded-full bg-gradient-to-br from-indigo-500 to-purple-600 opacity-12 blur-[80px]"
        style={{ animation: "float-orb-1 20s ease-in-out infinite" }}
      />
      {/* Orb 2: cyan → blue, center-right float */}
      <div
        className="absolute top-[40%] -right-[10%] w-[350px] h-[350px] rounded-full bg-gradient-to-br from-cyan-500 to-blue-500 opacity-10 blur-[80px]"
        style={{ animation: "float-orb-2 25s ease-in-out infinite" }}
      />
      {/* Orb 3: violet → fuchsia, bottom-left float */}
      <div
        className="absolute -bottom-[5%] left-[20%] w-[450px] h-[450px] rounded-full bg-gradient-to-br from-violet-500 to-fuchsia-500 opacity-8 blur-[80px]"
        style={{ animation: "float-orb-3 18s ease-in-out infinite" }}
      />
    </div>
  );
}
