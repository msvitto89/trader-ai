"use client";

import { useEffect, useRef } from "react";

/**
 * Generative solar field — the hero's artwork.
 *
 * A drifting particle swarm with proximity links, warm amber on near-black,
 * that leans toward the pointer. Written against a raw canvas rather than a
 * library so it ships no dependency and can be tuned per-frame.
 *
 * Design notes:
 * - Particles are drawn twice: a soft glow pass and a crisp core, which reads
 *   as light rather than as dots.
 * - Link opacity is capped so the field stays an atmosphere, never a mesh.
 * - The pointer is a weak attractor, not a magnet: it should feel like the
 *   field is aware of you, not dragged by you.
 * - DPR is capped at 2 and the swarm is sized to area, so a 4K monitor does not
 *   melt while a phone still fills the screen.
 */

interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  r: number;
  depth: number;
}

export function SolarField({
  className = "",
  density = 0.00009,
  warm = true,
}: {
  className?: string;
  /** Particles per square pixel. Tuned so a 1440x900 viewport gets ~110. */
  density?: number;
  /** Amber palette instead of cool white. */
  warm?: boolean;
}) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d", { alpha: true });
    if (!ctx) return;

    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);

    let width = 0;
    let height = 0;
    let particles: Particle[] = [];
    let frame = 0;

    const pointer = { x: -9999, y: -9999, active: false };

    const theme = warm
      ? {
          core: "217, 164, 65",
          glow: "217, 164, 65",
          link: "217, 164, 65",
        }
      : {
          core: "242, 243, 245",
          glow: "167, 173, 184",
          link: "167, 173, 184",
        };

    function resize() {
      const rect = canvas!.getBoundingClientRect();
      width = rect.width;
      height = rect.height;
      canvas!.width = Math.max(1, Math.floor(width * dpr));
      canvas!.height = Math.max(1, Math.floor(height * dpr));
      ctx!.setTransform(dpr, 0, 0, dpr, 0, 0);

      const count = Math.round(
        Math.min(220, Math.max(46, width * height * density)),
      );
      particles = Array.from({ length: count }, () => ({
        x: Math.random() * width,
        y: Math.random() * height,
        vx: (Math.random() - 0.5) * 0.16,
        vy: (Math.random() - 0.5) * 0.16,
        r: 0.7 + Math.random() * 1.5,
        depth: 0.35 + Math.random() * 0.65,
      }));
    }

    function draw() {
      ctx!.clearRect(0, 0, width, height);

      // Soft light pass
      for (const p of particles) {
        const grad = ctx!.createRadialGradient(p.x, p.y, 0, p.x, p.y, p.r * 9);
        grad.addColorStop(0, `rgba(${theme.glow}, ${0.1 * p.depth})`);
        grad.addColorStop(1, `rgba(${theme.glow}, 0)`);
        ctx!.beginPath();
        ctx!.fillStyle = grad;
        ctx!.arc(p.x, p.y, p.r * 9, 0, Math.PI * 2);
        ctx!.fill();
      }

      // Proximity links, drawn before the cores so light sits on top
      const maxDist = Math.min(150, Math.max(96, width / 12));
      for (let i = 0; i < particles.length; i++) {
        const a = particles[i];
        for (let j = i + 1; j < particles.length; j++) {
          const b = particles[j];
          const dx = a.x - b.x;
          const dy = a.y - b.y;
          const dist = Math.hypot(dx, dy);
          if (dist > maxDist) continue;
          const alpha = (1 - dist / maxDist) * 0.11 * Math.min(a.depth, b.depth);
          ctx!.strokeStyle = `rgba(${theme.link}, ${alpha})`;
          ctx!.lineWidth = 0.6;
          ctx!.beginPath();
          ctx!.moveTo(a.x, a.y);
          ctx!.lineTo(b.x, b.y);
          ctx!.stroke();
        }
      }

      // Crisp cores
      for (const p of particles) {
        ctx!.beginPath();
        ctx!.fillStyle = `rgba(${theme.core}, ${0.32 + p.depth * 0.5})`;
        ctx!.arc(p.x, p.y, p.r, 0, Math.PI * 2);
        ctx!.fill();
      }
    }

    function step() {
      for (const p of particles) {
        if (pointer.active) {
          const dx = pointer.x - p.x;
          const dy = pointer.y - p.y;
          const dist = Math.hypot(dx, dy);
          // Gentle attraction inside a short radius, falling off smoothly.
          if (dist > 0.001 && dist < 240) {
            const pull = (1 - dist / 240) * 0.035 * p.depth;
            p.vx += (dx / dist) * pull;
            p.vy += (dy / dist) * pull;
          }
        }

        // Damping keeps the field from accelerating away over time.
        p.vx *= 0.992;
        p.vy *= 0.992;
        p.x += p.vx;
        p.y += p.vy;

        // Wrap at the edges so the swarm never thins out.
        if (p.x < -20) p.x = width + 20;
        if (p.x > width + 20) p.x = -20;
        if (p.y < -20) p.y = height + 20;
        if (p.y > height + 20) p.y = -20;
      }
      draw();
      frame = window.requestAnimationFrame(step);
    }

    const onPointerMove = (event: PointerEvent) => {
      const rect = canvas!.getBoundingClientRect();
      pointer.x = event.clientX - rect.left;
      pointer.y = event.clientY - rect.top;
      pointer.active = true;
    };
    const onPointerLeave = () => {
      pointer.active = false;
    };

    resize();
    draw();

    if (!reduced) {
      frame = window.requestAnimationFrame(step);
      window.addEventListener("pointermove", onPointerMove, { passive: true });
      window.addEventListener("pointerleave", onPointerLeave);
    }

    const onResize = () => {
      resize();
      draw();
    };
    window.addEventListener("resize", onResize);

    return () => {
      window.cancelAnimationFrame(frame);
      window.removeEventListener("resize", onResize);
      window.removeEventListener("pointermove", onPointerMove);
      window.removeEventListener("pointerleave", onPointerLeave);
    };
  }, [density, warm]);

  return (
    <canvas
      ref={canvasRef}
      aria-hidden
      className={`pointer-events-none size-full ${className}`}
    />
  );
}
