"use client";

import { useEffect, useRef } from "react";

/**
 * Armillary sphere + sun — the hero's sculptural centrepiece.
 *
 * Composition, back to front:
 *   corona  — wide amber bloom that lights the type
 *   rays    — very low-opacity conic spokes, read as heat rather than lines
 *   rings   — concentric ellipses on independent 3D axes, rotating at
 *             different speeds; read as a crafted instrument (an astronomer's
 *             model, a market cycle diagram) rather than loose wireframe
 *   disc    — the sun itself, with a bright rim where light passes the edge
 *
 * Each ring nests three layers so rotation composes with tilt:
 *   tilt layer → static rotateX/rotateY, fixes the ring's plane
 *   spin layer → rotateZ animation, turns the ring inside that plane
 *   markers    → orbit the spin layer's circumference
 */

const RINGS = [
  { size: 300, tilt: 0, spin: 34, opacity: 0.66 },
  { size: 392, tilt: 58, spin: -46, opacity: 0.46 },
  { size: 486, tilt: 118, spin: 58, opacity: 0.34 },
  { size: 588, tilt: 26, spin: -74, opacity: 0.22 },
];

const MARKERS = [
  { ring: 0, duration: 16, size: 3, delay: 0 },
  { ring: 1, duration: 25, size: 2.5, delay: -8 },
  { ring: 2, duration: 34, size: 2, delay: -17 },
  { ring: 3, duration: 44, size: 2, delay: -29 },
];

export function ArmillarySphere() {
  const sceneRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const scene = sceneRef.current;
    if (!scene) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    // Pointer parallax: the whole instrument tilts toward the cursor, damped so
    // it feels heavy rather than twitchy.
    let frame = 0;
    let targetX = 0;
    let targetY = 0;
    let currentX = 0;
    let currentY = 0;

    const onMove = (event: PointerEvent) => {
      const nx = event.clientX / window.innerWidth - 0.5;
      const ny = event.clientY / window.innerHeight - 0.5;
      targetX = -ny * 15;
      targetY = nx * 19;
    };

    const tick = () => {
      currentX += (targetX - currentX) * 0.055;
      currentY += (targetY - currentY) * 0.055;
      scene.style.transform = `rotateX(${currentX.toFixed(2)}deg) rotateY(${currentY.toFixed(2)}deg)`;
      frame = window.requestAnimationFrame(tick);
    };

    window.addEventListener("pointermove", onMove, { passive: true });
    frame = window.requestAnimationFrame(tick);

    return () => {
      window.removeEventListener("pointermove", onMove);
      window.cancelAnimationFrame(frame);
    };
  }, []);

  return (
    <div
      aria-hidden
      className="pointer-events-none absolute inset-0 flex items-center justify-center [perspective:1700px] [transform:translateY(-9%)_scale(0.58)] sm:[transform:translateY(-9%)_scale(0.78)] lg:[transform:translateY(-9%)_scale(1)]"
    >
      {/* Corona — lights the room behind the headline */}
      <div className="absolute size-[46rem] rounded-full bg-[radial-gradient(circle,rgba(226,178,84,0.10)_18%,rgba(200,146,52,0.07)_40%,rgba(150,102,34,0.03)_58%,transparent_76%)] blur-[2px]" />

      {/* Rays — heat, not lines */}
      <div
        className="absolute size-[46rem] rounded-full opacity-[0.085]"
        style={{
          background:
            "repeating-conic-gradient(from 0deg, rgba(226,178,84,0.9) 0deg 0.5deg, transparent 0.5deg 9deg)",
          maskImage:
            "radial-gradient(circle, transparent 26%, black 44%, rgba(0,0,0,0.5) 58%, transparent 68%)",
          WebkitMaskImage:
            "radial-gradient(circle, transparent 26%, black 44%, rgba(0,0,0,0.5) 58%, transparent 68%)",
          animation: "sunRays 120s linear infinite",
        }}
      />

      <div
        ref={sceneRef}
        className="relative [transform-style:preserve-3d] will-change-transform"
      >
        {/* The sun, seen as an annular eclipse: a dark body with a blazing rim.
            Dark centre keeps the headline legible where it crosses the form. */}
        <div className="absolute left-1/2 top-1/2 size-[13.5rem] -translate-x-1/2 -translate-y-1/2 rounded-full">
          {/* Body */}
          <div className="absolute inset-0 rounded-full bg-[radial-gradient(circle_at_50%_48%,#070605_0%,#0b0906_58%,#1a1207_88%,#2a1c0a_100%)]" />
          {/* Rim ring — the light that spills past the body */}
          <div className="absolute inset-0 rounded-full border-[1.5px] border-[#ffdfa3] shadow-[0_0_10px_1px_rgba(255,223,163,0.75),0_0_40px_10px_rgba(240,200,119,0.35),0_0_120px_34px_rgba(226,178,84,0.16)]" />
          {/* A second, wider halo just outside the rim */}
          <div className="absolute -inset-[3px] rounded-full border border-[#e8bd6e]/25 blur-[2px]" />
          {/* Inner flare at the top-left, where the light comes from */}
          <div className="absolute inset-0 rounded-full bg-[radial-gradient(circle_at_32%_24%,rgba(240,200,119,0.16),transparent_46%)]" />
        </div>

        {RINGS.map((ring, index) => (
          // Tilt layer — fixed orientation of this ring's plane
          <div
            key={`tilt-${index}`}
            className="absolute left-0 top-0 [transform-style:preserve-3d]"
            style={{
              width: ring.size,
              height: ring.size,
              marginLeft: -ring.size / 2,
              marginTop: -ring.size / 2,
              transform: `rotateX(76deg) rotateY(${ring.tilt}deg)`,
            }}
          >
            {/* Spin layer — the ring itself, turning inside its plane */}
            <div
              className="relative size-full rounded-full border border-[#e8bd6e] will-change-transform"
              style={{
                opacity: ring.opacity,
                animation: `ringSpin ${Math.abs(ring.spin)}s linear infinite`,
                animationDirection: ring.spin < 0 ? "reverse" : "normal",
                boxShadow: "0 0 14px rgba(226,178,84,0.28)",
              }}
            >
              {MARKERS.filter((m) => m.ring === index).map((marker, mi) => (
                <span
                  key={mi}
                  className="absolute inset-0"
                  style={{
                    animation: `markerOrbit ${marker.duration}s linear infinite`,
                    animationDelay: `${marker.delay}s`,
                  }}
                >
                  <span
                    className="absolute left-1/2 top-0 rounded-full bg-[#ffe6b0]"
                    style={{
                      width: marker.size,
                      height: marker.size,
                      marginLeft: -marker.size / 2,
                      marginTop: -marker.size / 2,
                      boxShadow: "0 0 16px 4px rgba(226,178,84,0.85)",
                    }}
                  />
                </span>
              ))}
            </div>

            {/* Tick marks at the cardinal points of each ring */}
            {[0, 90, 180, 270].map((deg) => (
              <span
                key={deg}
                className="absolute left-1/2 top-1/2 size-[3px] rounded-full bg-[#e8bd6e]"
                style={{
                  opacity: ring.opacity + 0.2,
                  transform: `rotate(${deg}deg) translateY(${-ring.size / 2}px)`,
                }}
              />
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}
