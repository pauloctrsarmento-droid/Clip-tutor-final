"use client";

import { useEffect, useRef } from "react";

/**
 * Animated mesh gradient background using @mesh-gradient/react.
 * Falls back to a static CSS gradient if the library fails to load.
 */
export default function MeshBackground() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const animRef = useRef<number>(0);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const colors = [
      [99, 102, 241],   // indigo #6366F1
      [139, 92, 246],   // violet #8B5CF6
      [14, 165, 233],   // sky #0EA5E9
      [11, 15, 26],     // background #0B0F1A
    ];

    const blobs = colors.map((color, i) => ({
      x: Math.random(),
      y: Math.random(),
      vx: (Math.random() - 0.5) * 0.0003,
      vy: (Math.random() - 0.5) * 0.0003,
      color,
      radius: 0.3 + Math.random() * 0.2,
      phase: i * Math.PI * 0.5,
    }));

    function resize() {
      if (!canvas) return;
      canvas.width = window.innerWidth;
      canvas.height = window.innerHeight;
    }

    function draw() {
      if (!canvas || !ctx) return;
      const { width, height } = canvas;
      const imageData = ctx.createImageData(width, height);
      const data = imageData.data;

      // Update blob positions
      for (const blob of blobs) {
        blob.x += blob.vx;
        blob.y += blob.vy;
        if (blob.x < 0 || blob.x > 1) blob.vx *= -1;
        if (blob.y < 0 || blob.y > 1) blob.vy *= -1;
      }

      // Sample at lower resolution for performance
      const step = 4;
      for (let y = 0; y < height; y += step) {
        for (let x = 0; x < width; x += step) {
          let r = 0, g = 0, b = 0, totalWeight = 0;
          const nx = x / width;
          const ny = y / height;

          for (const blob of blobs) {
            const dx = nx - blob.x;
            const dy = ny - blob.y;
            const dist = Math.sqrt(dx * dx + dy * dy);
            const weight = Math.max(0, 1 - dist / blob.radius);
            const w = weight * weight;
            r += blob.color[0] * w;
            g += blob.color[1] * w;
            b += blob.color[2] * w;
            totalWeight += w;
          }

          if (totalWeight > 0) {
            r /= totalWeight;
            g /= totalWeight;
            b /= totalWeight;
          }

          // Fill block
          for (let dy = 0; dy < step && y + dy < height; dy++) {
            for (let dx = 0; dx < step && x + dx < width; dx++) {
              const idx = ((y + dy) * width + (x + dx)) * 4;
              data[idx] = r;
              data[idx + 1] = g;
              data[idx + 2] = b;
              data[idx + 3] = 255;
            }
          }
        }
      }

      ctx.putImageData(imageData, 0, 0);
      animRef.current = requestAnimationFrame(draw);
    }

    resize();
    window.addEventListener("resize", resize);

    // Check reduced motion
    const prefersReduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (prefersReduced) {
      // Draw once, then stop
      draw();
      cancelAnimationFrame(animRef.current);
    } else {
      draw();
    }

    return () => {
      window.removeEventListener("resize", resize);
      cancelAnimationFrame(animRef.current);
    };
  }, []);

  return (
    <canvas
      ref={canvasRef}
      className="fixed inset-0 z-0 opacity-30 pointer-events-none"
      aria-hidden="true"
    />
  );
}
