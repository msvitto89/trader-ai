"use client";

import { useEffect, useRef } from "react";
import { gsap } from "gsap";

/**
 * Minimal 3D hero object — a rotating wireframe icosahedron built from CSS
 * transforms rather than WebGL.
 *
 * Why not three.js: this deploys to a 512 MB free container, and a WebGL
 * context plus three.js would dwarf the rest of the page. A ~40-node CSS scene
 * gives real perspective and depth, costs almost nothing, and renders crisply
 * at any DPI. It tilts toward the pointer and idles on its own axis.
 */

const RADIUS = 150;
/** Icosahedron vertex set (golden-ratio construction). */
const PHI = (1 + Math.sqrt(5)) / 2;

const VERTICES: [number, number, number][] = [
  [-1, PHI, 0], [1, PHI, 0], [-1, -PHI, 0], [1, -PHI, 0],
  [0, -1, PHI], [0, 1, PHI], [0, -1, -PHI], [0, 1, -PHI],
  [PHI, 0, -1], [PHI, 0, 1], [-PHI, 0, -1], [-PHI, 0, 1],
].map(([x, y, z]) => {
  const len = Math.hypot(x, y, z);
  return [(x / len) * RADIUS, (y / len) * RADIUS, (z / len) * RADIUS] as [number, number, number];
});

/** Edges of the icosahedron, expressed as vertex index pairs. */
const EDGES: [number, number][] = [
  [0, 1], [0, 5], [0, 7], [0, 10], [0, 11],
  [1, 5], [1, 7], [1, 8], [1, 9],
  [2, 3], [2, 4], [2, 6], [2, 10], [2, 11],
  [3, 4], [3, 6], [3, 8], [3, 9],
  [4, 5], [4, 9], [4, 11],
  [5, 9], [5, 11],
  [6, 7], [6, 8], [6, 10],
  [7, 8], [7, 10],
  [8, 9], [10, 11],
];

function edgeStyle(a: [number, number, number], b: [number, number, number]) {
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  const dz = b[2] - a[2];
  const length = Math.hypot(dx, dy, dz);
  // Rotation that maps +X onto the edge vector.
  const yaw = Math.atan2(-dz, dx);
  const pitch = Math.asin(dy / length);
  const mx = (a[0] + b[0]) / 2;
  const my = (a[1] + b[1]) / 2;
  const mz = (a[2] + b[2]) / 2;
  return {
    width: length,
    transform:
      `translate3d(${mx - length / 2}px, ${my}px, ${mz}px) ` +
      `rotateY(${yaw}rad) rotateZ(${pitch}rad)`,
  };
}

export function HeroObject() {
  const sceneRef = useRef<HTMLDivElement | null>(null);
  const stageRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const stage = stageRef.current;
    const scene = sceneRef.current;
    if (!stage || !scene) return;

    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    // Idle rotation: two independent axes so the form never looks like a flat
    // spinning plate.
    const spin = reduced
      ? null
      : gsap.to(scene, {
          rotateY: 360,
          rotateZ: -360,
          duration: 46,
          repeat: -1,
          ease: "none",
          transformPerspective: 1400,
        });

    if (reduced) return;

    // Pointer parallax on the stage, damped so it feels like weight, not cursor
    // tracking.
    const settleX = gsap.quickTo(stage, "rotateX", { duration: 0.9, ease: "power3.out" });
    const settleY = gsap.quickTo(stage, "rotateY", { duration: 0.9, ease: "power3.out" });

    const onMove = (event: PointerEvent) => {
      const { innerWidth, innerHeight } = window;
      const nx = event.clientX / innerWidth - 0.5;
      const ny = event.clientY / innerHeight - 0.5;
      settleX(-ny * 18);
      settleY(nx * 22);
    };

    window.addEventListener("pointermove", onMove, { passive: true });
    return () => {
      window.removeEventListener("pointermove", onMove);
      spin?.kill();
    };
  }, []);

  return (
    <div
      aria-hidden
      className="pointer-events-none absolute inset-0 flex items-center justify-center [perspective:1400px]"
    >
      {/* Atmospheric bloom behind the object */}
      <div className="absolute size-[38rem] rounded-full bg-[radial-gradient(circle,rgba(217,164,65,0.13),transparent_62%)] blur-2xl" />

      <div
        ref={stageRef}
        className="relative [transform-style:preserve-3d]"
        style={{ transform: "rotateX(-8deg)" }}
      >
        <div
          ref={sceneRef}
          className="relative size-0 [transform-style:preserve-3d]"
        >
          {EDGES.map(([i, j], index) => {
            const style = edgeStyle(VERTICES[i], VERTICES[j]);
            // Depth cue: edges further back read dimmer.
            const depth =
              (VERTICES[i][2] + VERTICES[j][2]) / (2 * RADIUS);
            const opacity = 0.22 + (depth + 1) * 0.26;
            return (
              <span
                key={index}
                className="absolute left-0 top-0 h-px origin-left bg-[linear-gradient(90deg,rgba(217,164,65,0.05),rgba(217,164,65,0.85),rgba(217,164,65,0.05))]"
                style={{ ...style, opacity }}
              />
            );
          })}

          {VERTICES.map(([x, y, z], index) => {
            const depth = z / RADIUS;
            return (
              <span
                key={`v-${index}`}
                className="absolute left-0 top-0 size-[5px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-accent"
                style={{
                  transform: `translate3d(${x}px, ${y}px, ${z}px) translate(-50%, -50%)`,
                  opacity: 0.35 + (depth + 1) * 0.3,
                  boxShadow: "0 0 10px rgba(217,164,65,0.8)",
                }}
              />
            );
          })}
        </div>
      </div>
    </div>
  );
}
